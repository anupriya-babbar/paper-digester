// src/utils/freeChecks.js
// Rule-based checks — zero LLM cost, run synchronously.
// These complement LLM judges and catch things no prompt can reliably handle:
// exact number matching, keyword presence, length ratios, citation density.

// ─────────────────────────────────────────────
// SUMMARY FREE CHECKS
// ─────────────────────────────────────────────

/**
 * What % of the paper's stored keywords appear in the summary text?
 * Low score = summary missed the paper's own topic labels.
 */
export function keywordCoverage(keywords, summaryText) {
  console.log('[freeChecks] keywordCoverage called with:', keywords?.length, 'keywords,', summaryText?.length, 'chars');
  if (!keywords?.length || !summaryText) return null;
  const text = summaryText.toLowerCase();
  const found = keywords.filter(kw => text.includes(kw.toLowerCase()));
  const missing = keywords.filter(kw => !text.includes(kw.toLowerCase()));
  const score = Math.round((found.length / keywords.length) * 100);
  return { total: keywords.length, found: found.length, missing, score };
}

/**
 * Do the specific numbers in the abstract appear in the summary?
 * Hallucination signal — if abstract says "92.1% accuracy" and summary says
 * "over 90% accuracy", the exact number is missing.
 */
export function numberPreservation(abstract, summaryText) {
  if (!abstract || !summaryText) return null;

  // Match percentages, decimals, and integers ≥ 2 digits (ignore single digits like "a 5-layer...")
  const numRegex = /\b(\d{2,}\.?\d*%?|\d+\.\d+%?)\b/g;
  const abstractNums = [...new Set(abstract.match(numRegex) || [])];

  if (!abstractNums.length) return { score: null, reason: 'No significant numbers in abstract' };

  const found = abstractNums.filter(n => summaryText.includes(n));
  const missing = abstractNums.filter(n => !summaryText.includes(n));
  const score = Math.round((found.length / abstractNums.length) * 100);

  return { total: abstractNums.length, found: found.length, missing, score };
}

/**
 * TL;DR sanity check — should be shorter than the abstract it summarises.
 * Only meaningful for tldr mode.
 */
export function lengthSanity(mode, summaryText, abstractText) {
  if (mode !== 'tldr' || !summaryText || !abstractText) return null;
  const summaryWords = summaryText.trim().split(/\s+/).length;
  const abstractWords = abstractText.trim().split(/\s+/).length;
  const passes = summaryWords < abstractWords;
  return {
    summaryWords,
    abstractWords,
    passes,
    score: passes ? 100 : Math.max(0, 100 - Math.round(((summaryWords - abstractWords) / abstractWords) * 100)),
    reason: passes
      ? `TL;DR (${summaryWords}w) is shorter than abstract (${abstractWords}w) ✓`
      : `TL;DR (${summaryWords}w) is longer than the abstract (${abstractWords}w)`,
  };
}

// ─────────────────────────────────────────────
// CHAIN FREE CHECKS
// ─────────────────────────────────────────────

/**
 * Citation density — what % of sentences in the chain text carry a [Pn: year] chip?
 * Low density means the model made uncited claims.
 */
export function citationDensity(chainText) {
  if (!chainText) return null;
  const sentences = chainText.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 10);
  if (!sentences.length) return null;

  const cited = sentences.filter(s => /\[P\d+:\s*\d{4}\]/.test(s));
  const density = Math.round((cited.length / sentences.length) * 100);

  return {
    totalSentences: sentences.length,
    citedSentences: cited.length,
    density,
    score: density,
    rating: density >= 70 ? 'high' : density >= 40 ? 'medium' : 'low',
  };
}

// ─────────────────────────────────────────────
// PARSING HELPERS (used by useEval.js)
// ─────────────────────────────────────────────

/**
 * Extract every [Pn: year] chip with its surrounding sentence (the "claim").
 * Returns deduplicated list so the same chip in different sentences is preserved.
 */
export function extractCitationClaims(text) {
  console.log('[freeChecks] extractCitationClaims input length:', text?.length);
  console.log('[freeChecks] first 200 chars:', text?.slice(0, 200));
  if (!text) return [];
  const chipRegex = /\[P(\d+):\s*(\d{4})\]/g;
  const claims = [];

  // Split on sentence boundaries (keep delimiter)
  const sentences = text.match(/[^.!?]*[.!?]+/g) || [text];

  for (const sentence of sentences) {
    const chips = [...sentence.matchAll(/(?:\[P(\d+):\s*(\d{4})\]|P(\d+)\s*\[(\d{4})\])/g)]
      .map(m => ({
        num: parseInt(m[1] || m[3], 10),
        year: m[2] || m[4],
        chip: m[0],
      }));
    for (const chip of chips) {
      claims.push({
        paperNum: chip.num,
        year: chip.year,
        claim: sentence.trim(),
        chip: chip.chip,
      });
    }
  }

  return claims;
}

/**
 * Extract sentences from the contradictions string that involve ≥2 papers.
 * These are the pairs we'll validate with the judge.
 */
export function extractContradictionPairs(contradictionsText) {
  if (!contradictionsText) return [];
  const sentences = contradictionsText.match(/[^.!?]*[.!?]+/g) || [];

  return sentences
    .map(s => {
      const chips = [...s.matchAll(/(?:\[P(\d+):\s*(\d{4})\]|P(\d+)\s*\[(\d{4})\])/g)]
        .map(m => ({ num: parseInt(m[1] || m[3], 10), year: m[2] || m[4] }));
      return {
        text: s.trim(),
        papers: chips,
      };
    })
    .filter(item => item.papers.length >= 2);
}

// ─────────────────────────────────────────────
// AGGREGATION
// ─────────────────────────────────────────────

/**
 * Average the numeric scores across all free-check results.
 * Null/undefined scores are skipped (not penalised).
 */
export function aggregateFreeChecks(checks) {
  const scores = Object.values(checks)
    .map(c => c?.score)
    .filter(s => s !== null && s !== undefined && !isNaN(s));
  if (!scores.length) return null;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}
