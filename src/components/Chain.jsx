import { useState } from 'react';
import { useClaude } from '../hooks/useClaude';
import { chainPrompt } from '../prompts/chainPrompt';
import CitationChip from './CitationChip';

const TAG_COLORS = [
  { bg: '#EAF3DE', color: '#3B6D11' },
  { bg: '#EEEDFE', color: '#3C3489' },
  { bg: '#FAEEDA', color: '#854F0B' },
];

// Renders inline [P1: 2021] or [P1] tags as CitationChip components
function renderWithCitations(text) {
  if (!text) return null;
  const parts = text.split(/(\[P\d+(?::\s*\d{4})?\])/g);
  return (
    <span>
      {parts.map((part, i) => {
        const m = part.match(/\[P(\d+)(?::\s*(\d{4}))?\]/);
        if (m) {
          return <CitationChip key={i} paperId={`P${m[1]}`} year={m[2] || ''} />;
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}

// Renders a citations array like ["P1: 2012", "P2: 2014"] as chips
function CitationPills({ citations }) {
  if (!citations?.length) return null;
  return (
    <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
      {citations.map((cite, i) => {
        const m = String(cite).match(/P(\d+)(?::\s*(\d+))?/);
        if (!m) return null;
        return <CitationChip key={i} paperId={`P${m[1]}`} year={m[2] || ''} />;
      })}
    </span>
  );
}

function SectionCard({ children, style }) {
  return (
    <div style={{
      background: '#fff', border: '0.5px solid #e0e3e8',
      borderRadius: 10, padding: 20, marginBottom: 14,
      ...style,
    }}>
      {children}
    </div>
  );
}

function SectionLabel({ color = '#1B4F9C', children }) {
  return (
    <div style={{ fontWeight: 600, color, marginBottom: 14, fontSize: 14 }}>
      {children}
    </div>
  );
}

export default function Chain({ initialPapers }) {
  const [synthesis, setSynthesis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const { callClaude } = useClaude();

  const papers = initialPapers?.length >= 2 ? initialPapers : [];
  const sortedPapers = [...papers].sort((a, b) => {
    const ya = parseInt(a.year, 10) || 0;
    const yb = parseInt(b.year, 10) || 0;
    return ya - yb;
  });

  const handleSynthesize = async () => {
    setLoading(true);
    setError(null);
    setSynthesis(null);

    console.log('Papers being sent to chain:', papers.map((p) => ({
      title: p.title,
      year: p.year,
      tldr: p.tldr?.slice(0, 50),
      findings: p.findings?.slice(0, 50),
      concept: p.concept?.slice(0, 50),
      oneliner: p.oneliner?.slice(0, 50),
      key_advantage: p.key_advantage?.slice(0, 50),
    })));

    try {
      const raw = await callClaude(chainPrompt(papers), 1500);
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');
      if (start === -1 || end === -1) {
        console.error('No JSON found in response:', raw);
        throw new Error('No JSON in response');
      }
      const data = JSON.parse(raw.slice(start, end + 1));
      setSynthesis(data);
    } catch (e) {
      console.error('Parse error:', e.message);
      console.error('Raw response was:', e._raw);
      setError('Could not parse synthesis — ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const shareText = () => {
    if (!synthesis) return '';
    const lines = [
      '📚 Research Chain Synthesis',
      '',
      '💡 Key Insight:',
      synthesis.keyInsight || '',
      '',
      `📈 Evolution (${papers.length} papers):`,
      ...papers.map((p, i) => `${i + 1}. ${p.year || 'n.d.'} — ${p.title}`),
    ];
    if (synthesis.gaps?.length) {
      lines.push('', '🔍 Research Gaps:');
      synthesis.gaps.forEach((g, i) => lines.push(`${i + 1}. ${g.gap}`));
    }
    lines.push('', 'Built with Paper Digester');
    return lines.join('\n');
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(shareText());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (papers.length < 2) {
    return (
      <div style={{ textAlign: 'center', padding: '64px 0', color: '#9ca3af' }}>
        <div style={{ fontSize: 44, marginBottom: 14 }}>🔗</div>
        <div style={{ fontWeight: 600, fontSize: 17, color: '#6b7280' }}>
          No papers selected for chain
        </div>
        <div style={{ fontSize: 14, marginTop: 6 }}>
          Go to <strong>Library</strong>, check 2 or more papers, then click "🔗 Build Chain →"
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* ── Chain header ───────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>
          {papers.length} papers in chain
        </span>
        {papers.some((p) => p.isDemo) && (
          <span style={{
            fontSize: 11, padding: '2px 8px',
            background: '#EEEDFE', color: '#3C3489',
            borderRadius: 10, fontWeight: 600,
          }}>
            ✦ Demo chain
          </span>
        )}
      </div>

      {/* ── Paper timeline ─────────────────────────────────────────────── */}
      <div style={{ position: 'relative', paddingLeft: 32, marginBottom: 24 }}>
        <div style={{
          position: 'absolute', left: 15, top: 14, bottom: 14,
          width: 2, background: '#e0e3e8',
        }} />

        {sortedPapers.map((paper) => {
          const origIndex = papers.findIndex((p) => p.id === paper.id);
          return (
            <div key={paper.id} style={{ position: 'relative', marginBottom: 16 }}>
              <div style={{
                position: 'absolute', left: -32 + 15 - 6, top: 16,
                width: 14, height: 14, borderRadius: '50%',
                background: '#1B4F9C', border: '2.5px solid #f4f6f9',
                boxShadow: '0 0 0 2px #1B4F9C', zIndex: 1,
              }} />
              <div
                id={`paper-card-${origIndex + 1}`}
                style={{
                  background: '#fff', border: '0.5px solid #e0e3e8',
                  borderRadius: 10, padding: 16,
                  transition: 'border-color 0.15s, box-shadow 0.15s',
                }}
              >
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                  <span style={{
                    fontWeight: 700, color: '#1B4F9C', fontSize: 12,
                    background: '#EAF3DE', padding: '1px 7px', borderRadius: 10,
                  }}>
                    P{origIndex + 1}
                  </span>
                  {paper.year && <span style={{ color: '#9ca3af', fontSize: 13 }}>{paper.year}</span>}
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{paper.title}</span>
                </div>
                <p style={{ color: '#6b7280', fontSize: 13, lineHeight: 1.55, marginBottom: 8 }}>
                  {paper.tldr}
                </p>
                {paper.keywords?.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {paper.keywords.slice(0, 5).map((kw, j) => {
                      const c = TAG_COLORS[j % TAG_COLORS.length];
                      return (
                        <span key={j} style={{ background: c.bg, color: c.color, padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 500 }}>
                          {kw}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Synthesize button ──────────────────────────────────────────── */}
      <button
        onClick={handleSynthesize}
        disabled={loading}
        style={{
          width: '100%', padding: '13px',
          background: loading ? '#9ca3af' : '#1B4F9C',
          color: '#fff', border: 'none', borderRadius: 8,
          fontWeight: 600, fontSize: 15,
          cursor: loading ? 'not-allowed' : 'pointer',
          marginBottom: 16,
        }}
      >
        {loading ? 'Synthesizing…' : `✦ Synthesize ${papers.length} Papers`}
      </button>

      {error && (
        <div className="fade-in" style={{
          background: '#fef2f2', border: '0.5px solid #fca5a5',
          borderRadius: 8, padding: '12px 16px',
          color: '#dc2626', fontSize: 14, marginBottom: 16,
        }}>
          {error}
        </div>
      )}

      {/* ── Synthesis output ───────────────────────────────────────────── */}
      {synthesis && (
        <div className="fade-in">

          {/* Key Insight */}
          {synthesis.keyInsight && (
            <div style={{
              background: '#EEEDFE', borderLeft: '3px solid #534AB7',
              borderRadius: 10, padding: '16px 20px', marginBottom: 20,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#534AB7', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                💡 Key Insight
              </div>
              <div style={{ fontSize: 15, color: '#1e1b4b', lineHeight: 1.75 }}>
                {renderWithCitations(synthesis.keyInsight)}
              </div>
            </div>
          )}

          {/* Evolution */}
          {synthesis.evolution && (
            <SectionCard>
              <SectionLabel>📈 Research Evolution</SectionLabel>
              {synthesis.evolution.split(/\n\n+/).map((para, i) => (
                <p key={i} style={{ marginBottom: 12, lineHeight: 1.8, fontSize: 14, color: '#374151' }}>
                  {renderWithCitations(para)}
                </p>
              ))}
            </SectionCard>
          )}

          {/* Agreements & Contradictions */}
          {(synthesis.agreements || synthesis.contradictions) && (
            <SectionCard>
              <SectionLabel>🤝 Agreements & Contradictions</SectionLabel>

              {synthesis.agreements && (
                <div style={{ marginBottom: synthesis.contradictions ? 20 : 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#3B6D11', marginBottom: 10 }}>
                    ✅ What they agree on
                  </div>
                  {synthesis.agreements.split(/\n\n+/).map((para, i) => (
                    <p key={i} style={{ marginBottom: 10, lineHeight: 1.75, fontSize: 13, color: '#374151' }}>
                      {renderWithCitations(para)}
                    </p>
                  ))}
                </div>
              )}

              {synthesis.contradictions && (
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#854F0B', marginBottom: 10 }}>
                    ⚡ Where they contradict
                  </div>
                  {synthesis.contradictions.split(/\n\n+/).map((para, i) => (
                    <p key={i} style={{ marginBottom: 10, lineHeight: 1.75, fontSize: 13, color: '#374151' }}>
                      {renderWithCitations(para)}
                    </p>
                  ))}
                </div>
              )}
            </SectionCard>
          )}

          {/* Research Gaps */}
          {synthesis.gaps?.length > 0 && (
            <SectionCard>
              <SectionLabel>🔍 Research Gaps</SectionLabel>
              {synthesis.gaps.map((gap, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 18 }}>
                  <span style={{
                    background: '#FAEEDA', color: '#854F0B',
                    padding: '2px 8px', borderRadius: 12,
                    fontSize: 10, fontWeight: 700, flexShrink: 0,
                    height: 'fit-content', marginTop: 3, letterSpacing: '0.3px',
                  }}>
                    GAP {i + 1}
                  </span>
                  <div>
                    <div style={{ color: '#111827', fontSize: 14, lineHeight: 1.65, fontWeight: 500, marginBottom: 6 }}>
                      {renderWithCitations(gap.gap)}
                    </div>
                    {gap.suggestedApproach && (
                      <p style={{ color: '#1B4F9C', fontSize: 12, lineHeight: 1.6, margin: '0 0 6px' }}>
                        💡 {gap.suggestedApproach}
                      </p>
                    )}
                    {gap.citations?.length > 0 && (
                      <div style={{ marginTop: 6 }}>
                        <CitationPills citations={gap.citations} />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </SectionCard>
          )}

          {/* Share */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(shareText())}`, '_blank')}
              style={{
                flex: 1, padding: '9px', background: '#25D366',
                color: '#fff', border: 'none', borderRadius: 7,
                fontSize: 13, fontWeight: 500, cursor: 'pointer',
              }}
            >
              WhatsApp
            </button>
            <button
              onClick={() => window.open(`mailto:?subject=Research%20Synthesis&body=${encodeURIComponent(shareText())}`, '_blank')}
              style={{
                flex: 1, padding: '9px', background: '#fff',
                color: '#374151', border: '0.5px solid #d1d5db',
                borderRadius: 7, fontSize: 13, cursor: 'pointer',
              }}
            >
              Email
            </button>
            <button
              onClick={handleCopy}
              style={{
                flex: 1, padding: '9px', background: '#fff',
                color: '#374151', border: '0.5px solid #d1d5db',
                borderRadius: 7, fontSize: 13, cursor: 'pointer',
              }}
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
