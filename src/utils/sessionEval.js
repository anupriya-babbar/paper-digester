const SESSION_KEY = 'pd-session-eval';

function getTodayDate() {
  return new Date().toISOString().split('T')[0];
}

export function getSessionEval() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return createFreshSession();
    const data = JSON.parse(raw);
    if (data.date !== getTodayDate()) return createFreshSession();
    return data;
  } catch (e) {
    return createFreshSession();
  }
}

function createFreshSession() {
  const fresh = { date: getTodayDate(), summaries: [], chains: [] };
  localStorage.setItem(SESSION_KEY, JSON.stringify(fresh));
  return fresh;
}

export function saveSummaryEval(paperId, title, scores, overall) {
  const session = getSessionEval();
  const idx = session.summaries.findIndex((s) => s.paperId === paperId);
  const entry = { paperId, title, scores, overall, evaluatedAt: new Date().toISOString() };
  if (idx >= 0) {
    session.summaries[idx] = entry;
  } else {
    session.summaries.push(entry);
  }
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function saveChainEval(chainId, name, scores, overall) {
  const session = getSessionEval();
  const idx = session.chains.findIndex((c) => c.chainId === chainId);
  const entry = { chainId, name, scores, overall, evaluatedAt: new Date().toISOString() };
  if (idx >= 0) {
    session.chains[idx] = entry;
  } else {
    session.chains.push(entry);
  }
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function getSessionStats() {
  const session = getSessionEval();
  if (session.summaries.length === 0 && session.chains.length === 0) return null;

  const summaryCount = session.summaries.length;
  const summaryOverall = summaryCount > 0
    ? Math.round(session.summaries.reduce((a, s) => a + s.overall, 0) / summaryCount)
    : null;

  const dims = ['problem', 'approach', 'results', 'impact', 'clarity'];
  const dimAvgs = {};
  dims.forEach((d) => {
    const vals = session.summaries.map((s) => s.scores?.[d]).filter((v) => v != null);
    dimAvgs[d] = vals.length > 0
      ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
      : null;
  });

  const chainCount = session.chains.length;
  const chainOverall = chainCount > 0
    ? Math.round(session.chains.reduce((a, c) => a + c.overall, 0) / chainCount)
    : null;

  const needsAttention = session.summaries
    .filter((s) => s.overall < 70)
    .map((s) => ({ title: s.title, overall: s.overall, weakest: getWeakestDimension(s.scores) }))
    .sort((a, b) => a.overall - b.overall);

  return {
    date: session.date,
    summaryCount,
    summaryOverall,
    dimAvgs,
    chainCount,
    chainOverall,
    needsAttention,
    summaries: session.summaries,
    chains: session.chains,
  };
}

function getWeakestDimension(scores) {
  if (!scores) return null;
  const labels = {
    problem: 'Problem Statement',
    approach: 'Method / Approach',
    results: 'Results & Evidence',
    impact: 'Impact & Significance',
    clarity: 'Clarity for Non-Expert',
  };
  const entries = Object.entries(scores)
    .filter(([, v]) => v != null)
    .sort((a, b) => a[1] - b[1]);
  return entries[0] ? labels[entries[0][0]] : null;
}

export function getPaperEvalStatus(paperId) {
  const session = getSessionEval();
  const found = session.summaries.find((s) => s.paperId === paperId);
  if (!found) return null;
  return { overall: found.overall, scores: found.scores, evaluatedAt: found.evaluatedAt };
}
