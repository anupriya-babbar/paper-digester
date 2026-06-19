import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { getSessionStats } from '../utils/sessionEval';
import { DEMO_PAPERS } from '../data/demoLibrary';
import {
  checkCitation, checkContradiction, checkGap,
} from '../hooks/useGeminiJudge';

async function callJudge(prompt) {
  const res = await fetch('/api/judge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });
  if (!res.ok) throw new Error('Judge API failed');
  const data = await res.json();
  return data.text;
}

function ScoreBar({ label, value, inverted = false }) {
  if (value === null || value === undefined) return null;
  const color = inverted
    ? (value <= 15 ? '#27500A' : value <= 25 ? '#854F0B' : '#A32D2D')
    : (value >= 75 ? '#27500A' : value >= 50 ? '#854F0B' : '#A32D2D');
  const bg = inverted
    ? (value <= 15 ? '#EAF3DE' : value <= 25 ? '#FAEEDA' : '#FCEBEB')
    : (value >= 75 ? '#EAF3DE' : value >= 50 ? '#FAEEDA' : '#FCEBEB');

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13 }}>
        <span style={{ color: 'var(--text)' }}>
          {label}
          {inverted && (
            <span style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 4 }}>
              (lower is better)
            </span>
          )}
        </span>
        <span style={{
          fontWeight: 600, color, background: bg,
          padding: '1px 8px', borderRadius: 8, fontSize: 12,
        }}>
          {value}%
        </span>
      </div>
      <div style={{
        height: 6, background: 'var(--bg)', borderRadius: 3, overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          width: `${inverted ? 100 - value : value}%`,
          background: color, borderRadius: 3,
          transition: 'width 0.5s ease',
        }} />
      </div>
    </div>
  );
}

export default function DevDashboard({ library, chains, userId }) {
  const [feedback, setFeedback] = useState([]);
  const [selectedPaper, setSelectedPaper] = useState('');
  const [selectedChain, setSelectedChain] = useState('');
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState('');
  const [currentResult, setCurrentResult] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [overviewData, setOverviewData] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (userId) patchDemoAbstracts();
  }, [userId]);

  useEffect(() => {
    async function audit() {
      const { data } = await supabase
        .from('papers')
        .select('title, source, is_demo, abstract, tldr, concept')
        .eq('user_id', userId)

      console.table(data?.map(p => ({
        title: p.title?.slice(0,20),
        source: p.source,
        demo: p.is_demo,
        abs: p.abstract?.length || 0,
        tldr: p.tldr?.length || 0,
        concept: p.concept?.length || 0
      })))
    }
    if (userId) audit()
  }, [userId])

  useEffect(() => {
    loadOverviewData();
  }, []);

  useEffect(() => {
    if (activeTab === 'overview') loadOverviewData();
  }, [activeTab]);

  useEffect(() => {
    async function cleanOldEvals() {
      await supabase
        .from('eval_results')
        .delete()
        .eq('user_id', userId)
        .eq('eval_type', 'summary')
        .is('results->scores', null);
      console.log('Old evals cleaned');
    }
    if (userId) cleanOldEvals();
  }, [userId]);

  async function patchDemoAbstracts() {
    const { data: demoPapers } = await supabase
      .from('papers')
      .select('id, title, abstract')
      .eq('user_id', userId)
      .eq('is_demo', true);

    if (!demoPapers || demoPapers.length === 0) return;

    for (const dbPaper of demoPapers) {
      if (dbPaper.abstract && dbPaper.abstract.length > 50) continue;

      const source = DEMO_PAPERS.find((dp) =>
        dp.title.toLowerCase().includes(dbPaper.title?.toLowerCase()?.slice(0, 20)) ||
        dbPaper.title?.toLowerCase().includes(dp.title?.toLowerCase()?.slice(0, 20))
      );

      if (source?.abstract) {
        await supabase
          .from('papers')
          .update({ abstract: source.abstract })
          .eq('id', dbPaper.id)
          .eq('user_id', userId);
        console.log('Patched abstract for:', dbPaper.title);
      }
    }

    loadData();
  }

  async function loadData() {
    const { data: fb } = await supabase
      .from('feedback').select('*').eq('user_id', userId);
    setFeedback(fb || []);
  }

  function getWeakestDimension(scores) {
    if (!scores) return null;
    const labels = {
      problem: 'Problem Statement',
      approach: 'Method/Approach',
      results: 'Results & Evidence',
      impact: 'Impact',
      clarity: 'Clarity',
    };
    const weakest = Object.entries(scores).sort((a, b) => a[1] - b[1])[0];
    return weakest ? labels[weakest[0]] : null;
  }

  function calculateSummaryStats(evals) {
    if (!evals || evals.length === 0) return null;
    const totals = { problem: 0, approach: 0, results: 0, impact: 0, clarity: 0 };
    let overallTotal = 0;
    let validCount = 0;
    console.log('Calculating stats for', evals.length, 'evals');
    evals.forEach((e, i) => {
      console.log(`Eval ${i}:`,
        'overall:', e.results?.overall,
        'scores:', e.results?.scores,
        'hasScores:', !!e.results?.scores
      );
    });
    evals.forEach((e) => {
      const r = e.results;
      if (!r) return;
      const results = typeof r === 'string' ? JSON.parse(r) : r;
      const scores = typeof results.scores === 'string'
        ? JSON.parse(results.scores) : results.scores;
      if (scores && typeof scores === 'object') {
        totals.problem  += scores.problem  || 0;
        totals.approach += scores.approach || 0;
        totals.results  += scores.results  || 0;
        totals.impact   += scores.impact   || 0;
        totals.clarity  += scores.clarity  || 0;
        overallTotal    += results.overall || 0;
        validCount++;
      }
    });
    if (validCount === 0) return null;
    return {
      count: validCount,
      avgOverall: Math.round(overallTotal / validCount),
      dimensions: {
        problem:  Math.round(totals.problem  / validCount),
        approach: Math.round(totals.approach / validCount),
        results:  Math.round(totals.results  / validCount),
        impact:   Math.round(totals.impact   / validCount),
        clarity:  Math.round(totals.clarity  / validCount),
      },
      needsAttention: evals
        .filter((e) => {
          const score = e.results?.overall || e.results?.overallScore || 0;
          return score < 70 && score > 0;
        })
        .map((e) => ({
          id: e.target_id,
          title: e.target_title,
          score: e.results?.overall || e.results?.overallScore || 0,
          weakest: getWeakestDimension(e.results?.scores),
        }))
        .sort((a, b) => a.score - b.score),
    };
  }

  function calculateChainStats(evals) {
    if (evals.length === 0) return null;
    let citTotal = 0, contraTotal = 0, gapTotal = 0, overallTotal = 0;
    let citCount = 0, contraCount = 0, gapCount = 0;
    evals.forEach((e) => {
      const r = e.results;
      if (!r) return;
      if (r.citationAccuracy != null)     { citTotal   += r.citationAccuracy;     citCount++; }
      if (r.contradictionValidity != null) { contraTotal += r.contradictionValidity; contraCount++; }
      if (r.gapPlausibility != null)       { gapTotal   += r.gapPlausibility;     gapCount++; }
      overallTotal += r.overallScore || 0;
    });
    const count = evals.length;
    return {
      count,
      avgOverall: Math.round(overallTotal / count),
      dimensions: {
        citations:      citCount   > 0 ? Math.round(citTotal   / citCount)   : null,
        contradictions: contraCount > 0 ? Math.round(contraTotal / contraCount) : null,
        gaps:           gapCount   > 0 ? Math.round(gapTotal   / gapCount)   : null,
      },
      needsAttention: evals
        .filter((e) => (e.results?.overallScore || 0) < 70)
        .map((e) => ({
          id: e.target_id,
          title: e.target_title,
          score: e.results?.overallScore || 0,
        }))
        .sort((a, b) => a.score - b.score),
    };
  }

  function loadOverviewData() {
    const stats = getSessionStats();
    setOverviewData(stats ? {
      summaryStats: stats.summaryCount > 0 ? {
        count: stats.summaryCount,
        avgOverall: stats.summaryOverall,
        dimensions: stats.dimAvgs,
        needsAttention: stats.needsAttention,
      } : null,
      chainStats: stats.chainCount > 0 ? {
        count: stats.chainCount,
        avgOverall: stats.chainOverall,
        dimensions: { gaps: stats.chainOverall },
        needsAttention: stats.chains
          .filter((c) => c.overall < 70)
          .map((c) => ({ id: c.chainId, title: c.name, score: c.overall })),
      } : null,
      date: stats.date,
    } : null);
  }

  // ── Summary eval ─────────────────────────────────────────────────────────────

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function saveAbstractToSupabase(paperId, abstract) {
    try {
      await supabase
        .from('papers')
        .update({ abstract })
        .eq('id', paperId)
        .eq('user_id', userId);
      console.log('Abstract saved to Supabase');
    } catch (e) {
      console.warn('Could not save abstract:', e.message);
    }
  }

  async function getGroundTruth(paper) {
    if (paper.source === 'search' && paper.abstract && paper.abstract.length > 100) {
      return { text: paper.abstract, source: 'Stored (Semantic Scholar)' };
    }

    if (paper.abstract && paper.abstract.length > 100 && paper.abstract.length < 3000) {
      return { text: paper.abstract, source: 'Stored abstract' };
    }

    const title = paper.title || '';

    setProgress('Searching Semantic Scholar...');
    try {
      const res = await fetch(
        `https://api.semanticscholar.org/graph/v1/paper/search` +
        `?query=${encodeURIComponent(title)}&limit=1&fields=abstract,title`
      );
      const data = await res.json();
      const found = data.data?.[0];
      if (found?.abstract?.length > 100) {
        await saveAbstractToSupabase(paper.id, found.abstract);
        return { text: found.abstract, source: 'Semantic Scholar' };
      }
    } catch (e) {
      console.warn('Semantic Scholar failed:', e.message);
    }

    setProgress('Searching PubMed...');
    try {
      const searchRes = await fetch(
        `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi` +
        `?db=pubmed&term=${encodeURIComponent(title)}&retmax=1&retmode=json`
      );
      const searchData = await searchRes.json();
      const pmid = searchData.esearchresult?.idlist?.[0];
      if (pmid) {
        const fetchRes = await fetch(
          `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi` +
          `?db=pubmed&id=${pmid}&rettype=abstract&retmode=text`
        );
        const text = await fetchRes.text();
        const absMatch = text.match(/AB\s+-\s+([\s\S]+?)(?=\n[A-Z]{2}\s+-|$)/);
        const abstract = absMatch?.[1]?.trim();
        if (abstract && abstract.length > 100) {
          await saveAbstractToSupabase(paper.id, abstract);
          return { text: abstract, source: 'PubMed' };
        }
      }
    } catch (e) {
      console.warn('PubMed failed:', e.message);
    }

    setProgress('Searching Crossref...');
    try {
      const res = await fetch(
        `https://api.crossref.org/works` +
        `?query.title=${encodeURIComponent(title)}&rows=1&select=title,abstract` +
        `&mailto=paperdigester@demo.com`
      );
      const data = await res.json();
      const item = data.message?.items?.[0];
      const abstract = (item?.abstract || '').replace(/<[^>]+>/g, '').trim();
      if (abstract.length > 100) {
        await saveAbstractToSupabase(paper.id, abstract);
        return { text: abstract, source: 'Crossref' };
      }
    } catch (e) {
      console.warn('Crossref failed:', e.message);
    }

    return { text: null, source: 'Not found' };
  }

  async function runSummaryEval() {
    const paper = library.find((p) => p.id === selectedPaper);
    if (!paper) return;

    setRunning(true);
    setCurrentResult(null);

    const summaryText = [
      paper.oneliner,
      paper.tldr,
      paper.problem,
      paper.concept,
      paper.findings,
      paper.key_advantage || paper.keyAdvantage,
      paper.results,
      paper.figures,
      Array.isArray(paper.keyNumbers)
        ? paper.keyNumbers.map((k) => `${k.metric}: ${k.value} (${k.context})`).join('. ')
        : '',
      paper.limitations,
    ].filter(Boolean).join('\n\n').trim();

    console.log('Summary length:', summaryText.length);

    if (!summaryText || summaryText.length < 100) {
      alert('This paper has no summary content. Re-analyze it using Full Breakdown mode first.');
      setRunning(false);
      return;
    }

    const questions = [
      {
        id: 'problem',
        label: 'Problem Statement',
        description: 'Does the summary clearly state what problem this paper solves?',
        prompt: `Research paper summary:\n"${summaryText.slice(0, 2000)}"\n\nQuestion: Does this summary clearly state what problem or gap the paper is addressing?\nConsider: Is it clear WHY this research was needed? What was missing or broken before?\n\nScore from 0 to 100 where:\n100 = problem is crystal clear with context\n75  = problem mentioned but vague\n50  = problem implied but not stated\n25  = problem barely touched on\n0   = no mention of the problem\n\nRespond with ONLY a number 0-100. Nothing else.`,
      },
      {
        id: 'approach',
        label: 'Method / Approach',
        description: 'Does the summary describe how the authors solved the problem?',
        prompt: `Research paper summary:\n"${summaryText.slice(0, 2000)}"\n\nQuestion: Does this summary describe the approach, method, or technique the authors used?\nConsider: Would a reader understand HOW they solved the problem?\n\nScore from 0 to 100 where:\n100 = method clearly explained with key details\n75  = method described but lacking detail\n50  = method mentioned briefly\n25  = method only vaguely referenced\n0   = no description of approach\n\nRespond with ONLY a number 0-100. Nothing else.`,
      },
      {
        id: 'results',
        label: 'Results & Evidence',
        description: 'Does the summary include specific results or metrics?',
        prompt: `Research paper summary:\n"${summaryText.slice(0, 2000)}"\n\nQuestion: Does this summary include specific, verifiable results? Look for: numbers, percentages, benchmark scores, comparisons to prior work, dataset names, performance metrics.\n\nScore from 0 to 100 where:\n100 = multiple specific results with numbers\n75  = at least one specific result with number\n50  = results mentioned but no specific numbers\n25  = vague mention of improvement\n0   = no results mentioned\n\nRespond with ONLY a number 0-100. Nothing else.`,
      },
      {
        id: 'impact',
        label: 'Impact & Significance',
        description: 'Does the summary explain why this paper matters?',
        prompt: `Research paper summary:\n"${summaryText.slice(0, 2000)}"\n\nQuestion: Does this summary explain the significance or impact of this research?\nConsider: Why should anyone care? What changed because of this paper? What does it enable?\n\nScore from 0 to 100 where:\n100 = impact clearly explained with real-world context\n75  = significance stated but generic\n50  = impact implied but not explained\n25  = barely mentions why it matters\n0   = no mention of impact or significance\n\nRespond with ONLY a number 0-100. Nothing else.`,
      },
      {
        id: 'clarity',
        label: 'Clarity for Non-Expert',
        description: 'Is the summary understandable to someone outside the field?',
        prompt: `Research paper summary:\n"${summaryText.slice(0, 2000)}"\n\nQuestion: How well does this summary communicate to someone who is NOT an expert in this field?\nConsider: Are technical terms explained? Are analogies used where helpful? Could a smart non-specialist understand it?\n\nScore from 0 to 100 where:\n100 = fully accessible to any educated reader\n75  = mostly clear with minor jargon\n50  = some parts clear, some require expertise\n25  = mostly requires domain knowledge\n0   = incomprehensible without expertise\n\nRespond with ONLY a number 0-100. Nothing else.`,
      },
    ];

    const results = { scores: {}, labels: {}, descriptions: {}, overall: 0, runAt: new Date().toISOString() };

    try {
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        setProgress(`Evaluating: ${q.label} (${i + 1}/${questions.length})...`);
        try {
          const raw = await callJudge(q.prompt);
          const score = Math.min(100, Math.max(0, parseInt(raw.trim().replace(/[^0-9]/g, '').slice(0, 3)) || 0));
          results.scores[q.id] = score;
          results.labels[q.id] = q.label;
          results.descriptions[q.id] = q.description;
          console.log(`${q.label}: ${score}`);
        } catch (e) {
          results.scores[q.id] = 0;
          console.error(`${q.label} failed:`, e.message);
        }
        await sleep(2000);
      }

      const vals = Object.values(results.scores);
      results.overall = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
      results.interpretation =
        results.overall >= 85 ? 'Strong summary — comprehensive and clear' :
        results.overall >= 70 ? 'Good summary — minor gaps' :
        results.overall >= 55 ? 'Adequate summary — some key areas missing' :
        'Summary needs improvement';

      console.log('Saving results:', JSON.stringify(results));
      const { data: saved, error: saveError } = await supabase
        .from('eval_results')
        .insert({
          user_id: userId,
          eval_type: 'summary',
          target_id: selectedPaper,
          target_title: paper.title,
          results: results,
        })
        .select();
      console.log('Save result:', saved, 'Error:', saveError);

      setCurrentResult(results);
      setProgress('');
    } catch (e) {
      console.error('Summary eval error:', e);
      setProgress('Error: ' + e.message);
    } finally {
      setRunning(false);
    }
  }

  // ── Chain eval ───────────────────────────────────────────────────────────────

  async function runChainEval() {
    const chain = chains.find((c) => c.id === selectedChain);
    if (!chain || !chain.synthesis) {
      alert('This chain has no synthesis yet. Build synthesis first.');
      return;
    }

    setRunning(true);
    setCurrentResult(null);

    try {
      const chainPaperIds = chain.paperIds || chain.paper_ids || [];
      const chainPapers = library.filter((p) => chainPaperIds.includes(p.id));
      const synthesis = chain.synthesis;
      console.log('=== CHAIN EVAL DEBUG ===');
      console.log('Chain name:', chain.name);
      console.log('Chain paper IDs:', chainPaperIds);
      console.log('Library size:', library.length);
      console.log('Chain papers found:', chainPapers.length);
      console.log('Chain papers:', chainPapers.map((p) => ({
        id: p.id,
        title: p.title?.slice(0, 30),
        hasTldr: !!p.tldr,
        hasConcept: !!p.concept,
      })));
      console.log('Synthesis keys:', Object.keys(synthesis || {}));
      console.log('Gaps:', synthesis?.gaps?.length, 'first gap:', JSON.stringify(synthesis?.gaps?.[0]));

      // Citation accuracy
      setProgress('Checking citation accuracy…');
      const citationResults = [];
      if (synthesis.agreements) {
        const citations = (synthesis.agreements.match(/\[P\d+(?::\s*\d{4})?\]/g) || []);
        for (const chip of citations.slice(0, 10)) {
          const num = parseInt(chip.match(/P(\d+)/)?.[1]) - 1;
          const paper = chainPapers[num];
          if (!paper) continue;
          const r = await checkCitation(paper.tldr || '', synthesis.agreements, chip);
          citationResults.push({ chip, paper: paper.title, ...r });
        }
      }

      // Contradiction validity
      setProgress('Checking contradictions…');
      const contradictionResults = [];
      const contradictions = synthesis.contradictions || [];
      for (const c of contradictions.slice(0, 3)) {
        const topic = c.topic || c.claim || '';
        const sideA = chainPapers.find((p) =>
          (c.sideA?.citations || []).some(
            (cit) => chainPapers.indexOf(p) === parseInt(cit.match(/P(\d+)/)?.[1]) - 1
          )
        );
        const sideB = chainPapers.find((p) =>
          (c.sideB?.citations || []).some(
            (cit) => chainPapers.indexOf(p) === parseInt(cit.match(/P(\d+)/)?.[1]) - 1
          )
        );
        if (sideA && sideB) {
          const r = await checkContradiction(sideA.tldr || '', sideB.tldr || '', topic);
          contradictionResults.push({ topic, ...r });
        }
      }

      // Gap plausibility
      setProgress('Checking research gaps…');
      const gapResults = [];
      const gaps = synthesis.gaps || [];
      const allSummaries = chainPapers.map((p) => p.tldr || '').filter(Boolean);
      console.log('All summaries count:', allSummaries.length);
      console.log('First summary preview:', allSummaries[0]?.slice(0, 100));
      console.log('Gaps found:', gaps.length);
      console.log('First gap:', JSON.stringify(gaps?.[0]));
      for (const gap of gaps.slice(0, 4)) {
        const gapText = gap.gap || gap.claim || gap.description || '';
        if (!gapText) {
          console.log('Gap has no text:', gap);
          continue;
        }
        console.log('Checking gap:', gapText.slice(0, 80));
        const r = await checkGap(allSummaries, gapText);
        console.log('Gap result:', r);
        console.log('Gap text:', gapText.slice(0, 60));
        console.log('checkGap raw result:', r);
        gapResults.push({ gap: gapText, ...r });
        await sleep(2000);
      }

      const citAcc = citationResults.length > 0
        ? citationResults.filter((r) => r.accurate).length / citationResults.length : null;
      const contraValid = contradictionResults.length > 0
        ? contradictionResults.filter((r) => r.valid).length / contradictionResults.length : null;
      const gapPlaus = gapResults.length > 0
        ? gapResults.filter((r) => r.plausible).length / gapResults.length : null;

      const scores = [citAcc, contraValid, gapPlaus].filter((s) => s !== null);
      const overall = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

      const results = {
        citationAccuracy: citAcc !== null ? Math.round(citAcc * 100) : null,
        contradictionValidity: contraValid !== null ? Math.round(contraValid * 100) : null,
        gapPlausibility: gapPlaus !== null ? Math.round(gapPlaus * 100) : null,
        overallScore: Math.round(overall * 100),
        citationDetails: citationResults,
        contradictionDetails: contradictionResults,
        gapDetails: gapResults,
        papersEvaluated: chainPapers.length,
        runAt: new Date().toISOString(),
      };

      setCurrentResult(results);
      setProgress('');
    } catch (e) {
      console.error('Chain eval error:', e);
      setProgress('Error: ' + e.message);
    } finally {
      setRunning(false);
    }
  }

  // ── Aggregate stats ───────────────────────────────────────────────────────────

  const totalFeedback = feedback.length;
  const positive = feedback.filter((f) => f.rating === 'positive').length;
  const positiveRate = totalFeedback > 0 ? Math.round((positive / totalFeedback) * 100) : null;

  const reasonCounts = {};
  feedback.filter((f) => f.reason).forEach((f) => {
    reasonCounts[f.reason] = (reasonCounts[f.reason] || 0) + 1;
  });
  const topReasons = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1]).slice(0, 4);

  console.log('Library papers:', library.length);
  console.log('Papers with abstract:', library.filter((p) => p.abstract).length);
  console.log('Sample abstracts:', library.slice(0, 3).map((p) => ({
    title: p.title?.slice(0, 30),
    abstractLen: p.abstract?.length || 0,
  })));

  const evalablePapers = library.filter((p) => {
    const hasGroundTruth =
      (p.abstract && p.abstract.length > 100) ||
      (p.tldr && p.tldr.length > 100);

    const hasSummary =
      p.concept || p.findings ||
      p.key_advantage || p.keyAdvantage ||
      p.results;

    return hasGroundTruth && hasSummary;
  });

  console.log('Evalable:', evalablePapers.map((p) => ({
    title: p.title?.slice(0, 25),
    absLen: p.abstract?.length || 0,
    tldrLen: p.tldr?.length || 0,
    hasConcept: !!p.concept,
  })));
  const synthesizedChains = chains.filter((c) => {
    if (!c.synthesis) return false;
    const ids = c.paperIds || c.paper_ids || [];
    return ids.length >= 2;
  });

  console.log('Synthesized chains:', synthesizedChains.length);
  console.log('All chains:', chains.map((c) => ({
    name: c.name,
    paperCount: (c.paper_ids || c.paperIds || []).length,
    hasSynthesis: !!c.synthesis,
  })));

  const CARD = {
    background: 'var(--card)', border: '0.5px solid var(--border)',
    borderRadius: 12, padding: '1rem 1.25rem', marginBottom: 12,
  };

  const SELECT_STYLE = {
    flex: 1, padding: '8px 12px', borderRadius: 8,
    border: '0.5px solid var(--border)', fontSize: 13,
    fontFamily: 'inherit', background: 'var(--card)', color: 'var(--text)',
  };

  return (
    <div style={{ padding: '1.5rem 2rem', maxWidth: 720, margin: '0 auto' }}>

      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>
          📊 Developer Dashboard
        </h2>
        <p style={{ fontSize: 12, color: 'var(--muted)' }}>
          Internal quality monitoring — only visible to admin
        </p>
      </div>

      {/* Sub-tabs */}
      <div style={{
        display: 'flex', gap: 4, marginBottom: '1.5rem',
        borderBottom: '0.5px solid var(--border)',
      }}>
        {['overview', 'summary-eval', 'chain-eval'].map((t) => (
          <button
            key={t}
            onClick={() => { setActiveTab(t); setCurrentResult(null); setProgress(''); }}
            style={{
              padding: '8px 16px', fontSize: 13, border: 'none',
              background: 'transparent', cursor: 'pointer',
              color: activeTab === t ? 'var(--text)' : 'var(--muted)',
              borderBottom: activeTab === t ? '2px solid var(--text)' : '2px solid transparent',
              fontWeight: activeTab === t ? 500 : 400,
              marginBottom: -1,
            }}
          >
            {t === 'overview' ? '📈 Overview'
             : t === 'summary-eval' ? '📄 Summary Eval'
             : '🔗 Chain Eval'}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ── */}
      {activeTab === 'overview' && (
        <div>

          {/* Session date header */}
          {overviewData && (
            <div style={{
              fontSize: 11, color: 'var(--color-text-secondary)',
              marginBottom: 16, display: 'flex',
              alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span>Session: {overviewData.date}</span>
              <span>Resets at midnight</span>
            </div>
          )}

          {/* Empty state */}
          {(!overviewData || (!overviewData.summaryStats && !overviewData.chainStats)) && (
            <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--color-text-secondary)' }}>
              <div style={{ fontSize: 32, display: 'block', marginBottom: 12 }}>📊</div>
              <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 8, color: 'var(--color-text-primary)' }}>
                No evaluations yet
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.6, maxWidth: 320, margin: '0 auto' }}>
                Run eval on any paper from the Summary Eval tab or any chain from the Chain Eval tab to see quality metrics here.
              </div>
              <button
                onClick={() => setActiveTab('summary-eval')}
                style={{
                  marginTop: 16, padding: '8px 16px', borderRadius: 8,
                  border: 'none', background: '#1B4F9C', color: '#fff',
                  fontSize: 13, cursor: 'pointer',
                }}
              >
                Run first evaluation
              </button>
            </div>
          )}

          {/* Summary Quality section */}
          {overviewData?.summaryStats && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>
                  Summary Quality
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                  {overviewData.summaryStats.count} of{' '}
                  {library.filter((p) =>
                    (p.source === 'upload' || p.source === 'search') && (p.tldr || p.concept)
                  ).length} papers evaluated
                </div>
              </div>

              {/* Overall score card */}
              <div style={{
                background: overviewData.summaryStats.avgOverall >= 80 ? '#EAF3DE'
                  : overviewData.summaryStats.avgOverall >= 70 ? '#E6F1FB' : '#FAEEDA',
                borderRadius: 10, padding: '12px 16px', marginBottom: 12,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Average overall score</div>
                <div style={{
                  fontSize: 28, fontWeight: 500,
                  color: overviewData.summaryStats.avgOverall >= 80 ? '#27500A'
                    : overviewData.summaryStats.avgOverall >= 70 ? '#0C447C' : '#854F0B',
                }}>
                  {overviewData.summaryStats.avgOverall}%
                </div>
              </div>

              {/* Dimension bars */}
              <div style={{
                background: 'var(--color-background-primary)',
                border: '0.5px solid var(--color-border-tertiary)',
                borderRadius: 10, padding: '12px 16px', marginBottom: 12,
              }}>
                {[
                  { key: 'problem',  label: 'Problem Statement' },
                  { key: 'approach', label: 'Method / Approach' },
                  { key: 'results',  label: 'Results & Evidence' },
                  { key: 'impact',   label: 'Impact & Significance' },
                  { key: 'clarity',  label: 'Clarity for Non-Expert' },
                ].map(({ key, label }) => {
                  const score = overviewData.summaryStats.dimensions[key] || 0;
                  const barColor  = score >= 75 ? '#3B9E2A' : score >= 50 ? '#E67E22' : '#C0392B';
                  const textColor = score >= 75 ? '#27500A'  : score >= 50 ? '#854F0B' : '#A32D2D';
                  const bgColor   = score >= 75 ? '#EAF3DE'  : score >= 50 ? '#FAEEDA' : '#FCEBEB';
                  return (
                    <div key={key} style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                        <span style={{ fontSize: 12, color: 'var(--color-text-primary)' }}>{label}</span>
                        <span style={{
                          fontSize: 12, fontWeight: 500, color: textColor,
                          background: bgColor, padding: '1px 6px', borderRadius: 6,
                        }}>{score}%</span>
                      </div>
                      <div style={{ height: 5, background: 'var(--color-background-secondary)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${score}%`, background: barColor, borderRadius: 3, transition: 'width 0.6s ease' }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Needs attention */}
              {overviewData.summaryStats.needsAttention.length > 0 && (
                <div style={{
                  background: 'var(--color-background-primary)',
                  border: '0.5px solid #F0C274', borderRadius: 10, padding: '10px 14px',
                }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: '#854F0B', marginBottom: 8 }}>
                    Needs attention (score below 70%)
                  </div>
                  {overviewData.summaryStats.needsAttention.map((item, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '6px 0',
                      borderTop: i > 0 ? '0.5px solid var(--color-border-tertiary)' : 'none',
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 12, fontWeight: 500, color: 'var(--color-text-primary)',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                          {item.title?.slice(0, 40)}
                        </div>
                        {item.weakest && (
                          <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
                            Weakest: {item.weakest}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginLeft: 8 }}>
                        <span style={{
                          fontSize: 12, fontWeight: 500, color: '#A32D2D',
                          background: '#FCEBEB', padding: '1px 6px', borderRadius: 6,
                        }}>{item.score}%</span>
                        <button
                          onClick={() => { setActiveTab('summary-eval'); setSelectedPaper(item.id); }}
                          style={{
                            fontSize: 11, padding: '3px 8px', borderRadius: 6,
                            border: '0.5px solid var(--color-border-secondary)',
                            background: 'transparent', cursor: 'pointer',
                            color: 'var(--color-text-primary)',
                          }}
                        >
                          Re-evaluate
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Divider */}
          {overviewData?.summaryStats && overviewData?.chainStats && (
            <div style={{ height: '0.5px', background: 'var(--color-border-tertiary)', margin: '0 0 24px' }} />
          )}

          {/* Chain Quality section */}
          {overviewData?.chainStats && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>Chain Quality</div>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                  {overviewData.chainStats.count} of {chains.length} chains evaluated
                </div>
              </div>

              {/* Chain overall score */}
              <div style={{
                background: overviewData.chainStats.avgOverall >= 80 ? '#EAF3DE'
                  : overviewData.chainStats.avgOverall >= 70 ? '#E6F1FB' : '#FAEEDA',
                borderRadius: 10, padding: '12px 16px', marginBottom: 12,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Average chain score</div>
                <div style={{
                  fontSize: 28, fontWeight: 500,
                  color: overviewData.chainStats.avgOverall >= 80 ? '#27500A'
                    : overviewData.chainStats.avgOverall >= 70 ? '#0C447C' : '#854F0B',
                }}>
                  {overviewData.chainStats.avgOverall}%
                </div>
              </div>

              {/* Chain dimension bars */}
              <div style={{
                background: 'var(--color-background-primary)',
                border: '0.5px solid var(--color-border-tertiary)',
                borderRadius: 10, padding: '12px 16px', marginBottom: 12,
              }}>
                {[
                  { key: 'citations',      label: 'Citation Accuracy' },
                  { key: 'contradictions', label: 'Contradiction Validity' },
                  { key: 'gaps',           label: 'Gap Plausibility' },
                ].map(({ key, label }) => {
                  const score = overviewData.chainStats.dimensions[key];
                  if (score === null) return null;
                  const barColor  = score >= 75 ? '#3B9E2A' : score >= 50 ? '#E67E22' : '#C0392B';
                  const textColor = score >= 75 ? '#27500A'  : score >= 50 ? '#854F0B' : '#A32D2D';
                  const bgColor   = score >= 75 ? '#EAF3DE'  : score >= 50 ? '#FAEEDA' : '#FCEBEB';
                  return (
                    <div key={key} style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                        <span style={{ fontSize: 12, color: 'var(--color-text-primary)' }}>{label}</span>
                        <span style={{
                          fontSize: 12, fontWeight: 500, color: textColor,
                          background: bgColor, padding: '1px 6px', borderRadius: 6,
                        }}>{score}%</span>
                      </div>
                      <div style={{ height: 5, background: 'var(--color-background-secondary)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${score}%`, background: barColor, borderRadius: 3, transition: 'width 0.6s ease' }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Chain needs attention */}
              {overviewData.chainStats.needsAttention.length > 0 && (
                <div style={{
                  background: 'var(--color-background-primary)',
                  border: '0.5px solid #F0C274', borderRadius: 10, padding: '10px 14px',
                }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: '#854F0B', marginBottom: 8 }}>
                    Chains needing attention (below 70%)
                  </div>
                  {overviewData.chainStats.needsAttention.map((item, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '6px 0',
                      borderTop: i > 0 ? '0.5px solid var(--color-border-tertiary)' : 'none',
                    }}>
                      <div style={{
                        fontSize: 12, fontWeight: 500, color: 'var(--color-text-primary)',
                        flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {item.title?.slice(0, 40)}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginLeft: 8 }}>
                        <span style={{
                          fontSize: 12, fontWeight: 500, color: '#A32D2D',
                          background: '#FCEBEB', padding: '1px 6px', borderRadius: 6,
                        }}>{item.score}%</span>
                        <button
                          onClick={() => { setActiveTab('chain-eval'); setSelectedChain(item.id); }}
                          style={{
                            fontSize: 11, padding: '3px 8px', borderRadius: 6,
                            border: '0.5px solid var(--color-border-secondary)',
                            background: 'transparent', cursor: 'pointer',
                            color: 'var(--color-text-primary)',
                          }}
                        >
                          Re-evaluate
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Methodology note */}
          {overviewData && (overviewData.summaryStats || overviewData.chainStats) && (
            <div style={{
              marginTop: 20, fontSize: 11, color: 'var(--color-text-secondary)',
              padding: '8px 12px', background: 'var(--color-background-secondary)',
              borderRadius: 8, lineHeight: 1.5,
            }}>
              Scores use latest evaluation per paper/chain only. Summary quality: 5-dimension checklist evaluated by Claude Haiku. Chain quality: citation accuracy, contradiction validity, gap plausibility. Threshold for attention: below 70%.
            </div>
          )}

        </div>
      )}

      {/* ── SUMMARY EVAL ── */}
      {activeTab === 'summary-eval' && (
        <div style={CARD}>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12, lineHeight: 1.5 }}>
            Select a summarized paper. Claude evaluates the summary against the author abstract.
            {evalablePapers.length === 0 && (
              <div style={{ marginTop: 8, color: '#854F0B', background: '#FAEEDA', padding: '8px 12px', borderRadius: 6, fontSize: 12 }}>
                No papers available yet. Search for papers using the search panel to add them with clean abstracts, then evaluate here.
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <select
              value={selectedPaper}
              onChange={(e) => { setSelectedPaper(e.target.value); setCurrentResult(null); }}
              style={SELECT_STYLE}
            >
              <option value=''>Select a paper…</option>
              {evalablePapers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title?.slice(0, 50)} ({p.year})
                </option>
              ))}
            </select>
            <button
              onClick={runSummaryEval}
              disabled={!selectedPaper || running}
              style={{
                padding: '8px 16px', borderRadius: 8, border: 'none',
                background: !selectedPaper || running ? '#ccc' : '#1B4F9C',
                color: '#fff', fontSize: 13, fontWeight: 500,
                cursor: !selectedPaper || running ? 'not-allowed' : 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {running ? 'Running…' : currentResult ? '▶ Evaluate Again' : '▶ Evaluate'}
            </button>
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, marginBottom: 8 }}>
            Best results with papers that have full summaries and abstracts stored
          </div>

          {progress && (
            <div style={{
              fontSize: 12, color: 'var(--muted)', padding: '6px 10px',
              background: 'var(--bg)', borderRadius: 6, marginBottom: 12,
            }}>
              ⏳ {progress}
            </div>
          )}

          {currentResult && currentResult.scores && (
            <div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12 }}>
                Last run: {new Date(currentResult.runAt).toLocaleString()}
              </div>

              {/* Overall score card */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 16, padding: '14px 16px',
                borderRadius: 10, marginBottom: 20,
                background: currentResult.overall >= 85 ? '#EAF3DE'
                  : currentResult.overall >= 70 ? '#EEF3FF'
                  : currentResult.overall >= 55 ? '#FAEEDA' : '#FCEBEB',
              }}>
                <div style={{
                  fontSize: 36, fontWeight: 800, lineHeight: 1, minWidth: 56, textAlign: 'center',
                  color: currentResult.overall >= 85 ? '#27500A'
                    : currentResult.overall >= 70 ? '#1B4F9C'
                    : currentResult.overall >= 55 ? '#854F0B' : '#A32D2D',
                }}>
                  {currentResult.overall}
                </div>
                <div>
                  <div style={{
                    fontSize: 14, fontWeight: 700,
                    color: currentResult.overall >= 85 ? '#27500A'
                      : currentResult.overall >= 70 ? '#1B4F9C'
                      : currentResult.overall >= 55 ? '#854F0B' : '#A32D2D',
                  }}>
                    {currentResult.interpretation}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Overall score out of 100</div>
                </div>
              </div>

              {/* 5 individual scores */}
              {Object.entries(currentResult.scores).map(([id, score]) => (
                <div key={id} style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                    <div>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                        {currentResult.labels[id]}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 8 }}>
                        {currentResult.descriptions[id]}
                      </span>
                    </div>
                    <span style={{
                      fontSize: 12, fontWeight: 700, minWidth: 36, textAlign: 'right',
                      color: score >= 75 ? '#27500A' : score >= 50 ? '#854F0B' : '#A32D2D',
                    }}>
                      {score}/100
                    </span>
                  </div>
                  <div style={{ height: 8, background: '#E8ECF2', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 4,
                      width: `${score}%`,
                      background: score >= 75 ? '#3C8C1D' : score >= 50 ? '#F0922B' : '#C0392B',
                      transition: 'width 0.4s ease',
                    }} />
                  </div>
                </div>
              ))}

              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 12, fontStyle: 'italic' }}>
                Evaluated by Claude Haiku on summary fields (oneliner, concept, findings, results, key advantage, limitations)
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── CHAIN EVAL ── */}
      {activeTab === 'chain-eval' && (
        <div style={CARD}>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12, lineHeight: 1.5 }}>
            Select any synthesized chain. Claude verifies citation accuracy, contradiction validity, and gap plausibility.
          </div>

          {synthesizedChains.length === 0 && (
            <div style={{
              padding: '12px 14px', borderRadius: 8, fontSize: 13,
              background: '#FAEEDA', color: '#854F0B', lineHeight: 1.6,
            }}>
              No chains ready for evaluation. Build a chain with 2+ papers and click Synthesize first.
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <select
              value={selectedChain}
              onChange={(e) => { setSelectedChain(e.target.value); setCurrentResult(null); }}
              style={SELECT_STYLE}
            >
              <option value=''>Select a chain…</option>
              {synthesizedChains.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.paperIds?.length || c.paper_ids?.length || 0} papers)
                </option>
              ))}
            </select>
            <button
              onClick={runChainEval}
              disabled={!selectedChain || running}
              style={{
                padding: '8px 16px', borderRadius: 8, border: 'none',
                background: !selectedChain || running ? '#ccc' : '#1B4F9C',
                color: '#fff', fontSize: 13, fontWeight: 500,
                cursor: !selectedChain || running ? 'not-allowed' : 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {running ? 'Running…' : currentResult ? '▶ Evaluate Again' : '▶ Evaluate'}
            </button>
          </div>

          {progress && (
            <div style={{
              fontSize: 12, color: 'var(--muted)', padding: '6px 10px',
              background: 'var(--bg)', borderRadius: 6, marginBottom: 12,
            }}>
              ⏳ {progress}
            </div>
          )}

          {currentResult && currentResult.overallScore !== undefined && (
            <div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12 }}>
                Last run: {new Date(currentResult.runAt).toLocaleString()}
              </div>
              <ScoreBar label="Citation Accuracy" value={currentResult.citationAccuracy} />
              <ScoreBar label="Contradiction Validity" value={currentResult.contradictionValidity} />
              <ScoreBar label="Gap Plausibility" value={currentResult.gapPlausibility} />
              <ScoreBar label="Overall Chain Score" value={currentResult.overallScore} />

              {currentResult.citationDetails?.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Citation audit</div>
                  {currentResult.citationDetails.map((c, i) => (
                    <div key={i} style={{ fontSize: 12, padding: '6px 0', borderTop: '0.5px solid var(--border)', display: 'flex', gap: 8 }}>
                      <span style={{ color: c.accurate ? '#27500A' : '#A32D2D', flexShrink: 0 }}>
                        {c.accurate ? '✓' : '✗'}
                      </span>
                      <div>
                        <span style={{ fontWeight: 500 }}>{c.chip}</span>{' → '}{c.paper}
                        {c.reason && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{c.reason}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {currentResult.gapDetails?.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Gap verification</div>
                  {currentResult.gapDetails.map((g, i) => (
                    <div key={i} style={{ fontSize: 12, padding: '6px 0', borderTop: '0.5px solid var(--border)', display: 'flex', gap: 8 }}>
                      <span style={{ color: g.plausible ? '#27500A' : '#A32D2D', flexShrink: 0 }}>
                        {g.plausible ? '✓' : '✗'}
                      </span>
                      <div>
                        {g.gap}
                        {g.reason && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{g.reason}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
