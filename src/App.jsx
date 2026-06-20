import { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import PaperView from './components/PaperView';
import ChainView from './components/ChainView';
import AuthPage from './components/AuthPage';
import DevDashboard from './components/DevDashboard';
import LibraryOverview from './components/LibraryOverview';
import AddPaperModal from './components/AddPaperModal';
import PaperSearch from './components/PaperSearch';
import { useAuth } from './hooks/useAuth';
import { useLibrary } from './hooks/useLibrary';
import { useChains } from './hooks/useChains';
import { useSuggestions } from './hooks/useSuggestions';
import { useBackgroundEval } from './hooks/useBackgroundEval';

function LoadingScreen() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: '#f9fafb', gap: 14,
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: '50%',
        border: '3px solid #e0e3e8', borderTopColor: '#1B4F9C',
        animation: 'pd-spin 0.8s linear infinite',
      }} />
      <div style={{ fontSize: 13, color: '#6b7280' }}>Loading Paper Digester…</div>
      <style>{'@keyframes pd-spin { to { transform: rotate(360deg); } }'}</style>
    </div>
  );
}

export default function App() {
  // ── Auth gate ─────────────────────────────────────────────────────────────
  const { user, loading: authLoading, signOut } = useAuth();

  // ── Responsive ────────────────────────────────────────────────────────────
  const [isMobile, setIsMobile]       = useState(() => window.innerWidth < 768);
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 768);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // ── Library + chains (Supabase-backed) ──────────────────────────────────
  const {
    library,
    loading: libraryLoading,
    addPaper,
    updatePaper,
    seedDemoIfNeeded,
  } = useLibrary(user?.id);

  const {
    chains,
    loading: chainsLoading,
    saveChain,
    seedDemoChainIfNeeded,
  } = useChains(user?.id);

  // Seed demo data once per user, after the initial load resolves
  useEffect(() => {
    if (user && !libraryLoading) seedDemoIfNeeded();
  }, [user, libraryLoading, seedDemoIfNeeded]);

  useEffect(() => {
    if (user && !chainsLoading) seedDemoChainIfNeeded();
  }, [user, chainsLoading, seedDemoChainIfNeeded]);

  // ── Suggestions ───────────────────────────────────────────────────────────
  const {
    suggestions,
    loading: suggestionsLoading,
    signals,
    refresh: refreshSuggestions,
  } = useSuggestions(user?.id, library, chains);

  // ── Background eval ───────────────────────────────────────────────────────
  const { triggerBackgroundEval } = useBackgroundEval(user?.id);
  const [evalStatuses, setEvalStatuses] = useState({});

  function handleEvalComplete(paperId, overall, scores) {
    setEvalStatuses((prev) => ({ ...prev, [paperId]: { overall, scores, status: 'done' } }));
  }

  function handleChainEvalComplete(chainId, overall) {
    setEvalStatuses((prev) => ({ ...prev, [chainId]: { overall, status: 'done' } }));
  }

  // ── Navigation state ──────────────────────────────────────────────────────
  const [mainView,      setMainView]      = useState('overview');
  const [searchMode,    setSearchMode]    = useState(false);
  const [addPaperOpen,  setAddPaperOpen]  = useState(false);
  const [selectedPaper, setSelectedPaper] = useState(null);
  const [selectedChain, setSelectedChain] = useState(null);
  const [checkedPapers, setCheckedPapers] = useState([]);

  // ── Auth gate (after all hooks so hook order stays stable every render) ───
  if (authLoading) return <LoadingScreen />;
  if (!user) return <AuthPage />;

  const isAdmin = true;

  // ── Library handlers ──────────────────────────────────────────────────────
  const handlePaperSaved = async (paper) => {
    console.log('handlePaperSaved called:', paper?.title);
    const saved = await addPaper(paper);
    if (saved?.id) {
      setEvalStatuses((prev) => ({ ...prev, [saved.id]: { status: 'running' } }));
      triggerBackgroundEval(saved);
    }
  };

  const handleUpdatePaper = async (id, data) => {
    await updatePaper(id, data);
    if (selectedPaper?.id === id) setSelectedPaper((prev) => ({ ...prev, ...data }));
  };

  // ── Navigation handlers ───────────────────────────────────────────────────
  const handleGoToOverview = () => {
    setMainView('overview');
    setSearchMode(false);
    setSelectedPaper(null);
    setSelectedChain(null);
    if (isMobile) setSidebarOpen(false);
  };

  const handlePaperClick = (paper) => {
    setSelectedPaper(paper);
    setMainView('paper');
    setSearchMode(false);
    if (isMobile) setSidebarOpen(false);
  };

  const handleChainClick = (chain) => {
    setSelectedChain(chain);
    setMainView('chain');
    setSearchMode(false);
    if (isMobile) setSidebarOpen(false);
  };

  // ── Chain-building handlers ───────────────────────────────────────────────
  const handleCheckChange = (paper, checked) => {
    setCheckedPapers((prev) =>
      checked
        ? prev.some((p) => p.id === paper.id) ? prev : [...prev, paper]
        : prev.filter((p) => p.id !== paper.id)
    );
  };

  const handleAddToChain = (paper) => {
    handleCheckChange(paper, !checkedPapers.some((p) => p.id === paper.id));
  };

  const handleBuildChain = () => {
    if (checkedPapers.length < 2) return;
    const userChainCount = chains.filter((c) => !c.isDemo).length;
    const newChain = {
      id: Date.now().toString(),
      name: `Chain ${userChainCount + 1}`,
      paperIds: checkedPapers.map((p) => p.id),
      papers: checkedPapers,
      createdAt: new Date().toISOString(),
    };
    setSelectedChain(newChain);
    setMainView('chain');
    setSearchMode(false);
    setCheckedPapers([]);
    if (isMobile) setSidebarOpen(false);
  };

  const handleSaveChain = async (chain) => {
    const saved = await saveChain(chain);
    const resolvedChain = saved ?? chain;
    setSelectedChain(resolvedChain);
    if (resolvedChain.synthesis) {
      setEvalStatuses((prev) => ({ ...prev, [resolvedChain.id]: { status: 'running' } }));
    }
  };

  const handleSummarizeFromSuggestion = (paper) => {
    setSelectedPaper(paper);
    setMainView('paper');
    setSearchMode(false);
    if (isMobile) setSidebarOpen(false);
  };

  const handleSaveToLibrary = async (paper) => {
    await addPaper({
      title: paper.title,
      authors: (paper.authors || []).slice(0, 3).map((a) => a.name).join(', '),
      year: String(paper.year || ''),
      abstract: paper.abstract || '',
      keywords: [],
      source: 'search',
      summarized: false,
      citationCount: paper.citationCount || 0,
      arxiv_id: paper.externalIds?.ArXiv || paper.arxivId || null,
      publicationDate: paper.publicationDate || null,
    });
  };

  // ── Render ────────────────────────────────────────────────────────────────
  const buildBarVisible = checkedPapers.length > 0;
  const isOverviewActive = !searchMode && mainView === 'overview';

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#f9fafb' }}>

      {/* Mobile overlay behind sidebar */}
      {isMobile && sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.3)', zIndex: 199,
          }}
        />
      )}

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <Sidebar
        open={sidebarOpen}
        isMobile={isMobile}
        library={library}
        chains={chains}
        checkedPapers={checkedPapers}
        user={user}
        isAdmin={isAdmin}
        evalStatuses={evalStatuses}
        isOverviewActive={isOverviewActive}
        onSignOut={signOut}
        onToggle={() => setSidebarOpen((v) => !v)}
        onPaperClick={handlePaperClick}
        onChainClick={handleChainClick}
        onCheckChange={handleCheckChange}
        onBuildChain={handleBuildChain}
        onGoToOverview={handleGoToOverview}
        onViewChange={(view) => { setMainView(view); setSearchMode(false); if (isMobile) setSidebarOpen(false); }}
      />

      {/* ── Main panel ──────────────────────────────────────────────────── */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        background: '#fff',
        overflow: 'hidden',
      }}>
        {/* Search bar header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 16px',
          borderBottom: '0.5px solid #e0e3e8',
          flexShrink: 0,
          background: '#fff',
        }}>
          {/* Hamburger (mobile) */}
          {isMobile && !sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(true)}
              style={{
                background: '#fff', border: '0.5px solid #e0e3e8',
                borderRadius: 6, width: 36, height: 36, fontSize: 18,
                cursor: 'pointer', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              ≡
            </button>
          )}
          {/* Re-open button (desktop) */}
          {!isMobile && !sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(true)}
              title="Open sidebar"
              style={{
                background: '#fff', border: '0.5px solid #e0e3e8',
                borderRadius: 6, width: 32, height: 32, fontSize: 16,
                cursor: 'pointer', color: '#888', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
              }}
            >
              ≡
            </button>
          )}

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* Search icon button */}
          <button
            onClick={() => setSearchMode(true)}
            title="Search papers"
            aria-label="Search papers"
            style={{
              width: 34, height: 34, borderRadius: 8,
              border: '0.5px solid #d1d5db',
              background: 'transparent', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#6b7280', flexShrink: 0,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#f3f4f6'; e.currentTarget.style.color = '#111827'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#6b7280'; }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </button>

          {/* Add Paper button */}
          <button
            onClick={() => setAddPaperOpen(true)}
            style={{
              padding: '7px 14px', borderRadius: 8, border: 'none',
              background: '#1B4F9C', color: '#fff',
              fontSize: 13, fontWeight: 500, cursor: 'pointer',
              whiteSpace: 'nowrap', flexShrink: 0,
            }}
          >
            + Add Paper
          </button>
        </div>

        {/* Scrollable content */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          position: 'relative',
          paddingBottom: buildBarVisible ? 64 : 0,
        }}>
          {/* Search mode */}
          {searchMode && (
            <div style={{ padding: '16px 20px 0' }}>
              <button
                onClick={() => setSearchMode(false)}
                style={{
                  fontSize: 13, color: '#6b7280',
                  background: 'transparent', border: 'none',
                  cursor: 'pointer', marginBottom: 16, padding: 0,
                  display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                ← Back
              </button>
              <PaperSearch
                onPaperSaved={handlePaperSaved}
                library={library}
                initialOpen={true}
              />
            </div>
          )}

          {/* Paper detail view */}
          {!searchMode && mainView === 'paper' && selectedPaper && (
            <PaperView
              paper={selectedPaper}
              userId={user.id}
              onClose={handleGoToOverview}
              onAddToChain={() => handleAddToChain(selectedPaper)}
              isInChain={checkedPapers.some((p) => p.id === selectedPaper.id)}
            />
          )}

          {/* Developer dashboard */}
          {!searchMode && mainView === 'devDashboard' && (
            <DevDashboard library={library} chains={chains} userId={user.id} />
          )}

          {/* Chain synthesis view */}
          {!searchMode && mainView === 'chain' && (
            <ChainView
              chain={selectedChain}
              library={library}
              onSaveChain={handleSaveChain}
              onClose={handleGoToOverview}
            />
          )}

          {/* Default: Library overview */}
          {!searchMode && mainView === 'overview' && (
            <LibraryOverview
              library={library}
              chains={chains}
              onSearch={() => setSearchMode(true)}
              suggestions={suggestions}
              suggestionsLoading={suggestionsLoading}
              onSummarize={handleSummarizeFromSuggestion}
              onSaveToLibrary={handleSaveToLibrary}
              onRefresh={refreshSuggestions}
              signals={signals}
            />
          )}
        </div>
      </div>

      {/* ── Sticky build-chain bar ───────────────────────────────────────── */}
      {buildBarVisible && (
        <div style={{
          position: 'fixed', bottom: 0,
          left: !isMobile && sidebarOpen ? 260 : 0,
          right: 0, zIndex: 150,
          background: '#fff', borderTop: '0.5px solid #e0e3e8',
          padding: '10px 20px',
          display: 'flex', alignItems: 'center', gap: 10,
          boxShadow: '0 -2px 12px rgba(0,0,0,0.07)',
          transition: 'left 0.25s ease',
        }}>
          <span style={{ flex: 1, fontSize: 13, color: '#374151', fontWeight: 500 }}>
            {checkedPapers.length} paper{checkedPapers.length !== 1 ? 's' : ''} selected
          </span>
          <button
            onClick={() => setCheckedPapers([])}
            style={{
              padding: '6px 14px', borderRadius: 6,
              border: '0.5px solid #d1d5db',
              background: '#fff', color: '#6b7280',
              fontSize: 13, cursor: 'pointer',
            }}
          >
            Clear
          </button>
          <button
            onClick={handleBuildChain}
            disabled={checkedPapers.length < 2}
            style={{
              padding: '6px 16px', borderRadius: 6, border: 'none',
              background: checkedPapers.length < 2 ? '#9ca3af' : '#1B4F9C',
              color: '#fff', fontSize: 13, fontWeight: 600,
              cursor: checkedPapers.length < 2 ? 'not-allowed' : 'pointer',
            }}
          >
            🔗 Build Chain →
          </button>
        </div>
      )}

      {/* ── Add Paper modal ──────────────────────────────────────────────── */}
      <AddPaperModal
        open={addPaperOpen}
        onClose={() => setAddPaperOpen(false)}
        onPaperSaved={handlePaperSaved}
        library={library}
      />
    </div>
  );
}
