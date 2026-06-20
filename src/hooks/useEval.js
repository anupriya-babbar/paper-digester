// src/hooks/useEval.js
// Primary eval hook. Exposes two functions:
//   runSummaryEval(paper, userId)  → scores a single paper summary
//   runChainEval(chain, papers, userId) → scores a chain synthesis
//
// Each function:
//   1. Runs LLM judge checks via /api/judge
//   2. Runs free rule-based checks (zero cost)
//   3. Combines into overall score (LLM 70% + free 30%)
//   4. Saves to Supabase via evalStorage
//   5. Returns the full results object

import { useCallback } from 'react';
import {
  faithfulnessPrompt,
  coveragePrompt,
  modeFidelityPrompt,
  citationGroundingPrompt,
  contradictionRealityPrompt,
  gapNoveltyPrompt,
  synthesisQualityPrompt,
} from '../prompts/evalPrompts';
import {
  keywordCoverage,
  numberPreservation,
  lengthSanity,
  citationDensity,
  extractCitationClaims,
  extractContradictionPairs,
  aggregateFreeChecks,
} from '../utils/freeChecks';
import { saveEvalResult } from '../utils/evalStorage';

// ─────────────────────────────────────────────
// INTERNAL HELPERS
// ─────────────────────────────────────────────

/** Single call to /api/judge. Returns result object or null on failure. */
async function callJudge(evalType, prompt) {
  try {
    const res = await fetch('/api/judge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ evalType, payload: { prompt } }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.result?.error ? null : (data.result ?? null);
  } catch {
    return null;
  }
}

/**
 * Extract the best readable text from a paper's stored fields.
 * Papers from Supabase have: tldr, oneliner, concept, findings,
 * key_advantage, results, figures, abstract. Mode stored in `mode` field.
 */
function extractSummaryText(paper) {
  // Try to get mode-specific primary field first
  const mode = paper.mode || 'full';
  const parts = [];

  if (mode === 'tldr' && paper.tldr) {
    return paper.tldr; // TL;DR is a single text field
  }

  // For all modes, concatenate available text fields in logical reading order
  if (paper.oneliner) parts.push(paper.oneliner);
  if (paper.concept)  parts.push(paper.concept);
  if (paper.findings) parts.push(paper.findings);
  if (paper.key_advantage) parts.push(paper.key_advantage);
  if (paper.results)  parts.push(paper.results);
  if (paper.figures)  parts.push(paper.figures);
  if (paper.tldr)     parts.push(paper.tldr);

  return parts.filter(Boolean).join(' ');
}

/** Build the "P1 (2017) — Title:\nSummary text" block used in multi-paper prompts */
function buildPaperBlock(num, paper) {
  const text = extractSummaryText(paper);
  return `P${num} (${paper.year}) — ${paper.title}:\n${text}`;
}

/** Safe average of numeric values, ignoring nulls/NaN */
function safeAvg(values) {
  const valid = values.filter(v => typeof v === 'number' && !isNaN(v));
  if (!valid.length) return null;
  return Math.round(valid.reduce((a, b) => a + b, 0) / valid.length);
}

// ─────────────────────────────────────────────
// HOOK
// ─────────────────────────────────────────────

export function useEval() {

  // ── SUMMARY EVAL ──────────────────────────

  const runSummaryEval = useCallback(async (paper, userId) => {
    console.log('[useEval] runSummaryEval called', {
      paperId: paper?.id,
      mode: paper?.mode,
      hasAbstract: !!(paper?.abstract),
      abstractLength: paper?.abstract?.length,
      oneliner: paper?.oneliner?.length,
      concept: paper?.concept?.length,
      findings: paper?.findings?.length,
      results: paper?.results?.length,
      tldr: paper?.tldr?.length,
      keywords: paper?.keywords?.length,
    });

    const summaryText = extractSummaryText(paper);
    const abstract    = paper.abstract || '';
    const mode        = paper.mode || 'full';
    const hasAbstract = abstract.length > 50; // need something meaningful

    console.log('[useEval] summaryText length:', summaryText?.length, 'hasAbstract:', hasAbstract);

    // Run LLM checks in parallel where possible
    // faithfulness + coverage need abstract; modeFidelity doesn't
    const [faithfulness, coverage, modeFidelity] = await Promise.all([
      hasAbstract
        ? callJudge('faithfulness', faithfulnessPrompt(abstract, summaryText))
        : Promise.resolve(null),
      hasAbstract
        ? callJudge('coverage', coveragePrompt(abstract, summaryText))
        : Promise.resolve(null),
      summaryText
        ? callJudge('modeFidelity', modeFidelityPrompt(mode, summaryText))
        : Promise.resolve(null),
    ]);

    // Free checks (synchronous, zero cost)
    console.log('[useEval] keywords:', paper?.keywords, 'type:', typeof paper?.keywords);
    const keywords = Array.isArray(paper.keywords)
      ? paper.keywords
      : (typeof paper.keywords === 'string' ? JSON.parse(paper.keywords || '[]') : []);

    const summaryTextForFree = summaryText || '';
    const abstractForFree = abstract || '';

    const freeChecks = {
      keywordCoverage: keywords.length > 0
        ? keywordCoverage(keywords, summaryTextForFree)
        : null,
      numberPreservation: abstractForFree.length > 50
        ? numberPreservation(abstractForFree, summaryTextForFree)
        : null,
      lengthSanity: mode === 'tldr' && abstractForFree.length > 0
        ? lengthSanity(mode, summaryTextForFree, abstractForFree)
        : null,
    };

    console.log('[useEval] freeChecks:', freeChecks);
    console.log('[useEval] keywords used:', keywords);
    const freeScore = aggregateFreeChecks(freeChecks);

    // Combined overall: LLM dims 70%, free checks 30%
    const llmScore = safeAvg([
      faithfulness?.score ?? null,
      coverage?.score ?? null,
      modeFidelity?.score ?? null,
    ]);

    let overall = null;
    if (llmScore !== null && freeScore !== null) {
      overall = Math.round(llmScore * 0.7 + freeScore * 0.3);
    } else if (llmScore !== null) {
      overall = llmScore;
    } else if (freeScore !== null) {
      overall = freeScore;
    }

    const results = {
      // Overall
      overall,
      hasAbstract,
      mode,
      evaluatedAt: new Date().toISOString(),

      // LLM dimensions
      faithfulness:         faithfulness?.score ?? null,
      faithfulnessIssues:   faithfulness?.issues || [],
      coverage:             coverage?.score ?? null,
      mainContribution:     coverage?.mainContribution || null,
      coverageCovered:      coverage?.covered ?? null,
      coverageReason:       coverage?.reason || null,
      modeFidelity:         modeFidelity?.score ?? null,
      modeFidelityIssues:   modeFidelity?.issues || [],
      modeFidelityDetail:   modeFidelity || null,

      // Free checks
      freeScore,
      freeChecks,
    };

    if (userId) {
      await saveEvalResult(userId, 'summary', paper.id, paper.title, results);
    }

    return results;
  }, []);

  // ── CHAIN EVAL ────────────────────────────

  const runChainEval = useCallback(async (chain, papers, userId) => {
    const synthesis = chain.synthesis;
    if (!synthesis) return null;

    // Build paper lookup: 1-based index → paper object (matching chain.paper_ids order)
    const paperLookup = {};
    (chain.paper_ids || []).forEach((id, idx) => {
      const paper = papers.find(p => p.id === id);
      if (paper) paperLookup[idx + 1] = paper;
    });

    const allSummariesText = Object.entries(paperLookup)
      .map(([num, p]) => buildPaperBlock(num, p))
      .join('\n\n---\n\n');

    // ── Citation Grounding ─────────────────
    // Extract claim+chip pairs from evolution + agreements (most cited sections)
    const rawClaims = [
      ...extractCitationClaims(synthesis.evolution || ''),
      ...extractCitationClaims(synthesis.agreements || ''),
    ];

    // Deduplicate by claim text, cap at 5 to limit API calls
    const seen = new Set();
    const citationClaims = rawClaims
      .filter(c => { const k = c.claim; return seen.has(k) ? false : seen.add(k); })
      .slice(0, 5);

    const citationResults = await Promise.all(
      citationClaims.map(({ paperNum, year, claim }) => {
        const paper = paperLookup[paperNum];
        if (!paper) return Promise.resolve(null);
        return callJudge('citationGrounding',
          citationGroundingPrompt(paperNum, year, extractSummaryText(paper), claim)
        );
      })
    );

    const validCitations = citationResults.filter(r => r !== null);
    const citationScore = validCitations.length
      ? Math.round(validCitations.reduce((a, r) => a + (r.grounded ? 100 : 0), 0) / validCitations.length)
      : null;

    // ── Contradiction Reality ──────────────
    const contradictionPairs = extractContradictionPairs(synthesis.contradictions || '').slice(0, 3);

    const contradictionResults = await Promise.all(
      contradictionPairs.map(({ text, papers: chipPapers }) => {
        if (chipPapers.length < 2) return Promise.resolve(null);
        const [pa, pb] = chipPapers;
        const paperA = paperLookup[pa.num];
        const paperB = paperLookup[pb.num];
        if (!paperA || !paperB) return Promise.resolve(null);
        return callJudge('contradictionReality',
          contradictionRealityPrompt(
            extractSummaryText(paperA), `P${pa.num} (${pa.year})`,
            extractSummaryText(paperB), `P${pb.num} (${pb.year})`,
            text
          )
        );
      })
    );

    const validContradictions = contradictionResults.filter(r => r !== null);
    const contradictionScore = validContradictions.length
      ? Math.round(validContradictions.reduce((a, r) => a + (r.valid ? 100 : 0), 0) / validContradictions.length)
      : null;

    // ── Gap Novelty ────────────────────────
    const gaps = Array.isArray(synthesis.gaps) ? synthesis.gaps.slice(0, 3) : [];

    const gapResults = await Promise.all(
      gaps.map(({ gap, suggestedApproach }) =>
        callJudge('gapNovelty', gapNoveltyPrompt(allSummariesText, gap, suggestedApproach || ''))
      )
    );

    const validGaps = gapResults.filter(r => r !== null);
    const gapScore = validGaps.length
      ? Math.round(validGaps.reduce((a, r) => a + (r.novel ? 100 : 0), 0) / validGaps.length)
      : null;

    // ── Synthesis Quality ──────────────────
    const synthesisQualResult = synthesis.keyInsight
      ? await callJudge('synthesisQuality',
          synthesisQualityPrompt(allSummariesText, synthesis.keyInsight)
        )
      : null;
    const synthesisScore = synthesisQualResult?.score ?? null;

    // ── Free Check: Citation Density ───────
    const evolutionDensity   = citationDensity(synthesis.evolution || '');
    const agreementsDensity  = citationDensity(synthesis.agreements || '');
    const densityScore = safeAvg([evolutionDensity?.score, agreementsDensity?.score]);

    // ── Overall ────────────────────────────
    const overall = safeAvg([citationScore, contradictionScore, gapScore, synthesisScore]);

    const results = {
      overall,
      evaluatedAt: new Date().toISOString(),

      // LLM dimensions
      citationGrounding:     citationScore,
      citationDetails:       validCitations,
      citationsChecked:      validCitations.length,

      contradictionReality:  contradictionScore,
      contradictionDetails:  validContradictions,
      contradictionsChecked: validContradictions.length,

      gapNovelty:            gapScore,
      gapDetails:            validGaps,
      gapsChecked:           validGaps.length,

      synthesisQuality:      synthesisScore,
      synthesisReason:       synthesisQualResult?.reason || null,

      // Free check
      citationDensity:       densityScore,
      citationDensityDetail: {
        evolution:  evolutionDensity,
        agreements: agreementsDensity,
      },
    };

    if (userId) {
      await saveEvalResult(userId, 'chain', chain.id, chain.name, results);
    }

    return results;
  }, []);

  return { runSummaryEval, runChainEval };
}
