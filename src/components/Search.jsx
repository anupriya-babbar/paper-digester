import { useState, useEffect, useRef } from 'react';
import { useClaude } from '../hooks/useClaude';
import { full as fullPrompt } from '../prompts/digestPrompts';
import SummaryPanel from './SummaryPanel';

// ─── Access detection (arXiv + PMC only) ─────────────────────────────────────

function checkFreeAccess(paper) {
  if (paper.externalIds?.ArXiv) {
    const arxivId = paper.externalIds.ArXiv;
    return Promise.resolve({
      source: 'arXiv',
      arxivId,
      pdfUrl: `https://arxiv.org/pdf/${arxivId}`,
      htmlUrl: `https://arxiv.org/abs/${arxivId}`,
    });
  }
  if (paper.externalIds?.PubMedCentral) {
    const pmcId = paper.externalIds.PubMedCentral;
    return Promise.resolve({
      source: 'PMC',
      pmcId,
      pdfUrl: null,
      htmlUrl: `https://www.ncbi.nlm.nih.gov/pmc/articles/${pmcId}/`,
    });
  }
  return Promise.resolve(null);
}

// ─── Text fetching for summarization ─────────────────────────────────────────

async function fetchRemoteText(access) {
  if (access.source === 'PMC') {
    try {
      const res = await fetch(`/api/fetch-text?pmcid=${access.pmcId}`);
      if (res.ok) {
        const text = await res.text();
        if (text.length > 500) return text.slice(0, 8000);
      }
    } catch {}
  }
  if (access.source === 'arXiv') {
    try {
      const res = await fetch(`https://export.arxiv.org/abs/${access.arxivId}`);
      if (res.ok) {
        const html = await res.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const abstract = doc.querySelector('.abstract')?.textContent?.trim() || '';
        const title = doc.querySelector('.title')?.textContent?.trim() || '';
        const combined = `${title}\n\n${abstract}`;
        if (combined.length > 100) return combined;
      }
    } catch {}
  }
  return null;
}

// ─── Semantic Scholar search ──────────────────────────────────────────────────

async function searchPapers(query, offset = 0) {
  const fields = 'title,abstract,year,authors,externalIds,citationCount,venue';
  const res = await fetch(
    `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=8&offset=${offset}&fields=${fields}`
  );
  if (!res.ok) throw new Error('Search failed');
  return res.json();
}

// ─── Summarization ────────────────────────────────────────────────────────────

async function summarizePaper(paper, text, callClaude) {
  const authorStr =
    (paper.authors || []).slice(0, 3).map((a) => a.name).join(', ') +
    ((paper.authors || []).length > 3 ? ' et al.' : '');

  const prompt = `You must respond with ONLY a valid JSON object. No markdown. No backticks. Start with { end with }.

Analyze this research paper and return exactly:
{
  "title": "${paper.title.replace(/"/g, "'")}",
  "authors": "${authorStr}",
  "year": "${paper.year || 'Unknown'}",
  "oneliner": "one sentence describing what this paper contributes and its field",
  "concept": "2-3 sentences explaining the core idea simply, use an analogy if helpful",
  "key_advantage": "what makes this novel or interesting in one sentence",
  "keywords": ["tag1","tag2","tag3","tag4"],
  "readTime": 5,
  "complexity": "Intermediate"
}

Paper text:
${(text || paper.abstract || '').slice(0, 3000)}`;

  const raw = await callClaude(prompt, 600);
  return JSON.parse(raw);
}

// ─── Component ────────────────────────────────────────────────────────────────

const TAG_COLORS = [
  { bg: '#EAF3DE', color: '#3B6D11' },
  { bg: '#EEEDFE', color: '#3C3489' },
  { bg: '#FAEEDA', color: '#854F0B' },
];

export default function Search({ onPaperSaved, library, onSwitchToLibrary }) {
  const { callClaude } = useClaude();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [accessMap, setAccessMap] = useState({});
  const [addStatus, setAddStatus] = useState({});   // 'added' | 'error'
  const [dlStatus, setDlStatus] = useState({});     // 'downloading' | 'done' | 'opened'
  const [dlNotice, setDlNotice] = useState({});     // bool
  const checkedRef = useRef(new Set());

  // Panel state
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelPaper, setPanelPaper] = useState(null);
  const [panelSummary, setPanelSummary] = useState(null);
  const [panelStatus, setPanelStatus] = useState('fetching');
  const [panelSummarySource, setPanelSummarySource] = useState('abstract');

  // Auto-check access when results load
  useEffect(() => {
    results.forEach((paper) => {
      if (!checkedRef.current.has(paper.paperId)) {
        checkedRef.current.add(paper.paperId);
        checkFreeAccess(paper).then((access) => {
          setAccessMap((prev) => ({ ...prev, [paper.paperId]: access || 'paywalled' }));
        });
      }
    });
  }, [results]);

  async function handleSearch(newOffset = 0) {
    if (!query.trim()) return;
    setLoading(true);
    setError('');
    if (newOffset === 0) {
      setResults([]);
      checkedRef.current = new Set();
      setAccessMap({});
    }
    try {
      const data = await searchPapers(query, newOffset);
      setResults((prev) => (newOffset === 0 ? data.data : [...prev, ...data.data]));
      setTotal(data.total || 0);
      setOffset(newOffset + data.data.length);
    } catch {
      setError('Search failed. Please try again in a moment.');
    } finally {
      setLoading(false);
    }
  }

  // Download PDF to device + save to My Downloads (unsummarized)
  async function handleDownload(paper) {
    const id = paper.paperId;
    const access = accessMap[id];
    if (!access || access.source !== 'arXiv') return;

    setDlStatus((prev) => ({ ...prev, [id]: 'downloading' }));
    try {
      const proxyUrl = `/api/fetch-pdf?url=${encodeURIComponent(access.pdfUrl)}`;
      const res = await fetch(proxyUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buffer = await res.arrayBuffer();

      const blob = new Blob([buffer], { type: 'application/pdf' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = paper.title.slice(0, 60).replace(/[^a-z0-9]/gi, '_') + '.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);

      const authorStr =
        (paper.authors || []).slice(0, 3).map((a) => a.name).join(', ') +
        ((paper.authors || []).length > 3 ? ' et al.' : '');

      onPaperSaved({
        id: Date.now().toString(),
        title: paper.title,
        authors: authorStr,
        year: String(paper.year || 'Unknown'),
        tldr: paper.abstract?.slice(0, 200) || '',
        keywords: [],
        source: 'download',
        summarized: false,
        arxivId: access.arxivId,
        pdfUrl: access.pdfUrl,
        abstract: paper.abstract || '',
        citationCount: paper.citationCount || 0,
        addedAt: new Date().toISOString(),
      });

      setDlStatus((prev) => ({ ...prev, [id]: 'done' }));
      setDlNotice((prev) => ({ ...prev, [id]: true }));
    } catch {
      window.open(access.pdfUrl, '_blank');
      setDlStatus((prev) => ({ ...prev, [id]: 'opened' }));
    }
  }

  // Open summary panel for a paper
  async function handleOpenPanel(paper) {
    const id = paper.paperId;
    const access = accessMap[id];

    setPanelPaper(paper);
    setPanelSummary(null);
    setPanelSummarySource('abstract');
    setPanelStatus('fetching');
    setPanelOpen(true);

    let text = paper.abstract || '';
    if (access && access !== 'paywalled') {
      try {
        const fetched = await fetchRemoteText(access);
        if (fetched && fetched.length > 200) {
          text = fetched;
          setPanelSummarySource('full-text');
        }
      } catch {}
    }

    setPanelStatus('analyzing');
    try {
      const raw = await callClaude(fullPrompt(text), 1200);
      const summary = JSON.parse(raw);
      setPanelSummary(summary);
      setPanelStatus('done');
    } catch {
      setPanelStatus('error');
    }
  }

  function handlePanelSave(summary) {
    if (onPaperSaved && panelPaper) {
      const authorStr =
        (panelPaper.authors || []).slice(0, 3).map((a) => a.name).join(', ') +
        ((panelPaper.authors || []).length > 3 ? ' et al.' : '');
      onPaperSaved({
        id: Date.now().toString(),
        title: summary.title || panelPaper.title,
        authors: summary.authors || authorStr,
        year: String(summary.year || panelPaper.year || ''),
        tldr: summary.concept || '',
        oneliner: summary.oneliner || '',
        key_advantage: summary.key_advantage || '',
        mechanics: summary.mechanics || [],
        results: summary.results || '',
        figures: summary.figures || '',
        findings: '',
        keywords: summary.keywords || [],
        mode: 'full',
        source: 'search',
        summarySource: panelSummarySource,
        summarized: true,
        citationCount: panelPaper.citationCount,
        venue: panelPaper.venue || '',
        addedAt: new Date().toISOString(),
      });
      setAddStatus((prev) => ({ ...prev, [panelPaper.paperId]: 'added' }));
    }
    setPanelOpen(false);
  }

  const isInLibrary = (paper) =>
    library.some((p) => p.title === paper.title) ||
    addStatus[paper.paperId] === 'added';

  return (
    <>
    <div>
      {/* Search bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch(0)}
          placeholder="e.g. transformer models, CRISPR gene editing, climate change…"
          style={{
            flex: 1, padding: '10px 14px', borderRadius: 8,
            border: '0.5px solid #d1d5db', fontSize: 14,
            fontFamily: 'inherit', outline: 'none',
          }}
        />
        <button
          onClick={() => handleSearch(0)}
          disabled={loading || !query.trim()}
          style={{
            padding: '10px 20px', borderRadius: 8,
            background: loading || !query.trim() ? '#9ca3af' : '#1B4F9C',
            color: '#fff', border: 'none', fontSize: 14, fontWeight: 600,
            cursor: loading || !query.trim() ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Searching…' : 'Search'}
        </button>
      </div>

      {/* Source badges */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: '#9ca3af' }}>Sources:</span>
        {['Semantic Scholar', 'arXiv', 'PubMed Central'].map((s) => (
          <span key={s} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 10, background: '#EEEDFE', color: '#3C3489', fontWeight: 500 }}>
            {s}
          </span>
        ))}
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '0.5px solid #fca5a5', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#dc2626', marginBottom: 12 }}>
          {error}
        </div>
      )}

      {total > 0 && (
        <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 12 }}>
          {total.toLocaleString()} papers found
        </div>
      )}

      {/* Result cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {results.map((paper) => {
          const id = paper.paperId;
          const access = accessMap[id];
          const isArXiv = access && access !== 'paywalled' && access.source === 'arXiv';
          const isPMC = access && access !== 'paywalled' && access.source === 'PMC';
          const isFree = isArXiv || isPMC;
          const isPaywalled = access === 'paywalled';
          const isChecking = !access;
          const added = isInLibrary(paper);
          const add = addStatus[id];
          const dl = dlStatus[id];
          const downloadBusy = dl === 'downloading';

          return (
            <div
              key={id}
              className="fade-in"
              style={{ background: '#fff', border: '0.5px solid #e0e3e8', borderRadius: 12, padding: '16px 18px' }}
            >
              {/* Title */}
              <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.4, marginBottom: 4 }}>
                {paper.title}
              </div>

              {/* Meta */}
              <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 8 }}>
                {(paper.authors || []).slice(0, 3).map((a) => a.name).join(', ')}
                {(paper.authors || []).length > 3 ? ' et al.' : ''}
                {paper.year ? ` · ${paper.year}` : ''}
                {paper.venue ? ` · ${paper.venue}` : ''}
                {paper.citationCount > 0 ? ` · ${paper.citationCount.toLocaleString()} citations` : ''}
              </div>

              {/* Abstract */}
              {paper.abstract && (
                <div style={{
                  fontSize: 13, color: '#6b7280', lineHeight: 1.6, marginBottom: 12,
                  display: '-webkit-box', WebkitLineClamp: 3,
                  WebkitBoxOrient: 'vertical', overflow: 'hidden',
                }}>
                  {paper.abstract}
                </div>
              )}

              {/* Tag pills */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                {[paper.venue, paper.year ? String(paper.year) : null]
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((tag, i) => {
                    const c = TAG_COLORS[i % TAG_COLORS.length];
                    return (
                      <span key={i} style={{ background: c.bg, color: c.color, padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 500 }}>
                        {tag}
                      </span>
                    );
                  })}
              </div>

              {/* ── ACCESS ROW ── */}
              {isChecking && (
                <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 10, padding: '6px 0' }}>
                  Checking access…
                </div>
              )}

              {isFree && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, padding: '7px 12px', background: '#EAF3DE', borderRadius: 7 }}>
                  <span style={{ fontSize: 12, color: '#3B6D11', fontWeight: 600 }}>
                    ✓ Full text via {access.source}
                  </span>
                  <a href={access.htmlUrl} target="_blank" rel="noopener noreferrer"
                    style={{ marginLeft: 'auto', fontSize: 12, color: '#1B4F9C', fontWeight: 500, textDecoration: 'none' }}>
                    View ↗
                  </a>
                </div>
              )}

              {isPaywalled && (
                <div style={{ fontSize: 12, color: '#854F0B', background: '#FAEEDA', padding: '7px 12px', borderRadius: 7, marginBottom: 12 }}>
                  ⚠ Abstract only — full text not freely available
                </div>
              )}

              {/* ── ACTIONS ── */}

              {/* arXiv: Download + Summarize */}
              {isArXiv && !added && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => !downloadBusy && !dl && handleDownload(paper)}
                      disabled={downloadBusy || dl === 'done'}
                      style={{
                        flex: 1, padding: '9px 10px', borderRadius: 7,
                        border: '0.5px solid #d1d5db',
                        background: dl === 'done' ? '#EAF3DE' : '#fff',
                        color: dl === 'done' ? '#3B6D11' : '#374151',
                        fontSize: 13, fontWeight: 600,
                        cursor: downloadBusy || dl === 'done' ? 'default' : 'pointer',
                      }}
                    >
                      {dl === 'downloading' && '⬇ Downloading…'}
                      {dl === 'done' && '✓ Downloaded'}
                      {dl === 'opened' && '✓ Opened in tab'}
                      {!dl && '⬇ Download'}
                    </button>
                    <button
                      onClick={() => handleOpenPanel(paper)}
                      style={{
                        flex: 1, padding: '9px 10px', borderRadius: 7, border: 'none',
                        background: '#1B4F9C', color: '#fff', fontSize: 13, fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      ✦ Summarize
                    </button>
                  </div>
                  {dlNotice[id] && (
                    <div style={{ fontSize: 12, color: '#3B6D11', textAlign: 'center', padding: '4px 0' }}>
                      Saved to My Downloads in Library
                    </div>
                  )}
                </div>
              )}

              {/* PMC: Summarize only */}
              {isPMC && !added && (
                <button
                  onClick={() => handleOpenPanel(paper)}
                  style={{
                    width: '100%', padding: '9px', borderRadius: 7, border: 'none',
                    background: '#1B4F9C', color: '#fff', fontSize: 13, fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  ✦ Summarize
                </button>
              )}

              {/* Added confirmation */}
              {added && (
                <div style={{ padding: '8px 12px', background: '#EAF3DE', borderRadius: 7, fontSize: 13, color: '#3B6D11', fontWeight: 600 }}>
                  ✓ Added to Library
                </div>
              )}

              {/* Paywalled */}
              {isPaywalled && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <a
                    href={`https://scholar.google.com/scholar?q=${encodeURIComponent(paper.title)}`}
                    target="_blank" rel="noopener noreferrer"
                    style={{ flex: 1, padding: '8px', borderRadius: 6, border: '0.5px solid #d1d5db', background: '#fff', fontSize: 12, color: '#374151', textDecoration: 'none', textAlign: 'center', fontWeight: 500 }}
                  >
                    Google Scholar ↗
                  </a>
                  <a
                    href={`https://www.semanticscholar.org/paper/${id}`}
                    target="_blank" rel="noopener noreferrer"
                    style={{ flex: 1, padding: '8px', borderRadius: 6, border: '0.5px solid #d1d5db', background: '#fff', fontSize: 12, color: '#374151', textDecoration: 'none', textAlign: 'center', fontWeight: 500 }}
                  >
                    Semantic Scholar ↗
                  </a>
                </div>
              )}

              {/* Checking fallback link */}
              {isChecking && (
                <a href={`https://www.semanticscholar.org/paper/${id}`} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'block', padding: '8px', borderRadius: 6, border: '0.5px solid #d1d5db', background: '#fff', fontSize: 12, color: '#374151', textDecoration: 'none', textAlign: 'center' }}>
                  View on Semantic Scholar ↗
                </a>
              )}

              {add === 'error' && (
                <div style={{ fontSize: 12, color: '#dc2626', marginTop: 8 }}>
                  Failed — try again.
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Load more */}
      {results.length > 0 && results.length < total && (
        <button
          onClick={() => handleSearch(offset)}
          disabled={loading}
          style={{ width: '100%', marginTop: 16, padding: '10px', borderRadius: 8, border: '0.5px solid #d1d5db', background: 'transparent', fontSize: 14, cursor: 'pointer', color: '#374151' }}
        >
          {loading ? 'Loading…' : `Load more (${total - results.length} remaining)`}
        </button>
      )}

      {/* Empty state */}
      {results.length === 0 && !loading && !error && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#9ca3af' }}>
          <div style={{ fontSize: 40, marginBottom: 14 }}>🔬</div>
          <div style={{ fontWeight: 600, fontSize: 16, color: '#6b7280' }}>Search any research topic</div>
          <div style={{ fontSize: 14, marginTop: 6 }}>Powered by Semantic Scholar · 200M+ papers indexed</div>
        </div>
      )}
    </div>

    <SummaryPanel
      isOpen={panelOpen}
      paper={panelPaper ? { title: panelPaper.title } : null}
      status={panelStatus}
      summary={panelSummary}
      onClose={() => setPanelOpen(false)}
      onSave={handlePanelSave}
    />
    </>
  );
}
