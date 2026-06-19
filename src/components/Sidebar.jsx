import { useState } from 'react';
import { getPaperEvalStatus } from '../utils/sessionEval';

// ─── Mode badge ───────────────────────────────────────────────────────────────

const MODE_STYLES = {
  full:   { bg: '#E6F1FB', color: '#0C447C', label: 'Full' },
  tldr:   { bg: '#EAF3DE', color: '#3B6D11', label: 'TL;DR' },
  eli5:   { bg: '#FAEEDA', color: '#854F0B', label: 'ELI5' },
  search: { bg: '#EEEDFE', color: '#3C3489', label: 'Search' },
  default:{ bg: '#F1EFE8', color: '#5F5E5A', label: 'Imported' },
};

function ModeBadge({ paper }) {
  const style =
    paper.mode && MODE_STYLES[paper.mode]
      ? MODE_STYLES[paper.mode]
      : paper.source === 'search'
        ? MODE_STYLES.search
        : MODE_STYLES.default;

  return (
    <span style={{
      fontSize: 9, padding: '1px 5px', borderRadius: 8,
      background: style.bg, color: style.color,
      fontWeight: 700, letterSpacing: '0.3px', flexShrink: 0,
    }}>
      {style.label}
    </span>
  );
}

// ─── Summarized card ──────────────────────────────────────────────────────────

function SummarizedCard({ paper, isChecked, onPaperClick, onCheckChange, evalStatuses }) {
  const [hovered, setHovered] = useState(false);
  const firstAuthor = paper.authors?.split(/,|;/)[0]?.trim() || '';

  const liveStatus = evalStatuses?.[paper.id];
  const sessionStatus = getPaperEvalStatus(paper.id);
  const evalScore = liveStatus?.status === 'done'
    ? liveStatus.overall
    : sessionStatus?.overall ?? null;
  const isEvaluating = liveStatus?.status === 'running';

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 8,
        padding: '5px 10px 5px 8px', margin: '1px 6px', borderRadius: 6,
        borderLeft: isChecked ? '3px solid #1B4F9C' : '3px solid transparent',
        background: isChecked ? '#f0f5ff' : hovered ? 'var(--bg)' : 'transparent',
        transition: 'background 0.1s', cursor: 'default',
      }}
    >
      <input
        type="checkbox"
        checked={isChecked}
        onChange={(e) => onCheckChange(paper, e.target.checked)}
        onClick={(e) => e.stopPropagation()}
        style={{
          accentColor: '#1B4F9C', cursor: 'pointer',
          marginTop: 3, flexShrink: 0, width: 13, height: 13,
        }}
      />
      <div
        onClick={() => onPaperClick(paper)}
        style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
      >
        <div style={{
          fontSize: 12, fontWeight: 500, color: '#1a1a1a', lineHeight: 1.4,
          overflow: 'hidden', textOverflow: 'ellipsis',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        }}>
          {paper.title}
        </div>
        <div style={{
          fontSize: 11, color: 'var(--muted)', marginTop: 2,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {[firstAuthor, paper.year].filter(Boolean).join(' · ')}
        </div>
        <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
          <ModeBadge paper={paper} />
          {isEvaluating && (
            <span style={{
              fontSize: 9, padding: '1px 5px', borderRadius: 8,
              background: '#E6F1FB', color: '#0C447C', fontWeight: 600,
            }}>
              Evaluating…
            </span>
          )}
          {!isEvaluating && evalScore != null && (
            <span style={{
              fontSize: 9, padding: '1px 5px', borderRadius: 8, fontWeight: 600,
              background: evalScore >= 70 ? '#EAF3DE' : evalScore >= 55 ? '#FAEEDA' : '#FCEBEB',
              color: evalScore >= 70 ? '#27500A' : evalScore >= 55 ? '#854F0B' : '#A32D2D',
            }}>
              {evalScore}%
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Download card ────────────────────────────────────────────────────────────

function DownloadCard({ paper, isChecked, onPaperClick, onCheckChange }) {
  const [hovered, setHovered] = useState(false);
  const firstAuthor = paper.authors?.split(/,|;/)[0]?.trim() || '';

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 8,
        padding: '5px 10px 5px 8px', margin: '1px 6px', borderRadius: 6,
        borderLeft: isChecked ? '3px solid #1B4F9C' : '3px solid transparent',
        background: isChecked ? '#f0f5ff' : hovered ? 'var(--bg)' : 'transparent',
        transition: 'background 0.1s', cursor: 'default',
      }}
    >
      <input
        type="checkbox"
        checked={isChecked}
        onChange={(e) => onCheckChange(paper, e.target.checked)}
        onClick={(e) => e.stopPropagation()}
        style={{
          accentColor: '#1B4F9C', cursor: 'pointer',
          marginTop: 3, flexShrink: 0, width: 13, height: 13,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          onClick={() => onPaperClick(paper)}
          style={{ cursor: 'pointer' }}
        >
          <div style={{
            fontSize: 12, fontWeight: 500, color: '#1a1a1a', lineHeight: 1.4,
            overflow: 'hidden', textOverflow: 'ellipsis',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          }}>
            {paper.title}
          </div>
          <div style={{
            fontSize: 11, color: 'var(--muted)', marginTop: 2,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {[firstAuthor, paper.year].filter(Boolean).join(' · ')}
          </div>
          <div style={{ marginTop: 4 }}>
            <span style={{
              fontSize: 9, padding: '1px 5px', borderRadius: 8,
              background: '#F1EFE8', color: '#5F5E5A',
              fontWeight: 700, letterSpacing: '0.3px',
            }}>
              PDF
            </span>
          </div>
        </div>

        {/* Summarize Now — only for unsummarized downloads */}
        {!paper.summarized && (
          <button
            onClick={(e) => { e.stopPropagation(); onPaperClick(paper); }}
            style={{
              marginTop: 5, padding: '3px 8px', fontSize: 10,
              background: '#1B4F9C', color: '#fff', border: 'none',
              borderRadius: 5, cursor: 'pointer', fontWeight: 600,
            }}
          >
            ✦ Summarize
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Accordion section ────────────────────────────────────────────────────────

function AccordionSection({ icon, label, count, defaultOpen, extra, children }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [hovered, setHovered] = useState(false);

  return (
    <div>
      <div
        onClick={() => setIsOpen((v) => !v)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 14px', margin: '0 6px', borderRadius: 6,
          cursor: 'pointer', userSelect: 'none',
          background: hovered ? 'var(--bg)' : 'transparent',
        }}
      >
        <span style={{
          fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
          letterSpacing: '0.06em', color: 'var(--muted)',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          {icon} {label} ({count})
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {extra}
          <span style={{
            fontSize: 10, color: 'var(--muted)',
            transition: 'transform 0.2s',
            transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
            display: 'inline-block',
          }}>
            ▼
          </span>
        </span>
      </div>
      <div style={{
        overflow: 'hidden',
        maxHeight: isOpen ? 2000 : 0,
        opacity: isOpen ? 1 : 0,
        transition: 'max-height 0.25s ease, opacity 0.2s ease',
      }}>
        {children}
      </div>
    </div>
  );
}

// ─── Chain row ────────────────────────────────────────────────────────────────

function ChainRow({ chain, onClick }) {
  const [hovered, setHovered] = useState(false);
  const count = chain.paperIds?.length ?? chain.papers?.length ?? 0;

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '6px 14px 6px 20px', margin: '1px 6px', borderRadius: 6,
        background: hovered ? '#EEEDFE' : 'transparent',
        cursor: 'pointer', transition: 'background 0.1s',
      }}
    >
      {chain.isDemo && (
        <span style={{
          fontSize: 9, padding: '1px 5px',
          background: '#EEEDFE', color: '#3C3489',
          borderRadius: 8, fontWeight: 700, flexShrink: 0,
          letterSpacing: '0.3px', border: '0.5px solid #C5C2F8',
        }}>
          DEMO
        </span>
      )}
      <span style={{
        flex: 1, fontSize: 12, color: '#333',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {chain.name}
      </span>
      <span style={{ fontSize: 10, color: 'var(--muted)', flexShrink: 0 }}>
        {count}p
      </span>
    </div>
  );
}

// ─── Dev nav item ─────────────────────────────────────────────────────────────

function DevNavItem({ label, onClick }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '7px 14px 7px 20px', cursor: 'pointer',
        fontSize: 13, color: 'var(--muted)',
        display: 'flex', alignItems: 'center', gap: 6,
        borderRadius: 6, margin: '1px 6px',
        background: hovered ? 'var(--bg)' : 'transparent',
      }}
    >
      {label}
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyNote({ children }) {
  return (
    <div style={{ padding: '6px 14px 10px 22px', fontSize: 11, color: 'var(--muted)', fontStyle: 'italic', lineHeight: 1.5 }}>
      {children}
    </div>
  );
}

// ─── Main Sidebar ─────────────────────────────────────────────────────────────

export default function Sidebar({
  open,
  isMobile,
  library,
  chains,
  checkedPapers,
  user,
  isAdmin,
  evalStatuses,
  isOverviewActive,
  onSignOut,
  onToggle,
  onPaperClick,
  onChainClick,
  onCheckChange,
  onBuildChain,
  onGoToOverview,
  onViewChange,
}) {
  const summarized = library.filter(
    (p) => p.source === 'upload' || p.source === 'search'
  );
  const downloads = library.filter((p) => p.source === 'download');

  const canBuildChain = checkedPapers.length >= 2;

  const asideStyle = isMobile
    ? {
        position: 'fixed', top: 0, left: 0,
        height: '100vh', width: 280, zIndex: 200,
        transform: open ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.25s ease',
      }
    : {
        position: 'relative', height: '100vh',
        width: open ? 260 : 0, minWidth: open ? 260 : 0,
        transition: 'width 0.25s ease, min-width 0.25s ease',
      };

  const innerWidth = isMobile ? 280 : 260;

  return (
    <aside style={{
      ...asideStyle,
      borderRight: '0.5px solid #e0e0e0',
      overflow: 'hidden', display: 'flex',
      flexDirection: 'column', background: '#FAFAFA', flexShrink: 0,
    }}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={{
        width: innerWidth, padding: '13px 14px 10px',
        borderBottom: '0.5px solid #e0e0e0', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#1B4F9C', whiteSpace: 'nowrap' }}>
            📄 Paper Digester
          </span>
          <button
            onClick={onToggle}
            title="Toggle sidebar"
            style={{
              background: 'transparent', border: 'none',
              cursor: 'pointer', fontSize: 18, color: '#888',
              padding: '2px 4px', lineHeight: 1, flexShrink: 0,
            }}
          >
            ≡
          </button>
        </div>
        {user && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
            <span style={{
              fontSize: 11, color: 'var(--muted)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              flex: 1, minWidth: 0,
            }}>
              {user.email}
            </span>
            <button
              onClick={onSignOut}
              style={{
                background: 'transparent', border: 'none',
                color: '#1B4F9C', fontSize: 11, fontWeight: 500,
                cursor: 'pointer', padding: '0 0 0 8px', flexShrink: 0,
              }}
            >
              Sign out
            </button>
          </div>
        )}
      </div>

      {/* ── Scrollable body ─────────────────────────────────────────────── */}
      <div style={{
        width: innerWidth, flex: 1,
        overflowY: 'auto', overflowX: 'hidden', paddingBottom: 4,
      }}>
        {/* Overview nav item */}
        <div
          onClick={onGoToOverview}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '7px 14px', margin: '6px 6px 2px', borderRadius: 6,
            cursor: 'pointer',
            background: isOverviewActive ? '#EEF3FB' : 'transparent',
            color: isOverviewActive ? '#1B4F9C' : '#374151',
            fontWeight: isOverviewActive ? 600 : 500,
            fontSize: 13,
            transition: 'background 0.1s',
          }}
          onMouseEnter={(e) => { if (!isOverviewActive) e.currentTarget.style.background = 'var(--bg)'; }}
          onMouseLeave={(e) => { if (!isOverviewActive) e.currentTarget.style.background = 'transparent'; }}
        >
          🏠 Overview
        </div>

        <div style={{
          fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
          letterSpacing: '0.06em', color: 'var(--muted)',
          padding: '8px 14px 6px 14px',
        }}>
          My Library
        </div>

        {/* ✦ Summarized — expanded by default */}
        <AccordionSection icon="✦" label="Summarized" count={summarized.length} defaultOpen={true}>
          {summarized.length === 0 ? (
            <EmptyNote>
              No summaries yet{'\n'}Upload a PDF or search to get started
            </EmptyNote>
          ) : (
            summarized.map((paper) => (
              <SummarizedCard
                key={paper.id}
                paper={paper}
                isChecked={checkedPapers.some((p) => p.id === paper.id)}
                onPaperClick={onPaperClick}
                onCheckChange={onCheckChange}
                evalStatuses={evalStatuses}
              />
            ))
          )}
        </AccordionSection>

        {/* ⬇ Downloads — collapsed by default */}
        <AccordionSection icon="⬇" label="Downloads" count={downloads.length} defaultOpen={false}>
          {downloads.length === 0 ? (
            <EmptyNote>
              No downloads yet{'\n'}Search for papers and click Download
            </EmptyNote>
          ) : (
            downloads.map((paper) => (
              <DownloadCard
                key={paper.id}
                paper={paper}
                isChecked={checkedPapers.some((p) => p.id === paper.id)}
                onPaperClick={onPaperClick}
                onCheckChange={onCheckChange}
              />
            ))
          )}
        </AccordionSection>

        {/* 🔗 Chains — collapsed by default */}
        <AccordionSection
          icon="🔗" label="Chains" count={chains.length} defaultOpen={false}
          extra={
            <button
              onClick={(e) => { e.stopPropagation(); onBuildChain(); }}
              disabled={!canBuildChain}
              title={canBuildChain ? 'Build chain from selected papers' : 'Check 2+ papers first'}
              style={{
                fontSize: 11, color: canBuildChain ? '#1B4F9C' : '#ccc',
                background: 'transparent', border: 'none',
                cursor: canBuildChain ? 'pointer' : 'not-allowed',
                fontWeight: 600, padding: 0,
              }}
            >
              + New
            </button>
          }
        >
          {chains.length === 0 ? (
            <EmptyNote>
              No chains yet{'\n'}Select papers above to build one
            </EmptyNote>
          ) : (
            chains.map((chain) => (
              <ChainRow key={chain.id} chain={chain} onClick={() => onChainClick(chain)} />
            ))
          )}
        </AccordionSection>
      </div>

      {/* ── Developer section ───────────────────────────────────────────── */}
      <div style={{ marginTop: 8, borderTop: '0.5px solid var(--border)', paddingTop: 8, width: innerWidth }}>
        <div style={{
          fontSize: 10, color: 'var(--muted)', padding: '4px 14px',
          textTransform: 'uppercase', letterSpacing: '0.06em',
        }}>
          Quality
        </div>
        <DevNavItem label="📊 Eval Report" onClick={() => onViewChange?.('devDashboard')} />
      </div>

    </aside>
  );
}
