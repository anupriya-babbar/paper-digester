export function extractSignals(library, chains) {
  // Signal 1: Top keywords from library papers
  const allKeywords = library
    .flatMap((p) => p.keywords || [])
    .filter(Boolean);

  const keywordCount = {};
  allKeywords.forEach((k) => {
    const key = k.toLowerCase();
    keywordCount[key] = (keywordCount[key] || 0) + 1;
  });

  const topKeywords = Object.entries(keywordCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([k]) => k);

  // Signal 2: Research gaps from chain syntheses
  const gaps = chains
    .filter((c) => c.synthesis?.gaps)
    .flatMap((c) => c.synthesis.gaps)
    .map((g) => g.gap || g.claim || '')
    .filter(Boolean)
    .slice(0, 3);

  // Convert gaps to short search queries
  const gapQueries = gaps
    .map((gap) =>
      gap
        .split(' ')
        .filter((w) => w.length > 4)
        .slice(0, 4)
        .join(' ')
    )
    .filter(Boolean);

  return { topKeywords, gapQueries };
}

export function isNewPaper(publicationDate) {
  if (!publicationDate) return false;
  const published = new Date(publicationDate);
  const now = new Date();
  const diffDays = (now - published) / (1000 * 60 * 60 * 24);
  return diffDays <= 30;
}

export function buildSearchQueries(topKeywords, gapQueries) {
  const queries = [];

  if (topKeywords.length > 0) {
    queries.push(topKeywords.slice(0, 3).join(' '));
  }

  gapQueries.forEach((q) => {
    if (q) queries.push(q);
  });

  if (queries.length === 0) {
    queries.push('machine learning neural network');
  }

  return queries.slice(0, 3);
}
