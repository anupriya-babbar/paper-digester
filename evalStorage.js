// src/utils/evalStorage.js
// Persists eval results to Supabase eval_results table.
// Falls back to localStorage if Supabase fails (e.g. network, RLS issue).
//
// Supabase table used:
//   eval_results (id, user_id, eval_type, target_id, target_title, results JSONB, created_at)
//
// NOTE: If you get upsert conflicts, run this in Supabase SQL editor:
//   ALTER TABLE eval_results ADD CONSTRAINT eval_results_user_target_type_unique
//   UNIQUE (user_id, target_id, eval_type);

import { supabase } from '../supabaseClient'; // adjust path if yours differs

const LS_PREFIX = 'pd-eval-v2';

// ─────────────────────────────────────────────
// WRITE
// ─────────────────────────────────────────────

/**
 * Save (or overwrite) an eval result for a paper or chain.
 * evalType: 'summary' | 'chain'
 * targetId: paper.id or chain.id (UUID string)
 */
export async function saveEvalResult(userId, evalType, targetId, targetTitle, results) {
  const payload = {
    user_id: userId,
    eval_type: evalType,
    target_id: targetId,
    target_title: targetTitle,
    results,
    created_at: new Date().toISOString(),
  };

  try {
    // Delete existing record first (avoids needing a DB unique constraint)
    await supabase
      .from('eval_results')
      .delete()
      .match({ user_id: userId, eval_type: evalType, target_id: targetId });

    const { error } = await supabase.from('eval_results').insert(payload);
    if (error) throw error;

    return { success: true, storage: 'supabase' };
  } catch (err) {
    console.warn('[evalStorage] Supabase save failed, using localStorage:', err.message);
    try {
      const key = `${LS_PREFIX}:${evalType}:${targetId}`;
      localStorage.setItem(key, JSON.stringify(payload));
      return { success: true, storage: 'localStorage' };
    } catch (lsErr) {
      console.error('[evalStorage] localStorage also failed:', lsErr);
      return { success: false, error: err.message };
    }
  }
}

// ─────────────────────────────────────────────
// READ — single record
// ─────────────────────────────────────────────

/**
 * Get the latest eval result for one paper or chain.
 * Returns the results JSONB object, or null if not found.
 */
export async function getEvalResult(userId, evalType, targetId) {
  try {
    const { data, error } = await supabase
      .from('eval_results')
      .select('results, created_at')
      .eq('user_id', userId)
      .eq('eval_type', evalType)
      .eq('target_id', targetId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error) throw error;
    return data?.results || null;
  } catch {
    // Try localStorage fallback
    try {
      const key = `${LS_PREFIX}:${evalType}:${targetId}`;
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw).results : null;
    } catch {
      return null;
    }
  }
}

// ─────────────────────────────────────────────
// READ — all records (for Overview tab)
// ─────────────────────────────────────────────

/**
 * Get all eval results for the current user.
 * Used by the Overview tab to compute aggregate stats.
 */
export async function getAllEvalResults(userId) {
  try {
    const { data, error } = await supabase
      .from('eval_results')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.warn('[evalStorage] getAllEvalResults Supabase failed:', err.message);

    // Reconstruct from localStorage (best-effort)
    const results = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(LS_PREFIX)) {
        try {
          results.push(JSON.parse(localStorage.getItem(key)));
        } catch {}
      }
    }
    return results;
  }
}

// ─────────────────────────────────────────────
// AGGREGATION (for Overview tab)
// ─────────────────────────────────────────────

/**
 * Compute aggregate stats from all eval results.
 * Returns: { avgSummary, avgChain, needsAttention[], summaryCount, chainCount }
 */
export function computeOverviewStats(allResults) {
  const summaryRecords = allResults.filter(r => r.eval_type === 'summary');
  const chainRecords = allResults.filter(r => r.eval_type === 'chain');

  return {
    summaryCount: summaryRecords.length,
    chainCount: chainRecords.length,
    avgSummary: summaryRecords.length ? _avgDimensions(summaryRecords) : null,
    avgChain: chainRecords.length ? _avgDimensions(chainRecords) : null,
    needsAttention: summaryRecords
      .filter(r => typeof r.results?.overall === 'number' && r.results.overall < 70)
      .map(r => ({
        title: r.target_title,
        score: r.results.overall,
        weakest: _weakestDimension(r.results),
      })),
  };
}

function _avgDimensions(records) {
  // Collect all numeric keys across records
  const allKeys = new Set(
    records.flatMap(r => Object.keys(r.results || {}).filter(k => typeof r.results[k] === 'number'))
  );

  const avg = {};
  for (const key of allKeys) {
    const scores = records
      .map(r => r.results?.[key])
      .filter(v => typeof v === 'number' && !isNaN(v));
    if (scores.length) {
      avg[key] = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    }
  }
  return avg;
}

function _weakestDimension(results) {
  if (!results) return null;
  const dims = Object.entries(results).filter(
    ([k, v]) => k !== 'overall' && typeof v === 'number' && !isNaN(v)
  );
  if (!dims.length) return null;
  return dims.reduce((a, b) => (a[1] <= b[1] ? a : b))[0];
}
