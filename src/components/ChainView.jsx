import { useState } from 'react';
import { useClaude } from '../hooks/useClaude';
import { chainPrompt } from '../prompts/chainPrompt';
import CitationChip from './CitationChip';

// Robustly extract JSON from Claude's response, handling common truncation patterns
function extractJSON(raw) {
  const start = raw.indexOf('{');
  if (start === -1) throw new Error('No JSON found in response');

  // Grab everything from first { to last }
  const end = raw.lastIndexOf('}');
  const candidate = end > start ? raw.slice(start, end + 1) : raw.slice(start);

  // Try the candidate as-is, then with progressively heavier closing suffixes
  const suffixes = ['', '}', ']}', '"]}', '"}]}'];
  for (const suffix of suffixes) {
    try { return JSON.parse(candidate + suffix); } catch {}
  }

  // Last resort: drop the gaps array entirely so the rest of the synthesis still shows
  const noGaps = candidate.replace(/"gaps"\s*:\s*\[[\s\S]*$/, '"gaps": []}');
  try { return JSON.parse(noGaps); } catch {}

  throw new Error('Could not parse synthesis response');
}

const TAG_COLORS = [
  { bg: '#EAF3DE', color: '#3B6D11' },
  { bg: '#EEEDFE', color: '#3C3489' },
  { bg: '#FAEEDA', color: '#854F0B' },
];

function renderWithCitations(text) {
  if (!text) return null;
  const parts = text.split(/(\[P\d+(?::\s*\d{4})?\])/g);
  return (
    <span>
      {parts.map((part, i) => {
        const m = part.match(/\[P(\d+)(?::\s*(\d{4}))?\]/);
        if (m) return <CitationChip key={i} paperId={`P${m[1]}`} year={m[2] || ''} />;
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}

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
      borderRadius: 10, padding: 20, marginBottom: 14, ...style,
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

function generateChainName(papers) {
  if (!papers || papers.length === 0)
    return 'Untitled Chain'

  const years = papers
    .map(p => parseInt(p.year))
    .filter(y => !isNaN(y))
    .sort((a, b) => a - b)

  const yearRange = years.length > 1
    ? `${years[0]}–${years[years.length - 1]}`
    : years.length === 1
      ? String(years[0])
      : ''

  const skipWords = ['a','an','the','of','in',
    'on','for','to','and','with','using','via',
    'is','are','towards','learning','deep','neural']

  const keywords = papers
    .slice(0, 3)
    .map(p => {
      const words = (p.title || '')
        .split(' ')
        .map(w => w.replace(/[^a-zA-Z0-9]/g, ''))
        .filter(w =>
          w.length > 3 &&
          !skipWords.includes(w.toLowerCase())
        )
      return words[0] || p.title?.split(' ')[0] || ''
    })
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 2)

  const keywordStr = keywords.join(' · ')

  if (keywordStr && yearRange) return `${keywordStr} (${yearRange})`
  if (keywordStr) return keywordStr
  if (yearRange) return `Chain ${yearRange}`
  return 'Untitled Chain'
}

export default function ChainView({ chain, library, onSaveChain, onClose }) {
  // New chains carry .papers directly; saved chains only have paperIds
  const resolvedPapers = chain?.papers
    ?? library.filter((p) => chain?.paperIds?.includes(p.id));

  const papers = resolvedPapers.length >= 2 ? resolvedPapers : [];

  const [chainName, setChainName] = useState(
    chain?.name && chain.name !== 'Untitled Chain'
      ? chain.name
      : generateChainName(papers)
  );
  const [synthesis, setSynthesis] = useState(chain?.synthesis ?? null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  const [copied,    setCopied]    = useState(false);
  const [saved,     setSaved]     = useState(false);
  const { callClaude } = useClaude();

  const sortedPapers = [...papers].sort(
    (a, b) => (parseInt(a.year, 10) || 0) - (parseInt(b.year, 10) || 0)
  );

  // Persist name change without re-synthesizing (on blur / Enter)
  const persistName = (name) => {
    if (name !== chain?.name) {
      onSaveChain({
        ...chain,
        name,
        paperIds: papers.map((p) => p.id),
        synthesis,
      });
    }
  };

  const handleSynthesize = async () => {
    setLoading(true);
    setError(null);
    setSynthesis(null);

    console.log('ChainView papers:', papers.map((p) => ({
      title: p.title, year: p.year,
      tldr: p.tldr?.slice(0, 50),
      concept: p.concept?.slice(0, 50),
    })));

    try {
      const raw = await callClaude(chainPrompt(papers), 2000);
      const data = extractJSON(raw);
      setSynthesis(data);

      // Auto-save chain with synthesis result
      onSaveChain({
        ...chain,
        name: chainName,
        paperIds: papers.map((p) => p.id),
        synthesis: data,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      console.error('Synthesis parse error:', e.message);
      setError('Could not parse synthesis — ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const shareText = () => [
    '📚 Research Chain Synthesis',
    chainName,
    '',
    synthesis?.keyInsight ? `💡 Key Insight:\n${synthesis.keyInsight}` : '',
    '',
    `📈 Papers (${papers.length}):`,
    ...papers.map((p, i) => `${i + 1}. ${p.year || 'n.d.'} — ${p.title}`),
    ...(synthesis?.gaps?.length
      ? ['', '🔍 Research Gaps:', ...synthesis.gaps.map((g, i) => `${i + 1}. ${g.gap}`)]
      : []),
    '',
    'Built with Paper Digester',
  ].join('\n').trim();

  const handleCopy = async () => {
    await navigator.clipboard.writeText(shareText());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!chain) return null;

  // ── Empty state ─────────────────────────────────────────────────────────
  if (papers.length < 2) {
    return (
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '20px 24px 48px' }}>
        <button
          onClick={onClose}
          style={{ background: 'transparent', border: 'none', color: '#6b7280', fontSize: 13, cursor: 'pointer', marginBottom: 24 }}
        >
          ← Back
        </button>
        <div style={{ textAlign: 'center', padding: '64px 0', color: '#9ca3af' }}>
          <div style={{ fontSize: 44, marginBottom: 14 }}>🔗</div>
          <div style={{ fontWeight: 600, fontSize: 17, color: '#6b7280' }}>Not enough papers</div>
          <div style={{ fontSize: 14, marginTop: 6 }}>
            This chain needs at least 2 papers. Check papers in the sidebar to build one.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '20px 24px 56px' }}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button
          onClick={onClose}
          style={{
            background: 'transparent', border: 'none',
            color: '#6b7280', fontSize: 13, cursor: 'pointer',
            flexShrink: 0, padding: '4px 8px 4px 0',
          }}
        >
          ← Back
        </button>

        {/* Editable chain name */}
        <input
          value={chainName}
          onChange={(e) => setChainName(e.target.value)}
          onFocus={(e) => { e.target.style.borderBottomColor = '#1B4F9C'; }}
          onBlur={(e) => {
            e.target.style.borderBottomColor = 'transparent';
            persistName(chainName);
          }}
          onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
          placeholder="Name this chain..."
          style={{
            flex: 1, fontSize: 16, fontWeight: 600, color: '#111827',
            border: 'none', borderBottom: '1.5px solid transparent',
            background: 'transparent', outline: 'none', padding: '2px 0',
            cursor: 'text', transition: 'border-bottom-color 0.15s',
          }}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {chain.isDemo && (
            <span style={{
              fontSize: 11, padding: '2px 8px',
              background: '#EEEDFE', color: '#3C3489',
              borderRadius: 10, fontWeight: 700,
              border: '0.5px solid #C5C2F8',
            }}>
              ✦ Demo
            </span>
          )}
          {saved && (
            <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 500 }}>✓ Saved</span>
          )}
          <span style={{ fontSize: 12, color: '#9ca3af' }}>{papers.length} papers</span>
        </div>
      </div>

      {/* ── Paper timeline ───────────────────────────────────────────────── */}
      <div style={{ position: 'relative', paddingLeft: 32, marginBottom: 24 }}>
        {/* Vertical connector line */}
        <div style={{
          position: 'absolute', left: 15, top: 14, bottom: 14,
          width: 2, background: '#e0e3e8',
        }} />

        {sortedPapers.map((paper) => {
          const origIndex = papers.findIndex((p) => p.id === paper.id);
          return (
            <div key={paper.id} style={{ position: 'relative', marginBottom: 16 }}>
              {/* Timeline dot */}
              <div style={{
                position: 'absolute', left: -32 + 15 - 6, top: 16,
                width: 14, height: 14, borderRadius: '50%',
                background: '#1B4F9C', border: '2.5px solid #f9fafb',
                boxShadow: '0 0 0 2px #1B4F9C', zIndex: 1,
              }} />

              {/* Card — id is the CitationChip scroll target */}
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
                  <span style={{ fontWeight: 600, fontSize: 14, color: '#111827' }}>{paper.title}</span>
                </div>

                {paper.tldr && (
                  <p style={{ color: '#6b7280', fontSize: 13, lineHeight: 1.55, marginBottom: 8 }}>
                    {paper.tldr}
                  </p>
                )}

                {paper.keywords?.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {paper.keywords.slice(0, 5).map((kw, j) => {
                      const c = TAG_COLORS[j % TAG_COLORS.length];
                      return (
                        <span key={j} style={{
                          background: c.bg, color: c.color,
                          padding: '2px 8px', borderRadius: 20,
                          fontSize: 11, fontWeight: 500,
                        }}>
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

      {/* ── Synthesize button ────────────────────────────────────────────── */}
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
        {loading
          ? 'Synthesizing…'
          : synthesis
            ? `↺ Re-synthesize ${papers.length} Papers`
            : `✦ Synthesize ${papers.length} Papers`}
      </button>

      {error && (
        <div style={{
          background: '#fef2f2', border: '0.5px solid #fca5a5',
          borderRadius: 8, padding: '12px 16px',
          color: '#dc2626', fontSize: 14, marginBottom: 16,
        }}>
          {error}
        </div>
      )}

      {/* ── Synthesis output ─────────────────────────────────────────────── */}
      {synthesis && (
        <div className="fade-in">

          {synthesis.keyInsight && (
            <div style={{
              background: '#EEEDFE', borderLeft: '3px solid #534AB7',
              borderRadius: 10, padding: '16px 20px', marginBottom: 20,
            }}>
              <div style={{
                fontSize: 11, fontWeight: 700, color: '#534AB7',
                marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px',
              }}>
                💡 Key Insight
              </div>
              <div style={{ fontSize: 15, color: '#1e1b4b', lineHeight: 1.75 }}>
                {renderWithCitations(synthesis.keyInsight)}
              </div>
            </div>
          )}

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

          {/* Share row */}
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
