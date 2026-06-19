import PaperTag from './PaperTag';

function timeAgo(ts) {
  if (!ts) return '';
  const hours = Math.round((Date.now() - new Date(ts)) / (1000 * 60 * 60));
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default function SuggestedReads({
  suggestions,
  loading,
  signals,
  lastGenerated,
  onSummarize,
  onSaveToLibrary,
  library,
  onRefresh,
}) {
  const isInLibrary = (paper) =>
    library.some((p) => p.title?.toLowerCase() === paper.title?.toLowerCase());

  return (
    <div style={{ padding: '1.5rem 2rem', maxWidth: 720, margin: '0 auto' }}>

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'flex-start',
        justifyContent: 'space-between', marginBottom: '1rem',
      }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
            ✨ Suggested for you
          </h2>
          {signals.keywords.length > 0 && (
            <p style={{ fontSize: 12, color: 'var(--muted)' }}>
              Based on: {signals.keywords.slice(0, 3).join(' · ')}
              {signals.gaps.length > 0 && ' · and gaps from your chains'}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          {lastGenerated && (
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>
              Updated {timeAgo(lastGenerated)}
            </span>
          )}
          <button
            onClick={onRefresh}
            disabled={loading}
            style={{
              fontSize: 12, padding: '4px 10px', borderRadius: 6,
              border: '0.5px solid var(--border)', background: 'transparent',
              cursor: loading ? 'not-allowed' : 'pointer', color: 'var(--muted)',
            }}
          >
            {loading ? 'Refreshing…' : '↺ Refresh'}
          </button>
        </div>
      </div>

      {/* Empty state */}
      {!loading && suggestions.length === 0 && (
        <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--muted)' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📚</div>
          <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 8, color: 'var(--muted)' }}>
            Add some papers to get recommendations
          </div>
          <div style={{ fontSize: 13 }}>
            Upload a PDF or search for papers to build your library — suggestions will appear here.
          </div>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: 12,
        }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} style={{
              background: 'var(--card)', border: '0.5px solid var(--border)',
              borderRadius: 12, padding: '1rem', height: 180, overflow: 'hidden',
            }}>
              {[80, 60, 100, 40].map((w, j) => (
                <div key={j} style={{
                  height: j === 0 ? 16 : 12,
                  width: w + '%',
                  borderRadius: 4,
                  marginBottom: 10,
                  background: 'linear-gradient(90deg, var(--bg) 25%, var(--border) 50%, var(--bg) 75%)',
                  backgroundSize: '200% 100%',
                  animation: 'shimmer 1.5s infinite',
                }} />
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Suggestion cards */}
      {!loading && suggestions.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: 12,
        }}>
          {suggestions.map((paper) => {
            const inLibrary = isInLibrary(paper);
            return (
              <div key={paper.paperId} style={{
                background: 'var(--card)', border: '0.5px solid var(--border)',
                borderRadius: 12, padding: '1rem',
                display: 'flex', flexDirection: 'column', gap: 8,
              }}>
                {/* NEW tag + title */}
                <div>
                  {paper.isNew && (
                    <div style={{ marginBottom: 6 }}>
                      <PaperTag publicationDate={paper.publicationDate} />
                    </div>
                  )}
                  <div style={{
                    fontSize: 13, fontWeight: 600, lineHeight: 1.4, color: 'var(--text)',
                    display: '-webkit-box', WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical', overflow: 'hidden',
                  }}>
                    {paper.title}
                  </div>
                </div>

                {/* Meta */}
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                  {(paper.authors || []).slice(0, 2).map((a) => a.name).join(', ')}
                  {(paper.authors || []).length > 2 ? ' et al.' : ''}
                  {paper.year ? ` · ${paper.year}` : ''}
                  {paper.citationCount > 0
                    ? ` · ${paper.citationCount.toLocaleString()} citations`
                    : ''}
                </div>

                {/* Reason chip */}
                <div style={{
                  fontSize: 11, padding: '3px 8px',
                  background: '#EEEDFE', color: '#3C3489',
                  borderRadius: 6, alignSelf: 'flex-start',
                }}>
                  Because: {paper.recommendReason?.slice(0, 40)}
                </div>

                {/* Abstract preview */}
                {paper.abstract && (
                  <div style={{
                    fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, flex: 1,
                    display: '-webkit-box', WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical', overflow: 'hidden',
                  }}>
                    {paper.abstract}
                  </div>
                )}

                {/* Actions */}
                <div style={{ display: 'flex', gap: 6, marginTop: 'auto', paddingTop: 4 }}>
                  {paper.externalIds?.ArXiv && (
                    <button
                      onClick={() => onSummarize(paper)}
                      style={{
                        flex: 1, padding: '6px 0', borderRadius: 6,
                        border: 'none', background: '#1B4F9C', color: '#fff',
                        fontSize: 12, fontWeight: 500, cursor: 'pointer',
                      }}
                    >
                      ✦ Summarize
                    </button>
                  )}
                  <button
                    onClick={() => onSaveToLibrary(paper)}
                    disabled={inLibrary}
                    style={{
                      padding: '6px 10px', borderRadius: 6,
                      border: '0.5px solid var(--border)',
                      background: inLibrary ? '#EAF3DE' : 'transparent',
                      color: inLibrary ? '#3B6D11' : 'var(--text)',
                      fontSize: 12,
                      cursor: inLibrary ? 'default' : 'pointer',
                    }}
                  >
                    {inLibrary ? '✓ Saved' : '+ Save'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Quick-start actions */}
      <div style={{
        marginTop: '2rem', paddingTop: '1.5rem',
        borderTop: '0.5px solid var(--border)',
        display: 'flex', gap: 10, flexWrap: 'wrap',
      }}>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 4, width: '100%' }}>
          Or get started with:
        </div>
        <button
          onClick={() => document.querySelector('[data-action="upload"]')?.click()}
          style={{
            padding: '8px 16px', borderRadius: 8,
            border: '0.5px solid var(--border)', background: 'transparent',
            fontSize: 13, cursor: 'pointer', color: 'var(--text)',
          }}
        >
          📄 Upload a PDF
        </button>
        <button
          onClick={() => document.querySelector('[data-action="search"]')?.click()}
          style={{
            padding: '8px 16px', borderRadius: 8,
            border: '0.5px solid var(--border)', background: 'transparent',
            fontSize: 13, cursor: 'pointer', color: 'var(--text)',
          }}
        >
          🔍 Search papers
        </button>
      </div>
    </div>
  );
}
