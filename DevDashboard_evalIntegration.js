// src/components/DevDashboard_evalIntegration.js
// ─────────────────────────────────────────────────────────────────────────────
// INTEGRATION GUIDE — How to wire the new eval system into DevDashboard.jsx
// Drop each block into the indicated place in your existing DevDashboard.
// ─────────────────────────────────────────────────────────────────────────────

// ═══════════════════════════════════════════════════════════════════════
// 1. IMPORTS — add to top of DevDashboard.jsx
// ═══════════════════════════════════════════════════════════════════════
import { useEval } from '../hooks/useEval';
import { getAllEvalResults, getEvalResult, computeOverviewStats } from '../utils/evalStorage';

// ═══════════════════════════════════════════════════════════════════════
// 2. STATE — add inside DevDashboard component
// ═══════════════════════════════════════════════════════════════════════
const { runSummaryEval, runChainEval } = useEval();

const [evalRunning, setEvalRunning] = useState(false);
const [summaryEvalResult, setSummaryEvalResult] = useState(null);
const [chainEvalResult,   setChainEvalResult]   = useState(null);
const [overviewStats,     setOverviewStats]     = useState(null);
const [overviewLoading,   setOverviewLoading]   = useState(true);

// ═══════════════════════════════════════════════════════════════════════
// 3. LOAD OVERVIEW — fetch all past eval results on mount
// ═══════════════════════════════════════════════════════════════════════
useEffect(() => {
  if (!user?.id) return;
  setOverviewLoading(true);
  getAllEvalResults(user.id).then(records => {
    setOverviewStats(computeOverviewStats(records));
    setOverviewLoading(false);
  });
}, [user?.id]);

// ═══════════════════════════════════════════════════════════════════════
// 4a. RUN SUMMARY EVAL — call from Summary Eval tab's "Run Eval" button
// selectedPaper is the paper object chosen by the user
// ═══════════════════════════════════════════════════════════════════════
const handleRunSummaryEval = async (selectedPaper) => {
  if (!selectedPaper) return;
  setEvalRunning(true);
  setSummaryEvalResult(null);
  try {
    const results = await runSummaryEval(selectedPaper, user?.id);
    setSummaryEvalResult(results);
  } finally {
    setEvalRunning(false);
  }
};

// ═══════════════════════════════════════════════════════════════════════
// 4b. RUN CHAIN EVAL — call from Chain Eval tab's "Run Eval" button
// selectedChain is the chain object; papers is the full library array
// ═══════════════════════════════════════════════════════════════════════
const handleRunChainEval = async (selectedChain, papers) => {
  if (!selectedChain) return;
  setEvalRunning(true);
  setChainEvalResult(null);
  try {
    const results = await runChainEval(selectedChain, papers, user?.id);
    setChainEvalResult(results);
  } finally {
    setEvalRunning(false);
  }
};

// ═══════════════════════════════════════════════════════════════════════
// 5. OVERVIEW TAB JSX — replace the old session-eval Overview section
// ═══════════════════════════════════════════════════════════════════════
const OverviewTab = () => {
  if (overviewLoading) return <div className="eval-loading">Loading eval history…</div>;
  if (!overviewStats) return <div className="eval-empty">No evals run yet.</div>;

  const { avgSummary, avgChain, needsAttention, summaryCount, chainCount } = overviewStats;

  return (
    <div className="overview-grid">

      {/* Summary summary card */}
      <div className="eval-card">
        <h3>Summary Eval</h3>
        <p className="eval-count">{summaryCount} papers evaluated</p>
        {avgSummary && <>
          <EvalBar label="Overall"        score={avgSummary.overall} />
          <EvalBar label="Faithfulness"   score={avgSummary.faithfulness} />
          <EvalBar label="Coverage"       score={avgSummary.coverage} />
          <EvalBar label="Mode Fidelity"  score={avgSummary.modeFidelity} />
          <EvalBar label="Free Checks"    score={avgSummary.freeScore} />
        </>}
      </div>

      {/* Chain summary card */}
      <div className="eval-card">
        <h3>Chain Eval</h3>
        <p className="eval-count">{chainCount} chains evaluated</p>
        {avgChain && <>
          <EvalBar label="Overall"              score={avgChain.overall} />
          <EvalBar label="Citation Grounding"   score={avgChain.citationGrounding} />
          <EvalBar label="Contradiction Reality" score={avgChain.contradictionReality} />
          <EvalBar label="Gap Novelty"          score={avgChain.gapNovelty} />
          <EvalBar label="Synthesis Quality"    score={avgChain.synthesisQuality} />
          <EvalBar label="Citation Density"     score={avgChain.citationDensity} />
        </>}
      </div>

      {/* Needs attention list */}
      {needsAttention?.length > 0 && (
        <div className="eval-card needs-attention">
          <h3>⚠ Needs Attention (&lt; 70)</h3>
          {needsAttention.map(item => (
            <div key={item.title} className="attention-row">
              <span className="attention-title">{item.title}</span>
              <span className="attention-score" data-score={item.score}>{item.score}</span>
              <span className="attention-dim">weak: {item.weakest}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════
// 6. SUMMARY EVAL TAB JSX — replace the old 5-question checklist section
// ═══════════════════════════════════════════════════════════════════════
const SummaryEvalTab = ({ papers }) => {
  const [selected, setSelected] = useState(null);

  return (
    <div className="summary-eval-tab">
      {/* Paper picker */}
      <select onChange={e => setSelected(papers.find(p => p.id === e.target.value))}>
        <option value="">— Select a paper —</option>
        {papers.filter(p => p.summarized).map(p => (
          <option key={p.id} value={p.id}>{p.title}</option>
        ))}
      </select>

      <button
        onClick={() => handleRunSummaryEval(selected)}
        disabled={!selected || evalRunning}
      >
        {evalRunning ? 'Running…' : 'Run Eval'}
      </button>

      {!summaryEvalResult?.hasAbstract && selected && (
        <p className="eval-warning">
          ⚠ No abstract stored for this paper — faithfulness and coverage checks will be skipped.
          Open the paper in PaperView to trigger an arXiv abstract fetch, then re-run.
        </p>
      )}

      {summaryEvalResult && (
        <div className="eval-results">
          <div className="eval-overall">
            <span>Overall</span>
            <ScoreCircle score={summaryEvalResult.overall} />
          </div>

          <div className="eval-dims">
            <EvalBar label="Faithfulness"  score={summaryEvalResult.faithfulness}
              note={summaryEvalResult.faithfulnessIssues?.length
                ? `${summaryEvalResult.faithfulnessIssues.length} issue(s) found`
                : 'No issues'} />
            <EvalBar label="Coverage"      score={summaryEvalResult.coverage}
              note={summaryEvalResult.mainContribution} />
            <EvalBar label="Mode Fidelity" score={summaryEvalResult.modeFidelity}
              note={summaryEvalResult.modeFidelityIssues?.join(', ')} />
          </div>

          <div className="eval-free-checks">
            <h4>Free Checks</h4>
            <EvalBar label="Keyword Coverage"    score={summaryEvalResult.freeChecks?.keywordCoverage?.score} />
            <EvalBar label="Number Preservation" score={summaryEvalResult.freeChecks?.numberPreservation?.score} />
            {summaryEvalResult.freeChecks?.lengthSanity && (
              <EvalBar label="Length Sanity" score={summaryEvalResult.freeChecks.lengthSanity.score}
                note={summaryEvalResult.freeChecks.lengthSanity.reason} />
            )}
          </div>

          {/* Issues list */}
          {summaryEvalResult.faithfulnessIssues?.length > 0 && (
            <div className="eval-issues">
              <h4>Faithfulness Issues</h4>
              <ul>
                {summaryEvalResult.faithfulnessIssues.map((issue, i) => (
                  <li key={i}>{issue}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════
// 7. CHAIN EVAL TAB JSX — replace the old citation/contradiction/gap section
// ═══════════════════════════════════════════════════════════════════════
const ChainEvalTab = ({ chains, papers }) => {
  const [selected, setSelected] = useState(null);

  return (
    <div className="chain-eval-tab">
      <select onChange={e => setSelected(chains.find(c => c.id === e.target.value))}>
        <option value="">— Select a chain —</option>
        {chains.map(c => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>

      <button
        onClick={() => handleRunChainEval(selected, papers)}
        disabled={!selected || evalRunning}
      >
        {evalRunning ? 'Running…' : 'Run Eval'}
      </button>

      {chainEvalResult && (
        <div className="eval-results">
          <div className="eval-overall">
            <span>Overall</span>
            <ScoreCircle score={chainEvalResult.overall} />
          </div>

          <div className="eval-dims">
            <EvalBar label="Citation Grounding"    score={chainEvalResult.citationGrounding}
              note={`${chainEvalResult.citationsChecked} citations checked`} />
            <EvalBar label="Contradiction Reality"  score={chainEvalResult.contradictionReality}
              note={`${chainEvalResult.contradictionsChecked} contradictions checked`} />
            <EvalBar label="Gap Novelty"            score={chainEvalResult.gapNovelty}
              note={`${chainEvalResult.gapsChecked} gaps checked`} />
            <EvalBar label="Synthesis Quality"      score={chainEvalResult.synthesisQuality}
              note={chainEvalResult.synthesisReason} />
            <EvalBar label="Citation Density"       score={chainEvalResult.citationDensity} />
          </div>

          {/* Per-citation detail */}
          {chainEvalResult.citationDetails?.length > 0 && (
            <div className="eval-detail">
              <h4>Citation Grounding Detail</h4>
              {chainEvalResult.citationDetails.map((r, i) => (
                <div key={i} className={`detail-row ${r.grounded ? 'pass' : 'fail'}`}>
                  <span>{r.grounded ? '✓' : '✗'}</span>
                  <span>{r.reason}</span>
                </div>
              ))}
            </div>
          )}

          {/* Per-contradiction detail */}
          {chainEvalResult.contradictionDetails?.length > 0 && (
            <div className="eval-detail">
              <h4>Contradiction Reality Detail</h4>
              {chainEvalResult.contradictionDetails.map((r, i) => (
                <div key={i} className={`detail-row ${r.valid ? 'pass' : 'fail'}`}>
                  <span>{r.valid ? '✓' : '✗'}</span>
                  <span>{r.reason}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════
// 8. SHARED UI COMPONENTS — add anywhere in DevDashboard or a sub-file
// ═══════════════════════════════════════════════════════════════════════

function EvalBar({ label, score, note }) {
  const isNull = score === null || score === undefined || isNaN(score);
  const color = isNull ? '#ccc' : score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444';
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
        <span>{label}</span>
        <span style={{ fontWeight: 600, color }}>{isNull ? 'N/A' : `${score}%`}</span>
      </div>
      <div style={{ background: '#e5e7eb', borderRadius: 4, height: 6, overflow: 'hidden' }}>
        <div style={{ width: isNull ? 0 : `${score}%`, background: color, height: '100%', transition: 'width 0.4s' }} />
      </div>
      {note && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{note}</div>}
    </div>
  );
}

function ScoreCircle({ score }) {
  const isNull = score === null || score === undefined || isNaN(score);
  const color = isNull ? '#9ca3af' : score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444';
  return (
    <div style={{
      width: 64, height: 64, borderRadius: '50%',
      border: `4px solid ${color}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 18, fontWeight: 700, color
    }}>
      {isNull ? '–' : score}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// 9. SIDEBAR BADGE — listen for pd:evalComplete and show score
// Add this useEffect inside Sidebar.jsx or wherever paper cards render
// ═══════════════════════════════════════════════════════════════════════

// In Sidebar.jsx:
// const [evalScores, setEvalScores] = useState({}); // { [paperId]: overallScore }
// useEffect(() => {
//   const handler = (e) => {
//     const { paperId, results } = e.detail;
//     setEvalScores(prev => ({ ...prev, [paperId]: results.overall }));
//   };
//   window.addEventListener('pd:evalComplete', handler);
//   return () => window.removeEventListener('pd:evalComplete', handler);
// }, []);
//
// Then on each paper card:
// {evalScores[paper.id] !== undefined && (
//   <span className={`eval-badge ${evalScores[paper.id] >= 70 ? 'good' : 'warn'}`}>
//     {evalScores[paper.id]}
//   </span>
// )}
