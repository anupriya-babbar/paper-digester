import { useMemo } from 'react';

function StatCard({ label, value, icon }) {
  return (
    <div style={{
      flex: '1 1 120px', padding: '20px',
      boxShadow: 'var(--shadow)', borderRadius: 'var(--radius)',
      background: '#fff', minWidth: 0,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 8,
        background: 'var(--accent-tint)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 18, marginBottom: 12,
      }}>{icon}</div>
      <div style={{ fontSize: 30, fontWeight: 700, color: 'var(--accent)' }}>{value}</div>
      <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>{label}</div>
    </div>
  );
}

function YearBar({ year, count, max }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
      <div style={{ fontSize: 11, color: '#6b7280', width: 36, textAlign: 'right', flexShrink: 0 }}>
        {year}
      </div>
      <div style={{ flex: 1, height: 9, background: '#F1F5F9', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{
          width: `${pct}%`, height: '100%', background: 'var(--accent)',
          borderRadius: 6, transition: 'width 0.4s',
        }} />
      </div>
      <div style={{ fontSize: 11, color: '#6b7280', width: 16, flexShrink: 0 }}>{count}</div>
    </div>
  );
}

function TopicBar({ topic, count, max }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
      <div style={{
        fontSize: 11, color: '#374151', width: 120, flexShrink: 0,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {topic}
      </div>
      <div style={{ flex: 1, height: 9, background: '#F1F5F9', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{
          width: `${pct}%`, height: '100%', background: '#7C3AED',
          borderRadius: 6, transition: 'width 0.4s',
        }} />
      </div>
      <div style={{ fontSize: 11, color: '#6b7280', width: 16, flexShrink: 0 }}>{count}</div>
    </div>
  );
}

export default function LibraryOverview({
  library = [],
  chains = [],
  suggestions = [],
  suggestionsLoading = false,
  onSearch,
  onSummarize,
  onSaveToLibrary,
  onRefresh,
}) {
  const stats = useMemo(() => ({
    total: library.length,
    chains: chains.length,
    synthesized: chains.filter((c) => c.synthesis).length,
  }), [library, chains]);

  const yearData = useMemo(() => {
    const counts = {};
    library.forEach((p) => {
      const y = parseInt(p.year);
      if (y > 1990 && y <= new Date().getFullYear()) counts[y] = (counts[y] || 0) + 1;
    });
    const sorted = Object.entries(counts).sort(([a], [b]) => Number(a) - Number(b));
    const max = Math.max(...sorted.map(([, c]) => c), 1);
    return { sorted, max };
  }, [library]);

  const topicData = useMemo(() => {
    const counts = {};
    library.forEach((p) => {
      (p.keywords || []).forEach((kw) => {
        const k = kw.toLowerCase().trim();
        if (k.length > 2) counts[k] = (counts[k] || 0) + 1;
      });
    });
    const sorted = Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8);
    const max = Math.max(...sorted.map(([, c]) => c), 1);
    return { sorted, max };
  }, [library]);

  if (library.length === 0) {
    return (
      <div style={{ maxWidth: 560, margin: '80px auto', padding: '0 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📄</div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#111827', marginBottom: 8 }}>
          Your library is empty
        </h2>
        <p style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.7, marginBottom: 24 }}>
          Add your first paper to get started. Search arXiv, upload a PDF, or import from BibTeX.
        </p>
        <button
          onClick={onSearch}
          style={{
            padding: '10px 24px', borderRadius: 8, border: 'none',
            background: '#1B4F9C', color: '#fff', fontSize: 14,
            fontWeight: 600, cursor: 'pointer',
          }}
        >
          Search arXiv Papers
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 920, margin: '0 auto', padding: '28px 24px 60px' }}>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 32 }}>
        <StatCard label="Total papers" value={stats.total} icon="📄" />
        <StatCard label="Chains built" value={stats.chains} icon="🔗" />
        <StatCard label="Synthesized chains" value={stats.synthesized} icon="✨" />
      </div>

      {/* Suggested reads */}
      {(suggestionsLoading || suggestions.length > 0) && (
        <div style={{
          padding: '24px',
          boxShadow: 'var(--shadow)', borderRadius: 'var(--radius)', background: '#fff',
          marginBottom: 24,
        }}>
          <div style={{
            display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', marginBottom: 14,
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
              Suggested Reads
            </div>
            {onRefresh && (
              <button
                onClick={onRefresh}
                disabled={suggestionsLoading}
                style={{
                  background: 'transparent', border: 'none',
                  color: 'var(--accent)', fontSize: 12, fontWeight: 500,
                  cursor: suggestionsLoading ? 'default' : 'pointer',
                }}
              >
                {suggestionsLoading ? 'Refreshing…' : '↻ Refresh'}
              </button>
            )}
          </div>

          {suggestionsLoading && (
            <div style={{ fontSize: 13, color: 'var(--muted-light)', padding: '12px 0' }}>
              Finding papers tailored to your library…
            </div>
          )}

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: 12,
          }}>
            {suggestions.map((paper, i) => (
              <div
                key={i}
                style={{
                  border: 'none', background: '#FAFBFC',
                  borderRadius: 8, padding: '14px 16px',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)', lineHeight: 1.4, marginBottom: 4 }}>
                  {paper.title}
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted-light)', marginBottom: 8 }}>
                  {[
                    (paper.authors || []).slice(0, 2).map((a) => a.name || a).join(', '),
                    paper.year,
                  ].filter(Boolean).join(' · ')}
                </div>
                {paper.abstract && (
                  <p style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, marginBottom: 10 }}>
                    {paper.abstract.slice(0, 140)}…
                  </p>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => onSummarize?.(paper)}
                    style={{
                      padding: '6px 12px', fontSize: 12, fontWeight: 500,
                      background: 'var(--accent)', color: '#fff',
                      border: 'none', borderRadius: 6, cursor: 'pointer',
                    }}
                  >
                    ✦ Summarize
                  </button>
                  {onSaveToLibrary && (
                    <button
                      onClick={() => onSaveToLibrary(paper)}
                      style={{
                        padding: '6px 12px', fontSize: 12,
                        background: 'var(--accent-tint)', color: 'var(--accent)',
                        border: 'none', borderRadius: 6, cursor: 'pointer',
                      }}
                    >
                      + Save
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Charts row */}
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 28 }}>
        {yearData.sorted.length > 0 && (
          <div style={{
            flex: '1 1 220px', padding: '20px',
            boxShadow: 'var(--shadow)', borderRadius: 'var(--radius)', background: '#fff',
          }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 12 }}>
              Papers by Year
            </div>
            {yearData.sorted.map(([year, count]) => (
              <YearBar key={year} year={year} count={count} max={yearData.max} />
            ))}
          </div>
        )}

        {topicData.sorted.length > 0 && (
          <div style={{
            flex: '1 1 220px', padding: '20px',
            boxShadow: 'var(--shadow)', borderRadius: 'var(--radius)', background: '#fff',
          }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 12 }}>
              Top Topics
            </div>
            {topicData.sorted.map(([topic, count]) => (
              <TopicBar key={topic} topic={topic} count={count} max={topicData.max} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
