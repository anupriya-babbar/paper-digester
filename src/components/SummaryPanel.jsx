import { useState } from 'react';

const PANEL_STYLE = `
@keyframes pd-shimmer {
  0%   { background-position: 200% 0 }
  100% { background-position: -200% 0 }
}
.pd-skeleton {
  background: linear-gradient(90deg, #f4f6f9 25%, #e8eaee 50%, #f4f6f9 75%);
  background-size: 200% 100%;
  animation: pd-shimmer 1.5s infinite;
  border-radius: 4px;
}
`;

const TAG_COLORS = [
  { bg: '#EAF3DE', color: '#3B6D11' },
  { bg: '#EEEDFE', color: '#3C3489' },
  { bg: '#FAEEDA', color: '#854F0B' },
];

function Skel({ w = '100%', h = 14, mb = 10 }) {
  return <div className="pd-skeleton" style={{ width: w, height: h, marginBottom: mb }} />;
}

function SkeletonBody() {
  return (
    <div style={{ padding: '16px 20px' }}>
      <Skel w="65%" h={20} mb={8} />
      <Skel w="40%" h={13} mb={22} />
      <Skel h={13} mb={7} />
      <Skel h={13} mb={7} />
      <Skel w="80%" h={13} mb={22} />
      <Skel w="30%" h={11} mb={8} />
      <Skel h={13} mb={7} />
      <Skel h={13} mb={7} />
      <Skel w="70%" h={13} mb={22} />
      <Skel h={72} mb={12} />
      <Skel h={72} mb={12} />
      <Skel h={52} mb={0} />
    </div>
  );
}

function StatusBar({ status }) {
  const steps = [
    { key: 'fetching',  label: 'Fetching full text…' },
    { key: 'analyzing', label: 'Analyzing with AI…' },
    { key: 'done',      label: 'Done ✓' },
  ];
  const activeIdx = status === 'fetching' ? 0 : status === 'analyzing' ? 1 : 2;

  return (
    <div style={{ display: 'flex', background: '#f8f9fb', borderBottom: '0.5px solid #e0e3e8' }}>
      {steps.map((s, i) => (
        <div
          key={s.key}
          style={{
            flex: 1, textAlign: 'center', padding: '7px 4px',
            fontSize: 11, fontWeight: i === activeIdx ? 700 : 400,
            color: i < activeIdx ? '#3B6D11' : i === activeIdx ? '#1B4F9C' : '#9ca3af',
            borderBottom: i === activeIdx ? '2px solid #1B4F9C' : '2px solid transparent',
          }}
        >
          {i < activeIdx ? '✓ ' : ''}{s.label}
        </div>
      ))}
    </div>
  );
}

function SummaryBody({ summary }) {
  return (
    <div style={{ padding: '16px 20px' }}>
      {/* Title + meta */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 16, lineHeight: 1.4, color: '#111827', marginBottom: 4 }}>
          {summary.title}
        </div>
        <div style={{ fontSize: 12, color: '#9ca3af' }}>
          {[summary.authors, summary.year, summary.readTime ? `${summary.readTime} min read` : null, summary.complexity]
            .filter(Boolean).join(' · ')}
        </div>
      </div>

      {/* One-liner */}
      {summary.oneliner && (
        <p style={{ fontStyle: 'italic', color: '#6b7280', fontSize: 13, lineHeight: 1.6, marginBottom: 14 }}>
          {summary.oneliner}
        </p>
      )}

      {/* Keywords */}
      {summary.keywords?.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
          {summary.keywords.map((kw, i) => {
            const c = TAG_COLORS[i % TAG_COLORS.length];
            return (
              <span key={i} style={{ background: c.bg, color: c.color, padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 500 }}>
                {kw}
              </span>
            );
          })}
        </div>
      )}

      {/* Core Concept */}
      {summary.concept && (
        <Section label="Core Concept">
          <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.7, margin: 0 }}>{summary.concept}</p>
        </Section>
      )}

      {/* How It Works */}
      {summary.mechanics?.length > 0 && (
        <Section label="How It Works">
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {summary.mechanics.map((m, i) => (
              <li key={i} style={{ marginBottom: 8, fontSize: 13, color: '#374151', lineHeight: 1.65 }}>
                <span style={{ fontWeight: 600 }}>{m.name}:</span> {m.explanation}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Key Advantage */}
      {summary.key_advantage && (
        <div style={{ borderLeft: '3px solid #1B4F9C', paddingLeft: 12, marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#1B4F9C', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Key Advantage
          </div>
          <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.65, margin: 0 }}>{summary.key_advantage}</p>
        </div>
      )}

      {/* Results */}
      {summary.results && (
        <div style={{ background: '#EAF3DE', borderRadius: 8, padding: '10px 14px', marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#3B6D11', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Results</div>
          <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.65, margin: 0 }}>{summary.results}</p>
        </div>
      )}

      {/* Figures */}
      {summary.figures && (
        <div style={{ background: '#FAEEDA', borderRadius: 8, padding: '10px 14px', marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#854F0B', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Figures & Diagrams</div>
          <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.65, margin: 0 }}>{summary.figures}</p>
        </div>
      )}
    </div>
  );
}

function Section({ label, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {label}
      </div>
      {children}
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export default function SummaryPanel({ isOpen, paper, status, summary, onClose, onSave }) {
  const [toast, setToast] = useState(false);

  console.log('Panel state:', {
    status,
    hasSummary: !!summary,
    summaryKeys: summary ? Object.keys(summary) : null,
  });

  function handleSave() {
    if (summary) onSave(summary);
    setToast(true);
    setTimeout(() => {
      setToast(false);
      onClose();
    }, 2500);
  }

  return (
    <>
      <style>{PANEL_STYLE}</style>

      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.35)',
          zIndex: 1000,
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? 'auto' : 'none',
          transition: 'opacity 0.3s ease',
        }}
      />

      {/* Panel */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed', right: 0, top: 0, maxHeight: '90vh',
          width: 'min(420px, 100vw)',
          background: '#fff',
          boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
          zIndex: 1001,
          display: 'flex', flexDirection: 'column',
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.3s ease',
        }}
      >
        {/* Header */}
        <div style={{ padding: '16px 20px 12px', flexShrink: 0, borderBottom: '0.5px solid #e0e3e8' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#111827' }}>Paper Summary</div>
              {paper?.title && (
                <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 3, maxWidth: 340, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {paper.title.slice(0, 55)}{paper.title.length > 55 ? '…' : ''}
                </div>
              )}
            </div>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', fontSize: 22, color: '#9ca3af', cursor: 'pointer', lineHeight: 1, padding: '0 0 4px 12px', flexShrink: 0 }}
            >
              ×
            </button>
          </div>
        </div>

        {/* Status bar */}
        <div style={{ flexShrink: 0 }}>
          <StatusBar status={status || 'fetching'} />
        </div>

        {/* Body — scrollable */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {status !== 'done' ? <SkeletonBody /> : summary ? <SummaryBody summary={summary} /> : null}
        </div>

        {/* Footer */}
        <div style={{ position: 'sticky', bottom: 0, background: '#fff', padding: '16px', borderTop: '1px solid #e5e7eb', zIndex: 10 }}>
          <button
            onClick={handleSave}
            disabled={status !== 'done' || !summary}
            style={{
              width: '100%', padding: '11px', borderRadius: 8, border: 'none',
              background: status !== 'done' ? '#9ca3af' : '#1B4F9C',
              color: '#fff', fontWeight: 700, fontSize: 14,
              cursor: status !== 'done' ? 'not-allowed' : 'pointer',
              marginBottom: 8,
            }}
          >
            Close & Save to Library
          </button>
          <button
            onClick={onClose}
            style={{ width: '100%', padding: '6px', background: 'none', border: 'none', fontSize: 13, color: '#9ca3af', cursor: 'pointer', textDecoration: 'underline' }}
          >
            Close without saving
          </button>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
          background: '#1B6B3A', color: '#fff', padding: '11px 22px',
          borderRadius: 8, fontSize: 13, fontWeight: 600,
          zIndex: 1002, boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
          whiteSpace: 'nowrap',
        }}>
          ✓ Saved to Library
        </div>
      )}
    </>
  );
}
