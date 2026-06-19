import { useState } from 'react';
import { useClaude } from '../hooks/useClaude';
import { full as fullPrompt } from '../prompts/digestPrompts';
import SummaryPanel from './SummaryPanel';
import PaperTag from './PaperTag';

const TAG_COLORS = [
  { bg: '#EAF3DE', color: '#3B6D11' },
  { bg: '#EEEDFE', color: '#3C3489' },
  { bg: '#FAEEDA', color: '#854F0B' },
];

async function fetchArxivText(arxivId) {
  try {
    const res = await fetch(`/api/arxiv?id=${arxivId}`);
    if (!res.ok) return null;
    const xml = await res.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'text/xml');
    const abstract = doc.querySelector('entry > summary')
      ?.textContent?.trim()?.replace(/\s+/g, ' ');
    const title = doc.querySelector('entry > title')
      ?.textContent?.trim();
    const combined = `${title}\n\n${abstract}`;
    return combined.length > 100 ? combined : null;
  } catch (e) {
    console.warn('arXiv fetch failed:', e.message);
    return null;
  }
}

function LinkBtn({ href, label }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        padding: '5px 10px', background: '#f4f6f9', color: '#374151',
        border: '0.5px solid #d1d5db', borderRadius: 6,
        fontSize: 11, fontWeight: 500, textDecoration: 'none', whiteSpace: 'nowrap',
      }}
    >
      {label}
    </a>
  );
}

export default function PaperSearch({ onPaperSaved, library = [], initialOpen = false }) {
  const { callClaude } = useClaude();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(initialOpen);
  const [dlStatus, setDlStatus] = useState({});    // idx → 'downloading' | 'done' | 'opened'
  const [addedIdx, setAddedIdx] = useState(new Set()); // set of saved paper indices

  // Panel state
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelPaper, setPanelPaper] = useState(null);
  const [panelPaperIdx, setPanelPaperIdx] = useState(null);
  const [panelSummary, setPanelSummary] = useState(null);
  const [panelStatus, setPanelStatus] = useState('fetching');
  const [panelSummarySource, setPanelSummarySource] = useState('abstract');

  async function handleSearch() {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setResults(null);
    setDlStatus({});
    setAddedIdx(new Set());
    try {
      const res = await fetch(
        `/api/search?query=${encodeURIComponent(query.trim())}`
      );
      if (!res.ok) throw new Error('Search failed');
      const data = await res.json();

      const papers = data.data || [];

      if (papers.length === 0) {
        setError(data.message || 'No free papers found. Try different keywords.');
      } else {
        setResults(papers);
      }
    } catch (e) {
      setError('Search failed. Check your connection and try again.');
      console.error('Search error:', e);
    } finally {
      setLoading(false);
    }
  }

  async function handleDownload(paper, idx) {
    const titleLower = paper.title?.toLowerCase();
    const existsInLib = library.some((p) => p.title?.toLowerCase() === titleLower);
    if (existsInLib) {
      setDlStatus((prev) => ({ ...prev, [idx]: 'exists' }));
      return;
    }

    // arxiv_id comes from Claude search results; externalIds.ArXiv from Semantic Scholar shape
    const arxivId = paper.arxiv_id || paper.externalIds?.ArXiv || paper.arxivId;
    if (!arxivId) return;
    const pdfUrl = `https://arxiv.org/pdf/${arxivId}`;

    const paperToSave = {
      title: paper.title,
      authors: Array.isArray(paper.authors)
        ? paper.authors.slice(0, 3).map((a) => a.name || a).join(', ')
        : paper.authors || '',
      year: String(paper.year || 'Unknown'),
      tldr: paper.abstract?.slice(0, 300) || '',
      concept: '',
      findings: '',
      keywords: paper.keywords || [],
      source: 'download',
      summarized: false,
      arxivId,
      pdfUrl,
      citationCount: paper.citationCount || 0,
      abstract: paper.abstract || '',
      publicationDate: paper.publicationDate || null,
      isDemo: false,
    };

    setDlStatus((prev) => ({ ...prev, [idx]: 'downloading' }));
    try {
      const res = await fetch(`/api/fetch-pdf?url=${encodeURIComponent(pdfUrl)}`);
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
      if (onPaperSaved) {
        await onPaperSaved(paperToSave);
        console.log('Paper saved to library:', paperToSave.title);
      }
      setDlStatus((prev) => ({ ...prev, [idx]: 'done' }));
    } catch {
      // No server proxy available — open PDF in browser tab and still save to library
      window.open(pdfUrl, '_blank');
      if (onPaperSaved) {
        await onPaperSaved(paperToSave);
        console.log('Paper saved to library:', paperToSave.title);
      }
      setDlStatus((prev) => ({ ...prev, [idx]: 'opened' }));
    }
  }

  async function handleOpenPanel(paper, idx) {
    setPanelPaper(paper);
    setPanelPaperIdx(idx);
    setPanelSummary(null);
    setPanelSummarySource('abstract');
    setPanelStatus('fetching');
    setPanelOpen(true);

    let text = paper.abstract || '';
    if (paper.arxiv_id) {
      const fetched = await fetchArxivText(paper.arxiv_id);
      if (fetched) {
        text = fetched;
        setPanelSummarySource('full-text');
      }
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
      onPaperSaved({
        id: Date.now().toString(),
        title: summary.title || panelPaper.title || '',
        authors: summary.authors || panelPaper.authors || '',
        year: String(summary.year || panelPaper.year || ''),
        tldr: summary.concept || '',
        oneliner: summary.oneliner || '',
        key_advantage: summary.key_advantage || '',
        mechanics: summary.mechanics || [],
        results: summary.results || '',
        figures: summary.figures || '',
        findings: '',
        keywords: summary.keywords || panelPaper.keywords || [],
        mode: 'full',
        source: 'search',
        summarySource: panelSummarySource,
        summarized: true,
        addedAt: new Date().toISOString(),
      });
    }
    if (panelPaperIdx !== null) {
      setAddedIdx((prev) => new Set([...prev, panelPaperIdx]));
    }
    setPanelOpen(false);
  }

  const arXivAbsUrl = (id) => `https://arxiv.org/abs/${id}`;
  const scholarUrl = (t) => `https://scholar.google.com/scholar?q=${encodeURIComponent(t)}`;
  const semanticUrl = (t) => `https://www.semanticscholar.org/search?q=${encodeURIComponent(t)}`;

  return (
    <>
      <div style={{ marginBottom: 20 }}>
        {/* Toggle header */}
        <button
          onClick={() => setOpen((v) => !v)}
          style={{
            width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '12px 16px', background: open ? '#1B4F9C' : '#fff',
            color: open ? '#fff' : '#1B4F9C', border: '0.5px solid #1B4F9C',
            borderRadius: open ? '10px 10px 0 0' : 10, fontWeight: 600, fontSize: 14,
            cursor: 'pointer', transition: 'all 0.15s',
          }}
        >
          <span>🔍 Find Papers by Topic</span>
          <span style={{ fontSize: 18, lineHeight: 1 }}>{open ? '−' : '+'}</span>
        </button>

        {open && (
          <div
            style={{
              background: '#fff', border: '0.5px solid #1B4F9C', borderTop: 'none',
              borderRadius: '0 0 10px 10px', padding: 16,
            }}
          >
            {/* Search input */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="e.g. transformer attention, federated learning, protein folding…"
                style={{
                  flex: 1, padding: '9px 12px', border: '0.5px solid #d1d5db',
                  borderRadius: 7, fontSize: 13, outline: 'none', fontFamily: 'inherit',
                }}
              />
              <button
                onClick={handleSearch}
                disabled={loading || !query.trim()}
                style={{
                  padding: '9px 18px', background: loading || !query.trim() ? '#9ca3af' : '#1B4F9C',
                  color: '#fff', border: 'none', borderRadius: 7, fontWeight: 600, fontSize: 13,
                  cursor: loading || !query.trim() ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
                }}
              >
                {loading ? 'Searching…' : 'Find Papers'}
              </button>
            </div>

            <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 14 }}>
              Showing arXiv papers only — all can be summarized instantly
            </div>

            {error && <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 12 }}>{error}</div>}
            {results && results.length === 0 && (
              <div style={{ color: '#9ca3af', fontSize: 13 }}>No results. Try a different topic.</div>
            )}

            {results && results.map((paper, idx) => {
              const hasArxiv = !!paper.arxiv_id;
              const hasPMC = !!paper.pmc_id;
              const isFree = hasArxiv || hasPMC;
              const dl = dlStatus[idx];
              const saved = addedIdx.has(idx);

              return (
                <div
                  key={idx}
                  style={{ border: '0.5px solid #e0e3e8', borderRadius: 10, padding: 16, marginBottom: 10, background: '#fafbfc' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginBottom: 3 }}>
                    <span style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.4 }}>{paper.title}</span>
                    <PaperTag publicationDate={paper.publicationDate} />
                  </div>
                  <div style={{ color: '#9ca3af', fontSize: 12, marginBottom: 8 }}>
                    {[paper.authors, paper.year, paper.venue].filter(Boolean).join(' · ')}
                  </div>

                  <p style={{ color: '#6b7280', fontSize: 13, lineHeight: 1.6, marginBottom: 10 }}>
                    {paper.abstract}
                  </p>

                  {paper.keywords?.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                      {paper.keywords.map((kw, i) => {
                        const c = TAG_COLORS[i % TAG_COLORS.length];
                        return (
                          <span key={i} style={{ background: c.bg, color: c.color, padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 500 }}>
                            {kw}
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {/* Button row */}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    {hasArxiv && <LinkBtn href={arXivAbsUrl(paper.arxiv_id)} label="arXiv Abstract" />}

                    {/* Download (arXiv only) */}
                    {hasArxiv && (
                      <button
                        onClick={() => !dl && handleDownload(paper, idx)}
                        disabled={!!dl}
                        style={{
                          padding: '5px 10px',
                          background: (dl === 'done' || dl === 'exists') ? '#EAF3DE' : '#fff',
                          color: (dl === 'done' || dl === 'exists') ? '#3B6D11' : '#374151',
                          border: `0.5px solid ${(dl === 'done' || dl === 'exists') ? '#3B6D11' : '#d1d5db'}`,
                          borderRadius: 6, fontSize: 11, fontWeight: 600,
                          cursor: dl ? 'default' : 'pointer', whiteSpace: 'nowrap',
                        }}
                      >
                        {dl === 'downloading' && '⬇ Downloading…'}
                        {dl === 'done' && '✓ Downloaded'}
                        {dl === 'opened' && '✓ Opened'}
                        {dl === 'exists' && '✓ Already in library'}
                        {!dl && '⬇ Download'}
                      </button>
                    )}

                    {/* Summarize (opens panel) */}
                    {isFree && !saved && (
                      <button
                        onClick={() => handleOpenPanel(paper, idx)}
                        style={{
                          padding: '5px 10px', background: '#1B4F9C', color: '#fff',
                          border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 600,
                          cursor: 'pointer', whiteSpace: 'nowrap',
                        }}
                      >
                        ✦ Summarize
                      </button>
                    )}

                    {saved && (
                      <span style={{ padding: '5px 10px', background: '#EAF3DE', color: '#3B6D11', borderRadius: 6, fontSize: 11, fontWeight: 600 }}>
                        ✓ In Library
                      </span>
                    )}

                    <LinkBtn href={scholarUrl(paper.title)} label="Google Scholar" />
                    <LinkBtn href={semanticUrl(paper.title)} label="Semantic Scholar" />
                  </div>

                  {!isFree && (
                    <div style={{ marginTop: 8, fontSize: 11, color: '#9ca3af' }}>
                      No free full text available
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Summary panel */}
      <SummaryPanel
        isOpen={panelOpen}
        paper={panelPaper}
        status={panelStatus}
        summary={panelSummary}
        onClose={() => setPanelOpen(false)}
        onSave={handlePanelSave}
      />
    </>
  );
}
