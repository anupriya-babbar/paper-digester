import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useEval } from '../hooks/useEval';
import { getAllEvalResults, computeOverviewStats } from '../utils/evalStorage';
import { DEMO_PAPERS } from '../data/demoLibrary';

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
  const [selectedPaper, setSelectedPaper] = useState(null);
  const [selectedChain, setSelectedChain] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

  const { runSummaryEval, runChainEval } = useEval();
  const [evalRunning, setEvalRunning] = useState(false);
  const [summaryEvalResult, setSummaryEvalResult] = useState(null);
  const [chainEvalResult, setChainEvalResult] = useState(null);
  const [overviewStats, setOverviewStats] = useState(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [evalCount, setEvalCount] = useState(0);

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
        .eq('user_id', userId);

      console.table(data?.map(p => ({
        title: p.title?.slice(0, 20),
        source: p.source,
        demo: p.is_demo,
        abs: p.abstract?.length || 0,
        tldr: p.tldr?.length || 0,
        concept: p.concept?.length || 0,
      })));
    }
    if (userId) audit();
  }, [userId]);

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

  useEffect(() => {
    if (!userId) return;
    setOverviewLoading(true);
    getAllEvalResults(userId).then(records => {
      setOverviewStats(computeOverviewStats(records));
      setOverviewLoading(false);
    });
  }, [userId, evalCount]);

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

  const handleRunSummaryEval = async (paper) => {
    if (!paper?.id) return;
    setEvalRunning(true);
    setSummaryEvalResult(null);
    try {
      const fullText = [
        selectedPaper?.concept,
        selectedPaper?.findings,
        selectedPaper?.key_advantage,
        selectedPaper?.results,
        selectedPaper?.figures,
      ].filter(Boolean).join('\n\n');

      const results = await runSummaryEval(paper, userId, fullText);
      setSummaryEvalResult(results);
      setTimeout(() => setEvalCount(prev => prev + 1), 1000);
    } finally {
      setEvalRunning(false);
    }
  };

  const handleRunChainEval = async (chain) => {
    console.log('[ChainEval] running with chain:', chain?.id, chain?.name, 'paper_ids:', chain?.paper_ids?.length);
    console.log('[ChainEval] full chain object keys:', Object.keys(selectedChain));
    console.log('[ChainEval] paper_ids:', selectedChain?.paper_ids);
    console.log('[ChainEval] paperIds:', selectedChain?.paperIds);
    if (!chain?.id) return;
    setEvalRunning(true);
    setChainEvalResult(null);
    try {
      console.log('[ChainEval] papers array length:', library?.length);
      console.log('[ChainEval] papers ids:', library?.map(p => p.id));
      console.log('[ChainEval] chain paperIds:', selectedChain?.paperIds);

      const found = (selectedChain?.paperIds || []).filter(id =>
        library?.some(p => p.id === id)
      );
      console.log('[ChainEval] matched papers:', found.length, 'of', selectedChain?.paperIds?.length);

      const results = await runChainEval(chain, library, userId);
      setChainEvalResult(results);
      setTimeout(() => setEvalCount(prev => prev + 1), 1000);
    } finally {
      setEvalRunning(false);
    }
  };

  // ── Aggregate stats ───────────────────────────────────────────────────────────

  const totalFeedback = feedback.length;
  const positive = feedback.filter((f) => f.rating === 'positive').length;
  const positiveRate = totalFeedback > 0 ? Math.round((positive / totalFeedback) * 100) : null;

  const reasonCounts = {};
  feedback.filter((f) => f.reason).forEach((f) => {
    reasonCounts[f.reason] = (reasonCounts[f.reason] || 0) + 1;
  });
  const topReasons = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1]).slice(0, 4);

  const summarizedPapers = library.filter((p) => p.summarized);

  const synthesizedChains = chains.filter((c) => {
    if (!c.synthesis) return false;
    const ids = c.paperIds || c.paper_ids || [];
    return ids.length >= 2;
  });


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
            onClick={() => {
              setActiveTab(t);
              setSummaryEvalResult(null);
              setChainEvalResult(null);
            }}
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
          {overviewLoading ? (
            <div style={{ color: 'var(--muted)', fontSize: 13, padding: '2rem 0' }}>
              Loading eval history…
            </div>
          ) : overviewStats ? (
            <div>
              <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
                {/* Summary Eval card */}
                <div style={{ flex: 1, ...CARD, marginBottom: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Summary Eval</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
                    {overviewStats.summaryCount} papers evaluated
                  </div>
                  <EvalBar label="Overall" score={overviewStats.summary?.overall} />
                  <EvalBar label="Faithfulness" score={overviewStats.summary?.faithfulness} />
                  <EvalBar label="Coverage" score={overviewStats.summary?.coverage} />
                  <EvalBar label="Mode Fidelity" score={overviewStats.summary?.modeFidelity} />
                  <EvalBar label="Free Checks" score={overviewStats.summary?.freeChecks} />
                </div>
                {/* Chain Eval card */}
                <div style={{ flex: 1, ...CARD, marginBottom: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Chain Eval</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
                    {overviewStats.chainCount} chains evaluated
                  </div>
                  <EvalBar label="Overall" score={overviewStats.chain?.overall} />
                  <EvalBar label="Citation Grounding" score={overviewStats.chain?.citationGrounding} />
                  <EvalBar label="Contradiction Reality" score={overviewStats.chain?.contradictionReality} />
                  <EvalBar label="Gap Novelty" score={overviewStats.chain?.gapNovelty} />
                  <EvalBar label="Synthesis Quality" score={overviewStats.chain?.synthesisQuality} />
                  <EvalBar label="Citation Density" score={overviewStats.chain?.citationDensity} />
                </div>
              </div>

              {overviewStats.needsAttention?.length > 0 && (
                <div style={CARD}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#854F0B' }}>
                    Needs Attention
                  </div>
                  {overviewStats.needsAttention.map((item, i) => (
                    <div key={i} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '6px 0',
                      borderTop: i > 0 ? '0.5px solid var(--border)' : 'none',
                      fontSize: 13,
                    }}>
                      <div>
                        <div style={{ fontWeight: 500 }}>{item.title}</div>
                        {item.weakest && (
                          <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                            Weakest: {item.weakest}
                          </div>
                        )}
                      </div>
                      <span style={{ fontWeight: 600, color: '#A32D2D' }}>{item.score}%</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--muted)', fontSize: 13 }}>
              No evaluations yet. Run an eval from the Summary Eval or Chain Eval tab.
            </div>
          )}
        </div>
      )}

      {/* ── SUMMARY EVAL ── */}
      {activeTab === 'summary-eval' && (
        <div style={CARD}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <select
              value={selectedPaper?.id || ''}
              onChange={(e) => {
                const paper = summarizedPapers.find(p => p.id === e.target.value);
                setSelectedPaper(paper || null);
                setSummaryEvalResult(null);
              }}
              style={SELECT_STYLE}
            >
              <option value=''>Select a paper…</option>
              {summarizedPapers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title?.slice(0, 50)} ({p.year})
                </option>
              ))}
            </select>
            <button
              onClick={() => handleRunSummaryEval(selectedPaper)}
              disabled={!selectedPaper?.id || evalRunning}
              style={{
                padding: '8px 16px', borderRadius: 8, border: 'none',
                background: !selectedPaper?.id || evalRunning ? '#ccc' : '#1B4F9C',
                color: '#fff', fontSize: 13, fontWeight: 500,
                cursor: !selectedPaper?.id || evalRunning ? 'not-allowed' : 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {evalRunning ? 'Running…' : 'Run Eval'}
            </button>
          </div>

          {selectedPaper && !selectedPaper.abstract && (
            <div style={{
              fontSize: 12, color: '#854F0B', background: '#FAEEDA',
              padding: '8px 12px', borderRadius: 6, marginBottom: 12,
            }}>
              No abstract stored — faithfulness and coverage checks will be skipped.
              Open the paper in PaperView first to fetch the abstract, then re-run.
            </div>
          )}

          {summaryEvalResult && (
            <div style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
                <ScoreCircle score={summaryEvalResult.overall} />
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>Overall Score</div>
              </div>

              <EvalBar label="Faithfulness" score={summaryEvalResult.faithfulness} />
              <EvalBar label="Coverage" score={summaryEvalResult.coverage} />
              {summaryEvalResult.mainContribution && (
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: -6, marginBottom: 10 }}>
                  {summaryEvalResult.mainContribution}
                </div>
              )}
              <EvalBar label="Mode Fidelity" score={summaryEvalResult.modeFidelity} />

              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', margin: '12px 0 4px' }}>
                Free Checks
              </div>
              {console.log('[Dashboard] summaryEvalResult:', JSON.stringify(summaryEvalResult?.freeChecks))}
              <EvalBar label="Keyword Coverage" score={summaryEvalResult.freeChecks?.keywordCoverage?.score} />
              <EvalBar label="Number Preservation" score={summaryEvalResult.freeChecks?.numberPreservation?.score} />
              <EvalBar label="Length Sanity" score={summaryEvalResult.freeChecks?.lengthSanity?.score} />

              {summaryEvalResult.faithfulnessIssues?.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Faithfulness Issues</div>
                  {summaryEvalResult.faithfulnessIssues.map((issue, i) => (
                    <div key={i} style={{ fontSize: 12, color: '#A32D2D', padding: '3px 0' }}>
                      • {issue}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── CHAIN EVAL ── */}
      {activeTab === 'chain-eval' && (
        <div style={CARD}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <select
              value={selectedChain?.id || ''}
              onChange={(e) => {
                const chain = chains.find(c => c.id === e.target.value);
                setSelectedChain(chain || null);
                setChainEvalResult(null);
              }}
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
              onClick={() => handleRunChainEval(selectedChain)}
              disabled={!selectedChain?.id || evalRunning}
              style={{
                padding: '8px 16px', borderRadius: 8, border: 'none',
                background: !selectedChain?.id || evalRunning ? '#ccc' : '#1B4F9C',
                color: '#fff', fontSize: 13, fontWeight: 500,
                cursor: !selectedChain?.id || evalRunning ? 'not-allowed' : 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {evalRunning ? 'Running…' : 'Run Eval'}
            </button>
          </div>

          {chainEvalResult && (
            <div style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
                <ScoreCircle score={chainEvalResult.overall} />
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>Overall Score</div>
              </div>

              <EvalBar
                label="Citation Grounding"
                score={chainEvalResult.citationGrounding}
                note={chainEvalResult.citationsChecked != null
                  ? `${chainEvalResult.citationsChecked} citations checked` : undefined}
              />
              <EvalBar
                label="Contradiction Reality"
                score={chainEvalResult.contradictionReality}
                note={chainEvalResult.contradictionsChecked != null
                  ? `${chainEvalResult.contradictionsChecked} contradictions checked` : undefined}
              />
              <EvalBar
                label="Gap Novelty"
                score={chainEvalResult.gapNovelty}
                note={chainEvalResult.gapsChecked != null
                  ? `${chainEvalResult.gapsChecked} gaps checked` : undefined}
              />
              <EvalBar label="Synthesis Quality" score={chainEvalResult.synthesisQuality} />
              {chainEvalResult.synthesisReason && (
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: -6, marginBottom: 10 }}>
                  {chainEvalResult.synthesisReason}
                </div>
              )}
              <EvalBar label="Citation Density" score={chainEvalResult.citationDensity} />

              {chainEvalResult.citationDetails?.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Citation Details</div>
                  {chainEvalResult.citationDetails.map((d, i) => (
                    <div key={i} style={{
                      fontSize: 12, padding: '4px 0',
                      borderTop: i > 0 ? '0.5px solid var(--border)' : 'none',
                      display: 'flex', gap: 8,
                    }}>
                      <span style={{ color: d.accurate || d.ok ? '#27500A' : '#A32D2D', flexShrink: 0 }}>
                        {d.accurate || d.ok ? '✓' : '✗'}
                      </span>
                      <span style={{ color: 'var(--muted)' }}>{d.reason}</span>
                    </div>
                  ))}
                </div>
              )}

              {chainEvalResult.contradictionDetails?.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Contradiction Details</div>
                  {chainEvalResult.contradictionDetails.map((d, i) => (
                    <div key={i} style={{
                      fontSize: 12, padding: '4px 0',
                      borderTop: i > 0 ? '0.5px solid var(--border)' : 'none',
                      display: 'flex', gap: 8,
                    }}>
                      <span style={{ color: d.valid || d.ok ? '#27500A' : '#A32D2D', flexShrink: 0 }}>
                        {d.valid || d.ok ? '✓' : '✗'}
                      </span>
                      <span style={{ color: 'var(--muted)' }}>{d.reason}</span>
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

function EvalBar({ label, score, note }) {
  const isNull = score === null || score === undefined || isNaN(score);
  const color = isNull ? '#ccc'
    : score >= 80 ? '#22c55e'
    : score >= 60 ? '#f59e0b' : '#ef4444';
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
        <span>{label}</span>
        <span style={{ fontWeight: 600, color }}>{isNull ? 'N/A' : score + '%'}</span>
      </div>
      <div style={{ background: '#e5e7eb', borderRadius: 4, height: 6, overflow: 'hidden' }}>
        <div style={{ width: isNull ? 0 : score + '%', background: color,
          height: '100%', transition: 'width 0.4s' }} />
      </div>
      {note && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{note}</div>}
    </div>
  );
}

function ScoreCircle({ score }) {
  const isNull = score === null || score === undefined || isNaN(score);
  const color = isNull ? '#9ca3af'
    : score >= 80 ? '#22c55e'
    : score >= 60 ? '#f59e0b' : '#ef4444';
  return (
    <div style={{ width: 64, height: 64, borderRadius: '50%',
      border: '4px solid ' + color, display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      fontSize: 18, fontWeight: 700, color }}>
      {isNull ? '–' : score}
    </div>
  );
}
