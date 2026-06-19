import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import FeedbackWidget from './FeedbackWidget';
import InlineFact from './InlineFact';

function SummaryContent({ paper, userId }) {
  const COLORS = [
    { bg: '#EAF3DE', color: '#3B6D11' },
    { bg: '#EEEDFE', color: '#3C3489' },
    { bg: '#FAEEDA', color: '#854F0B' },
    { bg: '#E6F1FB', color: '#0C447C' },
  ];

  return (
    <div>
      {paper.oneliner && (
        <p style={{
          fontSize: 15, fontStyle: 'italic',
          color: 'var(--color-text-secondary)',
          marginBottom: 20, lineHeight: 1.6,
        }}>
          {paper.oneliner}
        </p>
      )}

      {paper.concept && (
        <div style={{ marginBottom: 20 }}>
          <div style={{
            fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
            letterSpacing: '0.06em', color: 'var(--color-text-secondary)', marginBottom: 8,
          }}>
            Core Concept
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.8, color: 'var(--color-text-primary)' }}>
            {paper.concept}
          </div>
        </div>
      )}

      {paper.findings && (
        <div style={{ marginBottom: 20 }}>
          <div style={{
            fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
            letterSpacing: '0.06em', color: 'var(--color-text-secondary)', marginBottom: 8,
          }}>
            How It Works
          </div>
          <div style={{
            fontSize: 14, lineHeight: 1.8,
            color: 'var(--color-text-primary)', whiteSpace: 'pre-wrap',
          }}>
            {paper.findings}
          </div>
        </div>
      )}

      {(paper.key_advantage || paper.keyAdvantage) && (
        <div style={{ borderLeft: '3px solid #1B4F9C', paddingLeft: 14, marginBottom: 20 }}>
          <div style={{
            fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
            letterSpacing: '0.06em', color: '#1B4F9C', marginBottom: 6,
          }}>
            Key Advantage
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--color-text-primary)' }}>
            {paper.key_advantage || paper.keyAdvantage}
          </div>
        </div>
      )}

      {paper.results && (
        <div style={{ background: '#EAF3DE', borderRadius: 10, padding: '1rem 1.25rem', marginBottom: 20 }}>
          <div style={{
            fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
            letterSpacing: '0.06em', color: '#3B6D11', marginBottom: 6,
          }}>
            Results
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.7, color: '#27500A' }}>
            {paper.results}
          </div>
        </div>
      )}

      {paper.figures && (
        <div style={{ background: '#FAEEDA', borderRadius: 10, padding: '1rem 1.25rem', marginBottom: 20 }}>
          <div style={{
            fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
            letterSpacing: '0.06em', color: '#854F0B', marginBottom: 6,
          }}>
            Key Figures & Diagrams
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.7, color: '#633806' }}>
            {paper.figures}
          </div>
        </div>
      )}

      {paper.keywords?.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 20 }}>
          {paper.keywords.map((k, i) => {
            const c = COLORS[i % 4];
            return (
              <span key={k} style={{
                padding: '3px 10px', borderRadius: 12,
                fontSize: 12, fontWeight: 500,
                background: c.bg, color: c.color,
              }}>
                {k}
              </span>
            );
          })}
        </div>
      )}

      {userId && paper.id && (
        <FeedbackWidget paperId={paper.id} userId={userId} />
      )}

      {paper.abstract && paper.tldr && (
        <InlineFact
          summary={[paper.tldr, paper.concept, paper.findings].filter(Boolean).join(' ')}
          abstract={paper.abstract}
          autoRun={false}
        />
      )}

      <div style={{
        display: 'flex', gap: 8, flexWrap: 'wrap',
        marginTop: 20, paddingTop: 20,
        borderTop: '0.5px solid var(--color-border-tertiary)',
      }}>
        <button
          onClick={() => {
            const text = `${paper.title}\n\n${paper.tldr || paper.concept || ''}`;
            window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
          }}
          style={{
            padding: '7px 14px', borderRadius: 8,
            border: '0.5px solid #25D366', background: 'transparent',
            color: '#1a9e4c', fontSize: 13, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          WhatsApp
        </button>
        <button
          onClick={() => {
            const subject = encodeURIComponent(paper.title);
            const body = encodeURIComponent(`${paper.title}\n\n${paper.tldr || paper.concept || ''}`);
            window.open(`mailto:?subject=${subject}&body=${body}`);
          }}
          style={{
            padding: '7px 14px', borderRadius: 8,
            border: '0.5px solid #378ADD', background: 'transparent',
            color: '#185FA5', fontSize: 13, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          Email
        </button>
        <button
          onClick={() => navigator.clipboard.writeText(
            `${paper.title}\n\n${paper.tldr || paper.concept || ''}`
          )}
          style={{
            padding: '7px 14px', borderRadius: 8,
            border: '0.5px solid var(--color-border-secondary)',
            background: 'transparent', fontSize: 13, cursor: 'pointer',
            color: 'var(--color-text-primary)',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          Copy
        </button>
      </div>
    </div>
  );
}

export default function PaperView({ paper, onClose, userId, onAddToChain, isInChain }) {
  const [fetchedAbstract, setFetchedAbstract] = useState(null);
  const [fetchingAbstract, setFetchingAbstract] = useState(false);

  const arxivId = paper?.arxiv_id || paper?.arxivId;

  useEffect(() => {
    if (paper?.abstract && paper.abstract.length > 100) return;
    if (!arxivId) return;
    fetchAbstractFromArxiv();
  }, [arxivId]);

  async function fetchAbstractFromArxiv() {
    setFetchingAbstract(true);
    try {
      const res = await fetch(`https://export.arxiv.org/api/query?id_list=${arxivId}`);
      const xml = await res.text();
      const doc = new DOMParser().parseFromString(xml, 'text/xml');
      const abstract = doc.querySelector('entry > summary')?.textContent?.trim();
      if (abstract && abstract.length > 100) {
        setFetchedAbstract(abstract);
        await supabase
          .from('papers')
          .update({ abstract })
          .eq('id', paper.id);
      }
    } catch (e) {
      console.warn('arXiv fetch failed:', e);
    } finally {
      setFetchingAbstract(false);
    }
  }

  const displayAbstract = paper?.abstract?.length > 100 ? paper.abstract : fetchedAbstract;

  if (!paper) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>

      {/* Header bar */}
      <div style={{
        display: 'flex', alignItems: 'center', padding: '12px 20px',
        borderBottom: '0.5px solid var(--color-border-tertiary)',
        background: 'var(--color-background-primary)',
        gap: 12, flexShrink: 0,
      }}>
        <button
          onClick={onClose}
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            fontSize: 13, color: 'var(--color-text-secondary)',
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '4px 8px', borderRadius: 6,
          }}
        >
          ← Back
        </button>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 15, fontWeight: 600,
            color: 'var(--color-text-primary)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {paper.title}
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
            {[paper.authors, paper.year].filter(Boolean).join(' · ')}
          </div>
        </div>

        {onAddToChain && (
          <button
            onClick={onAddToChain}
            style={{
              padding: '6px 14px', borderRadius: 6, flexShrink: 0,
              border: isInChain ? '0.5px solid #16a34a' : '0.5px solid #1B4F9C',
              background: isInChain ? '#f0fdf4' : 'transparent',
              color: isInChain ? '#16a34a' : '#1B4F9C',
              fontSize: 12, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            {isInChain ? '✓ In Chain' : '+ Add to Chain'}
          </button>
        )}
      </div>

      {/* Two-panel body */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* LEFT: Original paper */}
        <div style={{
          width: '50%', overflowY: 'auto',
          padding: '1.5rem 2rem',
          borderRight: '0.5px solid var(--color-border-tertiary)',
          background: 'var(--color-background-secondary)',
        }}>
          <div style={{
            fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.08em', color: 'var(--color-text-secondary)',
            marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6,
          }}>
            📄 Original Paper
          </div>

          {/* Metadata card */}
          <div style={{
            background: 'var(--color-background-primary)',
            border: '0.5px solid var(--color-border-tertiary)',
            borderRadius: 10, padding: '1rem 1.25rem', marginBottom: 16,
          }}>
            <div style={{
              fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)',
              lineHeight: 1.4, marginBottom: 8,
            }}>
              {paper.title}
            </div>
            {paper.authors && (
              <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
                {paper.authors}
              </div>
            )}
            <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--color-text-secondary)' }}>
              {paper.year && <span>{paper.year}</span>}
              {(paper.citation_count || paper.citationCount) > 0 && (
                <span>{(paper.citation_count || paper.citationCount).toLocaleString()} citations</span>
              )}
            </div>
          </div>

          {/* Abstract */}
          <div style={{
            fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
            letterSpacing: '0.06em', color: 'var(--color-text-secondary)', marginBottom: 8,
          }}>
            Abstract
          </div>
          {fetchingAbstract ? (
            <div style={{
              fontSize: 13, color: 'var(--color-text-secondary)', fontStyle: 'italic',
              padding: '1rem', background: 'var(--color-background-primary)',
              borderRadius: 10, border: '0.5px solid var(--color-border-tertiary)',
              marginBottom: 20,
            }}>
              Fetching abstract from arXiv...
            </div>
          ) : displayAbstract ? (
            <div style={{
              fontSize: 14, lineHeight: 1.8, color: 'var(--color-text-primary)',
              background: 'var(--color-background-primary)',
              border: '0.5px solid var(--color-border-tertiary)',
              borderRadius: 10, padding: '1rem 1.25rem',
              marginBottom: 20, whiteSpace: 'pre-wrap',
            }}>
              {displayAbstract.slice(0, 3000)}
            </div>
          ) : (
            <div style={{
              fontSize: 13, color: 'var(--color-text-secondary)', fontStyle: 'italic',
              padding: '1rem', background: 'var(--color-background-primary)',
              borderRadius: 10, border: '0.5px solid var(--color-border-tertiary)',
              marginBottom: 20,
            }}>
              Abstract not available.
              {arxivId && (
                <a
                  href={`https://arxiv.org/abs/${arxivId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: '#1B4F9C', marginLeft: 8 }}
                >
                  Read on arXiv ↗
                </a>
              )}
            </div>
          )}

          {/* Full text if available */}
          {paper.full_text && (
            <>
              <div style={{
                fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
                letterSpacing: '0.06em', color: 'var(--color-text-secondary)', marginBottom: 8,
              }}>
                Full Text (excerpt)
              </div>
              <div style={{
                fontSize: 13, lineHeight: 1.7, color: 'var(--color-text-secondary)',
                background: 'var(--color-background-primary)',
                border: '0.5px solid var(--color-border-tertiary)',
                borderRadius: 10, padding: '1rem 1.25rem',
                marginBottom: 20, maxHeight: 300, overflowY: 'auto',
              }}>
                {paper.full_text.slice(0, 2000)}…
              </div>
            </>
          )}

          {/* Links */}
          <div style={{
            fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
            letterSpacing: '0.06em', color: 'var(--color-text-secondary)', marginBottom: 10,
          }}>
            Read Full Paper
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {arxivId && (
              <a
                href={`https://arxiv.org/abs/${arxivId}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 12px', borderRadius: 8,
                  border: '0.5px solid #B3D4F5', background: '#E6F1FB',
                  color: '#1B4F9C', fontSize: 13, textDecoration: 'none', fontWeight: 500,
                }}
              >
                📄 Read on arXiv ↗
              </a>
            )}
            <a
              href={`https://www.semanticscholar.org/search?q=${encodeURIComponent(paper.title || '')}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 12px', borderRadius: 8,
                border: '0.5px solid var(--color-border-secondary)',
                background: 'var(--color-background-primary)',
                color: 'var(--color-text-primary)', fontSize: 13, textDecoration: 'none',
              }}
            >
              🔍 Semantic Scholar ↗
            </a>
            <a
              href={`https://scholar.google.com/scholar?q=${encodeURIComponent(paper.title || '')}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 12px', borderRadius: 8,
                border: '0.5px solid var(--color-border-secondary)',
                background: 'var(--color-background-primary)',
                color: 'var(--color-text-primary)', fontSize: 13, textDecoration: 'none',
              }}
            >
              🎓 Google Scholar ↗
            </a>
            {paper.doi && (
              <a
                href={`https://doi.org/${paper.doi}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 12px', borderRadius: 8,
                  border: '0.5px solid var(--color-border-secondary)',
                  background: 'var(--color-background-primary)',
                  color: 'var(--color-text-primary)', fontSize: 13, textDecoration: 'none',
                }}
              >
                🔗 DOI ↗
              </a>
            )}
          </div>
        </div>

        {/* RIGHT: AI Summary */}
        <div style={{
          width: '50%', overflowY: 'auto',
          padding: '1.5rem 2rem',
          background: 'var(--color-background-primary)',
        }}>
          <div style={{
            fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.08em', color: 'var(--color-text-secondary)',
            marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6,
          }}>
            ✦ AI Summary
          </div>

          <SummaryContent paper={paper} userId={userId} />
        </div>

      </div>
    </div>
  );
}
