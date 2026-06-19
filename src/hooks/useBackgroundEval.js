import { useCallback, useRef } from 'react';
import { saveSummaryEval, saveChainEval } from '../utils/sessionEval';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function useBackgroundEval() {
  const runningRef = useRef(new Set());

  const runSummaryEval = useCallback(async (paper, onComplete) => {
    if (!paper?.id) return;
    if (runningRef.current.has(paper.id)) return;
    runningRef.current.add(paper.id);

    try {
      const summaryText = [
        paper.oneliner,
        paper.tldr,
        paper.concept,
        paper.findings,
        paper.key_advantage || paper.keyAdvantage,
        paper.results,
      ].filter(Boolean).join('\n\n');

      if (!summaryText || summaryText.length < 100) return;

      const questions = [
        {
          id: 'problem',
          prompt: `Research paper summary:\n"${summaryText.slice(0, 2000)}"\n\nDoes this summary clearly state what problem this paper solves?\nScore 0-100. Reply with ONLY a number.`,
        },
        {
          id: 'approach',
          prompt: `Research paper summary:\n"${summaryText.slice(0, 2000)}"\n\nDoes this summary describe the approach or method used?\nScore 0-100. Reply with ONLY a number.`,
        },
        {
          id: 'results',
          prompt: `Research paper summary:\n"${summaryText.slice(0, 2000)}"\n\nDoes this summary include specific results or metrics with numbers?\nScore 0-100. Reply with ONLY a number.`,
        },
        {
          id: 'impact',
          prompt: `Research paper summary:\n"${summaryText.slice(0, 2000)}"\n\nDoes this summary explain why this paper matters or what impact it has?\nScore 0-100. Reply with ONLY a number.`,
        },
        {
          id: 'clarity',
          prompt: `Research paper summary:\n"${summaryText.slice(0, 2000)}"\n\nHow understandable is this summary to someone outside the field?\nScore 0-100. Reply with ONLY a number.`,
        },
      ];

      const scores = {};
      for (const q of questions) {
        try {
          const res = await fetch('/api/judge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: q.prompt }),
          });
          if (res.ok) {
            const data = await res.json();
            const num = parseInt(data.text?.trim().replace(/[^0-9]/g, '').slice(0, 3));
            scores[q.id] = isNaN(num) ? 0 : Math.min(100, Math.max(0, num));
          }
        } catch (e) {
          scores[q.id] = 0;
        }
        await sleep(2000);
      }

      const vals = Object.values(scores);
      const overall = vals.length > 0
        ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
        : 0;

      saveSummaryEval(paper.id, paper.title, scores, overall);
      if (onComplete) onComplete(paper.id, overall, scores);
    } finally {
      runningRef.current.delete(paper.id);
    }
  }, []);

  const runChainEval = useCallback(async (chain, library, onComplete) => {
    if (!chain?.id) return;
    if (runningRef.current.has(chain.id)) return;
    if (!chain.synthesis) return;
    runningRef.current.add(chain.id);

    try {
      const ids = chain.paperIds || chain.paper_ids || [];
      const papers = library.filter((p) => ids.includes(p.id));
      const summaries = papers.map((p) => p.tldr || p.concept || '').filter(Boolean);

      if (summaries.length === 0) return;

      const gaps = chain.synthesis?.gaps || [];
      if (gaps.length === 0) return;

      let plausibleCount = 0;
      const summariesText = summaries
        .map((s, i) => `Paper ${i + 1}: ${s.slice(0, 300)}`)
        .join('\n\n');

      for (const gap of gaps.slice(0, 4)) {
        const gapText = (gap.gap || gap.claim || '')
          .replace(/\[P\d+(?::\s*\d{4})?\]/g, '')
          .trim();
        if (!gapText) continue;

        try {
          const res = await fetch('/api/judge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prompt: `Papers in collection:\n${summariesText}\n\nResearch gap claimed: "${gapText}"\n\nIs this gap genuinely NOT addressed by any paper above?\nReply with only one word: YES or NO`,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            const text = data.text?.trim().toUpperCase();
            if (text?.includes('YES')) plausibleCount++;
          }
        } catch (e) {}
        await sleep(2000);
      }

      const total = Math.min(gaps.length, 4);
      const overall = total > 0 ? Math.round((plausibleCount / total) * 100) : 0;

      saveChainEval(chain.id, chain.name, { gapPlausibility: overall }, overall);
      if (onComplete) onComplete(chain.id, overall);
    } finally {
      runningRef.current.delete(chain.id);
    }
  }, []);

  return { runSummaryEval, runChainEval };
}
