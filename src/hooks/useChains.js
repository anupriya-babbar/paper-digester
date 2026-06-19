import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

let chainSeedingInProgress = false;
let chainSeedingDone = false;

const DEMO_CHAIN_TEMPLATE = {
  name: 'Neural Network Evolution',
  isDemo: true,
};

function isValidUUID(str) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

function rowToChain(row) {
  return {
    id: row.id,
    name: row.name,
    paperIds: row.paper_ids ?? [],
    synthesis: row.synthesis ?? null,
    isDemo: row.is_demo,
    createdAt: row.created_at,
  };
}

export function useChains(userId) {
  const [chains, setChains] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadChains = useCallback(async () => {
    if (!userId) {
      setChains([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('chains')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (!error && data) setChains(data.map(rowToChain));
    else if (error) console.error('loadChains error:', error);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    loadChains();
  }, [loadChains]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel('chains-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chains', filter: `user_id=eq.${userId}` },
        () => loadChains()
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [userId, loadChains]);

  const saveChain = useCallback(
    async (chain) => {
      if (!userId) return null;

      const existing = chains.find((c) => c.id === chain.id);

      if (existing && isValidUUID(chain.id)) {
        // Update — chain already has a Supabase-generated UUID
        const { data, error } = await supabase
          .from('chains')
          .update({
            name: chain.name,
            paper_ids: chain.paperIds || chain.paper_ids || [],
            synthesis: chain.synthesis || null,
          })
          .eq('id', chain.id)
          .eq('user_id', userId)
          .select()
          .single();
        if (error) {
          console.error('saveChain update error:', error);
          return null;
        }
        if (data) {
          const saved = rowToChain(data);
          setChains((prev) => prev.map((c) => (c.id === chain.id ? saved : c)));
          return saved;
        }
        return null;
      } else {
        // Insert — no id, let Supabase generate UUID
        const { data, error } = await supabase
          .from('chains')
          .insert({
            user_id: userId,
            name: chain.name || 'Untitled Chain',
            paper_ids: chain.paperIds || chain.paper_ids || [],
            synthesis: chain.synthesis || null,
            is_demo: chain.isDemo || chain.is_demo || false,
          })
          .select()
          .single();
        if (error) {
          console.error('saveChain insert error:', error);
          return null;
        }
        if (data) {
          const saved = rowToChain(data);
          setChains((prev) => [saved, ...prev]);
          return saved;
        }
        return null;
      }
    },
    [userId, chains]
  );

  const deleteChain = useCallback(
    async (id) => {
      if (!userId) return;
      const { error } = await supabase.from('chains').delete().eq('id', id).eq('user_id', userId);
      if (error) {
        console.error('deleteChain error:', error);
        return;
      }
      setChains((prev) => prev.filter((c) => c.id !== id));
    },
    [userId]
  );

  const seedDemoChainIfNeeded = useCallback(async () => {
    if (!userId) return;
    if (chainSeedingInProgress || chainSeedingDone) return;
    chainSeedingInProgress = true;

    try {
      const { data: demoPapers } = await supabase
        .from('papers')
        .select('id')
        .eq('user_id', userId)
        .eq('is_demo', true);

      if (!demoPapers || demoPapers.length < 5) {
        console.log('Not enough demo papers yet:', demoPapers?.length ?? 0);
        return;
      }

      const demoPaperIds = demoPapers.map((p) => p.id);

      const { data: existing } = await supabase
        .from('chains')
        .select('id, paper_ids, name')
        .eq('user_id', userId)
        .eq('is_demo', true)
        .limit(1);

      if (existing && existing.length > 0) {
        const chain = existing[0];
        const currentIds = chain.paper_ids || [];
        if (currentIds.length === 0) {
          console.log('Updating demo chain with paper ids:', demoPaperIds);
          await supabase
            .from('chains')
            .update({ paper_ids: demoPaperIds })
            .eq('id', chain.id)
            .eq('user_id', userId);
        }
        chainSeedingDone = true;
        return;
      }

      const { data: chain, error } = await supabase
        .from('chains')
        .insert({
          user_id: userId,
          name: DEMO_CHAIN_TEMPLATE.name,
          paper_ids: demoPaperIds,
          synthesis: null,
          is_demo: true,
        })
        .select()
        .single();

      if (error) {
        console.error('seedDemoChainIfNeeded error:', error);
        return;
      }

      chainSeedingDone = true;
      if (chain) {
        setChains((prev) => [rowToChain(chain), ...prev]);
        console.log('Demo chain created with', demoPaperIds.length, 'papers');
      }
    } finally {
      chainSeedingInProgress = false;
    }
  }, [userId]);

  return { chains, loading, loadChains, saveChain, deleteChain, seedDemoChainIfNeeded };
}
