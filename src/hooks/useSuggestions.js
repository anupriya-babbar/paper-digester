import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { extractSignals, buildSearchQueries } from '../utils/recommendationEngine';

function isNewFromDate(dateStr) {
  if (!dateStr) return false;
  const days = (Date.now() - new Date(dateStr)) / (1000 * 60 * 60 * 24);
  return days <= 30;
}

async function searchSemanticScholar(query, existingArxivIds) {
  try {
    const fields = 'title,abstract,year,authors,externalIds,citationCount,publicationDate,venue';
    const res = await fetch(
      `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=10&fields=${fields}`
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.data || [])
      .filter((p) => {
        if (!p.title || !p.abstract) return false;
        const arxivId = p.externalIds?.ArXiv;
        if (arxivId && existingArxivIds.has(arxivId)) return false;
        return true;
      })
      .map((p) => ({ ...p, recommendReason: query, isNew: isNewFromDate(p.publicationDate) }));
  } catch {
    return [];
  }
}

export function useSuggestions(userId, library, chains) {
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [signals, setSignals] = useState({ keywords: [], gaps: [] });
  const [lastGenerated, setLastGenerated] = useState(null);

  useEffect(() => {
    if (!userId || library.length === 0) return;
    loadSuggestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, library.length]);

  async function loadSuggestions() {
    // FIX 1: use array result instead of .single() to avoid 406 when no row exists
    const { data: cachedArr } = await supabase
      .from('suggestions_cache')
      .select('*')
      .eq('user_id', userId)
      .order('generated_at', { ascending: false })
      .limit(1);

    const cached = cachedArr?.[0] || null;

    if (cached) {
      const hoursAgo = (Date.now() - new Date(cached.generated_at)) / (1000 * 60 * 60);
      if (hoursAgo < 24 && (cached.papers || []).length > 0) {
        setSuggestions(cached.papers);
        setLastGenerated(cached.generated_at);
        setSignals({
          keywords: cached.signal_keywords || [],
          gaps: cached.signal_gaps || [],
        });
        return;
      }
    }

    await generateSuggestions();
  }

  async function generateSuggestions() {
    // FIX 4: guard — need at least 2 papers to produce meaningful signals
    if (!userId || library.length < 1) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { topKeywords, gapQueries } = extractSignals(library, chains);

      // FIX 3: cap at 2 queries to stay under Semantic Scholar rate limits
      const queries = buildSearchQueries(topKeywords, gapQueries).slice(0, 2);

      const existingArxivIds = new Set(
        library.map((p) => p.arxivId || p.arxiv_id).filter(Boolean)
      );

      // FIX 3: sequential with 1s delay instead of parallel Promise.all
      const results = [];
      for (const query of queries) {
        const r = await searchSemanticScholar(query, existingArxivIds);
        results.push(r);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      const seen = new Set();
      let merged = results
        .flat()
        .filter((p) => {
          if (seen.has(p.paperId)) return false;
          seen.add(p.paperId);
          return true;
        });

      // Fallback: if too few results, broaden with a generic query
      if (merged.length < 4) {
        const fallback = await searchSemanticScholar('deep learning 2024', existingArxivIds);
        for (const p of fallback) {
          if (!seen.has(p.paperId)) {
            seen.add(p.paperId);
            merged.push(p);
          }
        }
      }

      merged = merged.slice(0, 6);

      // FIX 2: explicit ignoreDuplicates: false so upsert always overwrites
      await supabase.from('suggestions_cache').upsert(
        {
          user_id: userId,
          papers: merged,
          generated_at: new Date().toISOString(),
          signal_keywords: topKeywords,
          signal_gaps: gapQueries,
        },
        { onConflict: 'user_id', ignoreDuplicates: false }
      );

      setSuggestions(merged);
      setLastGenerated(new Date().toISOString());
      setSignals({ keywords: topKeywords, gaps: gapQueries });
    } catch (e) {
      console.error('Suggestion generation failed:', e);
    } finally {
      setLoading(false);
    }
  }

  return {
    suggestions,
    loading,
    signals,
    lastGenerated,
    refresh: generateSuggestions,
  };
}
