import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { DEMO_PAPERS } from '../data/demoLibrary';

let seedingInProgress = false;
let seedingDone = false;

// Converts a Supabase row to a paper object usable by React components.
// Spreads all snake_case columns AND adds camelCase aliases so both work everywhere.
function mapPaper(row) {
  return {
    ...row,
    arxivId: row.arxiv_id,
    pdfUrl: row.pdf_url,
    citationCount: row.citation_count,
    isDemo: row.is_demo,
    addedAt: row.added_at,
    keyAdvantage: row.key_advantage,
    publicationDate: row.publication_date,
  };
}

export function useLibrary(userId) {
  const [library, setLibrary] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadLibrary = useCallback(async () => {
    if (!userId) {
      setLibrary([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('papers')
      .select('*')
      .eq('user_id', userId)
      .order('added_at', { ascending: false });
    if (!error && data) {
      setLibrary(data.map(mapPaper));
    } else if (error) {
      console.error('loadLibrary error:', error);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    loadLibrary();
  }, [loadLibrary]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel('papers-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'papers', filter: `user_id=eq.${userId}` },
        () => loadLibrary()
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [userId, loadLibrary]);

  const addPaper = useCallback(
    async (paper) => {
      if (!userId) return null;

      // Strip id — never send it, let Supabase generate a UUID
      const { id: _id, ...paperWithoutId } = paper;

      const dbPaper = {
        user_id: userId,
        title: paperWithoutId.title,
        authors: Array.isArray(paperWithoutId.authors)
          ? paperWithoutId.authors.slice(0, 3).map((a) => a.name || a).join(', ')
          : paperWithoutId.authors || null,
        year: paperWithoutId.year || null,
        tldr: paperWithoutId.tldr || null,
        concept: paperWithoutId.concept || null,
        oneliner: paperWithoutId.oneliner || null,
        findings: Array.isArray(paperWithoutId.mechanics)
          ? paperWithoutId.mechanics.map(m => m.name + ': ' + m.explanation).join('\n')
          : paperWithoutId.findings || null,
        key_advantage: paperWithoutId.keyAdvantage || paperWithoutId.key_advantage || null,
        results: paperWithoutId.results || null,
        figures: paperWithoutId.figures || null,
        keywords: paperWithoutId.keywords || [],
        source: paperWithoutId.source || 'upload',
        arxiv_id: paperWithoutId.arxivId || paperWithoutId.arxiv_id || null,
        doi: paperWithoutId.doi || null,
        bibtex_key: paperWithoutId.bibTexKey || paperWithoutId.bibtex_key || null,
        pdf_url: paperWithoutId.pdfUrl || paperWithoutId.pdf_url || null,
        abstract: paperWithoutId.abstract || null,
        summarized: paperWithoutId.summarized || false,
        citation_count: paperWithoutId.citationCount || paperWithoutId.citation_count || 0,
        is_demo: paperWithoutId.isDemo || paperWithoutId.is_demo || false,
        mode: paperWithoutId.mode || null,
        publication_date: paperWithoutId.publicationDate || paperWithoutId.publication_date || null,
      };

      const titleLower = dbPaper.title?.toLowerCase().trim();

      const existing = library.find((p) =>
        p.title?.toLowerCase().trim() === titleLower
      );
      if (existing) {
        console.log('Paper already exists:', dbPaper.title);
        return existing;
      }

      const { data: dbExisting } = await supabase
        .from('papers')
        .select('id, title')
        .eq('user_id', userId)
        .ilike('title', titleLower)
        .limit(1);

      if (dbExisting && dbExisting.length > 0) {
        console.log('Paper exists in DB:', dbPaper.title);
        return dbExisting[0];
      }

      console.log('addPaper inserting to Supabase:', dbPaper.title);
      const { data, error } = await supabase.from('papers').insert(dbPaper).select().single();
      console.log('Supabase result:', data, error);

      if (error) {
        console.error('Supabase insert error:', error);
        return null;
      }
      if (data) {
        const newPaper = mapPaper(data);
        setLibrary((prev) => [newPaper, ...prev]);
        return newPaper;
      }
      return null;
    },
    [userId, library]
  );

  const updatePaper = useCallback(
    async (id, patch) => {
      if (!userId) return;
      const current = library.find((p) => p.id === id);
      if (!current) return;
      const merged = { ...current, ...patch };

      // Build update payload — no id in the body
      const dbUpdate = {
        title: merged.title,
        authors: merged.authors || null,
        year: merged.year || null,
        tldr: merged.tldr || null,
        concept: merged.concept || null,
        oneliner: merged.oneliner || null,
        findings: merged.findings || null,
        key_advantage: merged.key_advantage || merged.keyAdvantage || null,
        results: merged.results || null,
        figures: merged.figures || null,
        keywords: merged.keywords || [],
        source: merged.source || null,
        arxiv_id: merged.arxivId || merged.arxiv_id || null,
        pdf_url: merged.pdfUrl || merged.pdf_url || null,
        abstract: merged.abstract || null,
        summarized: merged.summarized || false,
        citation_count: merged.citationCount || merged.citation_count || 0,
        mode: merged.mode || null,
      };

      const { error } = await supabase
        .from('papers')
        .update(dbUpdate)
        .eq('id', id)
        .eq('user_id', userId);
      if (error) {
        console.error('updatePaper error:', error);
        return;
      }
      setLibrary((prev) => prev.map((p) => (p.id === id ? { ...p, ...merged } : p)));
    },
    [userId, library]
  );

  const removePaper = useCallback(
    async (id) => {
      if (!userId) return;
      const { error } = await supabase.from('papers').delete().eq('id', id).eq('user_id', userId);
      if (error) {
        console.error('removePaper error:', error);
        return;
      }
      setLibrary((prev) => prev.filter((p) => p.id !== id));
    },
    [userId]
  );

  const seedDemoIfNeeded = useCallback(async () => {
    if (!userId) return;
    if (seedingInProgress || seedingDone) return;
    seedingInProgress = true;

    async function fetchAndStoreAbstracts(papers) {
      for (const paper of papers) {
        const arxivId = paper.arxiv_id || paper.arxivId;
        if (!arxivId || paper.abstract) continue;

        try {
          const res = await fetch(
            `https://export.arxiv.org/api/query?id_list=${arxivId}`
          );
          const xml = await res.text();
          const parser = new DOMParser();
          const doc = parser.parseFromString(xml, 'text/xml');
          const abstract = doc.querySelector('entry > summary')
            ?.textContent
            ?.trim()
            ?.replace(/\s+/g, ' ');

          if (abstract && abstract.length > 100) {
            await supabase
              .from('papers')
              .update({ abstract })
              .eq('id', paper.id)
              .eq('user_id', userId);
            console.log('Abstract stored for:', paper.title?.slice(0, 30));
          }
        } catch (e) {
          console.warn('Abstract fetch failed for:', arxivId, e.message);
        }

        await new Promise((r) => setTimeout(r, 500));
      }
    }

    try {
      const { count } = await supabase
        .from('papers')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_demo', true);

      if (count > 0) {
        seedingDone = true;
        return;
      }

      const papersToInsert = DEMO_PAPERS.map((p) => {
        const { id, addedAt, arxivId, pdfUrl, citationCount, isDemo, keyAdvantage, ...rest } = p;
        return {
          ...rest,
          user_id: userId,
          is_demo: true,
          arxiv_id: arxivId || p.arxiv_id,
          pdf_url: pdfUrl || p.pdf_url,
          citation_count: citationCount || 0,
          key_advantage: keyAdvantage || p.key_advantage,
          abstract: p.abstract || '',
        };
      });

      const { data, error } = await supabase
        .from('papers')
        .upsert(papersToInsert, { onConflict: 'user_id,title', ignoreDuplicates: true })
        .select();

      if (error) {
        console.error('Seed error:', error);
        return;
      }

      seedingDone = true;
      if (data && data.length > 0) {
        setLibrary((prev) => [...data.map(mapPaper), ...prev]);
        console.log('Demo papers seeded:', data.length);
        fetchAndStoreAbstracts(data);
      }
    } finally {
      seedingInProgress = false;
    }
  }, [userId]);

  return { library, loading, loadLibrary, addPaper, updatePaper, removePaper, seedDemoIfNeeded };
}
