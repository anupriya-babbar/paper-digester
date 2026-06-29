import { useState, useRef } from 'react';
import { usePDF } from '../hooks/usePDF';
import { useClaude } from '../hooks/useClaude';
import * as prompts from '../prompts/digestPrompts';
import PaperSearch from './PaperSearch';
import InlineFact from './InlineFact';

const MODES = [
  { key: 'tldr', label: 'TL;DR' },
  { key: 'full', label: 'Full Breakdown' },
  { key: 'eli5', label: 'ELI5' },
  { key: 'methodology', label: 'Methodology' },
];

const TAG_COLORS = [
  { bg: '#EAF3DE', color: '#3B6D11' },
  { bg: '#EEEDFE', color: '#3C3489' },
  { bg: '#FAEEDA', color: '#854F0B' },
];

export default function Digest({ onPaperSaved }) {
  const [file, setFile] = useState(null);
  const [mode, setMode] = useState('tldr');
  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('');
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [paperText, setPaperText] = useState('');
  const [qaInput, setQaInput] = useState('');
  const [qaList, setQaList] = useState([]);
  const [qaLoading, setQaLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [extractedPreview, setExtractedPreview] = useState(null);
  const fileInputRef = useRef(null);
  const { extractPDF } = usePDF();
  const { callClaude } = useClaude();

  const handleFile = (f) => {
    if (!f) return;
    if (f.type !== 'application/pdf') {
      setError('Please upload a PDF file.');
      return;
    }
    setFile(f);
    setResult(null);
    setError(null);
    setQaList([]);
    setPaperText('');
    setExtractedPreview(null);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const handleAnalyze = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    setQaList([]);
    try {
      setLoadingStatus('Extracting text from PDF…');
      const { text, pages } = await extractPDF(file);
      setPaperText(text);
      const preview = text.slice(0, 500);
      console.log('PDF extracted text (first 500 chars):\n', preview);
      setExtractedPreview(preview);
      setLoadingStatus(`Extracted ${pages} pages. Analyzing with AI…`);
      const prompt = prompts[mode](text);
      const tokenBudget = { tldr: 800, full: 4500, eli5: 1200, methodology: 3000 };
      const raw = await callClaude(prompt, tokenBudget[mode] || 1200);
      setLoadingStatus('Parsing response…');
      const cleaned = raw.trim().replace(/^```json\s*/,'').replace(/\s*```$/,'').trim();
      console.log('[Digest] cleaned JSON length:', cleaned.length, 'first char:', cleaned[0]);
      const parsed = JSON.parse(cleaned);
      // Normalize keywords — ensure flat string array, max 6 items
      if (parsed.keywords) {
        parsed.keywords = parsed.keywords
          .map(k => (typeof k === 'object' ? k.tag || k.name || JSON.stringify(k) : String(k)))
          .slice(0, 6);
      }
      try {
        setResult(parsed);
        const tldrText = mode === 'full' || mode === 'eli5' || mode === 'methodology'
          ? (parsed.oneliner || '')
          : (parsed.tldr || '');
        const conceptText = mode === 'eli5'
          ? (parsed.idea || '')
          : mode === 'methodology'
            ? (parsed.architecture || '')
            : (parsed.concept || '');
        const findingsText = mode === 'full' && Array.isArray(parsed.mechanics)
          ? parsed.mechanics.map((m) => `• ${m.name}: ${m.explanation}`).join('\n')
          : mode === 'eli5'
            ? [parsed.before, parsed.how, parsed.after].filter(Boolean).join('\n\n')
            : '';
        onPaperSaved({
          id: Date.now().toString(),
          title: parsed.title || file.name.replace('.pdf', ''),
          authors: parsed.authors || '',
          year: parsed.year || '',
          tldr: tldrText,
          oneliner: parsed.oneliner || '',
          concept: conceptText,
          findings: findingsText,
          key_advantage: parsed.keyAdvantage || parsed.key_advantage || '',
          keyAdvantage: parsed.keyAdvantage || '',
          results: parsed.results || '',
          figures: parsed.figures || '',
          mechanics: parsed.mechanics || [],
          keywords: parsed.keywords || [],
          // tldr mode
          keyNumber: parsed.keyNumber || '',
          // full mode
          problem: parsed.problem || '',
          keyNumbers: parsed.keyNumbers || [],
          limitations: parsed.limitations || '',
          // eli5 mode
          before: parsed.before || '',
          idea: parsed.idea || '',
          how: parsed.how || '',
          after: parsed.after || '',
          // methodology mode
          priorWork: parsed.priorWork || '',
          architecture: parsed.architecture || '',
          trainingDetails: parsed.trainingDetails || {},
          evaluation: parsed.evaluation || {},
          ablations: parsed.ablations || '',
          abstract: text ? text.slice(0, 3000) : '',
          mode,
          source: 'upload',
          summarized: true,
          addedAt: new Date().toISOString(),
        });
      } catch (err) {
        console.error('Digest save error:', err.message, err.stack);
        setLoadingStatus('Error: ' + err.message);
      }
    } catch (err) {
      if (err.message.includes('JSON')) {
        setError('Claude returned an unexpected format. Please try again.');
      } else {
        setError(err.message || 'Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
      setLoadingStatus('');
    }
  };

  const clearPreview = () => setExtractedPreview(null);

  const handleAsk = async () => {
    const q = qaInput.trim();
    if (!q || qaLoading) return;
    setQaLoading(true);
    setQaInput('');
    try {
      const prompt = `Based on the research paper below, answer this question concisely in 2-4 sentences.

Paper (excerpt):
${paperText.slice(0, 8000)}

Question: ${q}`;
      const answer = await callClaude(prompt, 400);
      setQaList((prev) => [...prev, { q, a: answer }]);
    } catch (err) {
      setQaList((prev) => [...prev, { q, a: `Error: ${err.message}` }]);
    } finally {
      setQaLoading(false);
    }
  };

  const shareText = () => {
    const kws = result?.keywords?.join(', ') || '';
    return `${result?.title || 'Research Paper'} (${result?.year || ''})\n\n${result?.tldr || ''}\n\nKeywords: ${kws}\n\nVia Paper Digester`;
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(shareText());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div>
      {/* Paper Search */}
      <PaperSearch onPaperSaved={onPaperSaved} />

      {/* Drop zone */}
      {!file && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: `2px dashed ${dragging ? '#1B4F9C' : '#c9d0da'}`,
            borderRadius: 12,
            padding: '44px 24px',
            textAlign: 'center',
            cursor: 'pointer',
            background: dragging ? '#f0f5ff' : '#fafbfc',
            transition: 'all 0.2s',
            marginBottom: 20,
          }}
        >
          <div style={{ fontSize: 36, marginBottom: 10 }}>📄</div>
          <div style={{ fontWeight: 600, color: '#1B4F9C', fontSize: 16 }}>
            Drop your research paper here
          </div>
          <div style={{ color: '#9ca3af', fontSize: 13, marginTop: 4 }}>
            or click to browse — PDF only
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            style={{ display: 'none' }}
            onChange={(e) => handleFile(e.target.files[0])}
          />
        </div>
      )}

      {/* File chip */}
      {file && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 14px',
            background: '#EAF3DE',
            borderRadius: 8,
            border: '0.5px solid #3B6D11',
            marginBottom: 16,
          }}
        >
          <span style={{ fontSize: 18 }}>📄</span>
          <span
            style={{
              flex: 1,
              fontSize: 13,
              color: '#3B6D11',
              fontWeight: 500,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {file.name}
          </span>
          <button
            onClick={() => {
              setFile(null);
              setResult(null);
              setError(null);
              setQaList([]);
              setPaperText('');
            }}
            style={{
              background: 'none',
              border: 'none',
              color: '#3B6D11',
              fontSize: 20,
              lineHeight: 1,
              cursor: 'pointer',
              padding: 0,
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Mode selector */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {MODES.map((m) => (
          <button
            key={m.key}
            onClick={() => setMode(m.key)}
            style={{
              padding: '6px 16px',
              borderRadius: 20,
              border: mode === m.key ? '1.5px solid #1B4F9C' : '1px solid #d1d5db',
              background: mode === m.key ? '#1B4F9C' : '#fff',
              color: mode === m.key ? '#fff' : '#374151',
              fontWeight: mode === m.key ? 600 : 400,
              fontSize: 13,
              transition: 'all 0.15s',
            }}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Analyze button */}
      <button
        onClick={handleAnalyze}
        disabled={!file || loading}
        style={{
          width: '100%',
          padding: '13px',
          background: !file || loading ? '#9ca3af' : '#1B4F9C',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          fontWeight: 600,
          fontSize: 15,
          cursor: !file || loading ? 'not-allowed' : 'pointer',
          marginBottom: 16,
          transition: 'background 0.2s',
        }}
      >
        {loading ? 'Analyzing…' : 'Analyze Paper'}
      </button>

      {/* Loading bar */}
      {loading && (
        <div style={{ marginBottom: 20 }}>
          <div
            style={{
              height: 4,
              background: '#e5e7eb',
              borderRadius: 2,
              overflow: 'hidden',
              marginBottom: 8,
              position: 'relative',
            }}
          >
            <div
              style={{
                position: 'absolute',
                height: '100%',
                width: '40%',
                background: '#1B4F9C',
                borderRadius: 2,
                animation: 'shimmer 1.6s ease-in-out infinite',
              }}
            />
          </div>
          <div style={{ fontSize: 13, color: '#6b7280' }}>{loadingStatus}</div>
        </div>
      )}

      {/* Extracted text preview — debug only */}
      {extractedPreview && (
        <div
          style={{
            background: '#f8f9fb',
            border: '0.5px solid #c9d0da',
            borderRadius: 8,
            padding: '12px 14px',
            marginBottom: 16,
            position: 'relative',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', letterSpacing: '0.5px' }}>
              PDF EXTRACTION PREVIEW (first 500 chars)
            </span>
            <button
              onClick={clearPreview}
              style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: 16, cursor: 'pointer', lineHeight: 1 }}
            >
              ×
            </button>
          </div>
          <pre
            style={{
              fontSize: 12,
              color: '#374151',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              margin: 0,
              fontFamily: 'monospace',
              lineHeight: 1.6,
            }}
          >
            {extractedPreview}
          </pre>
        </div>
      )}

      {/* Error */}
      {error && (
        <div
          className="fade-in"
          style={{
            background: '#fef2f2',
            border: '0.5px solid #fca5a5',
            borderRadius: 8,
            padding: '12px 16px',
            color: '#dc2626',
            fontSize: 14,
            marginBottom: 16,
          }}
        >
          {error}
        </div>
      )}

      {/* Output */}
      {result && (
        <div className="fade-in">

          {/* ── TL;DR ── */}
          {mode === 'tldr' && (
            <>
              <div style={{ background: '#fff', border: '0.5px solid #e0e3e8', borderRadius: 10, padding: 20, marginBottom: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4, lineHeight: 1.4 }}>{result.title}</div>
                {result.year && <div style={{ color: '#9ca3af', fontSize: 13, marginBottom: 12 }}>{result.year}</div>}
                <p style={{ color: '#374151', lineHeight: 1.75, fontSize: 14, margin: 0 }}>{result.tldr}</p>
              </div>
              {result.keyNumber && (
                <div style={{ background: '#EAF3DE', border: '0.5px solid #3B6D11', borderRadius: 10, padding: '12px 18px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#3B6D11' }}>{result.keyNumber}</div>
                  <div style={{ fontSize: 12, color: '#27500A' }}>Key metric</div>
                </div>
              )}
              <Keywords result={result} />
            </>
          )}

          {/* ── FULL BREAKDOWN ── */}
          {mode === 'full' && (
            <>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 20, lineHeight: 1.3, marginBottom: 4 }}>{result.title}</div>
                <div style={{ color: '#9ca3af', fontSize: 13 }}>{[result.authors, result.year].filter(Boolean).join(' · ')}</div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                {result.readTime != null && <MetricBox value={`${result.readTime}m`} label="Read time" />}
                {result.complexity && <MetricBox value={result.complexity} label="Complexity" />}
                {result.keywords && <MetricBox value={result.keywords.length} label="Keywords" />}
              </div>
              {result.oneliner && (
                <div style={{ background: '#f4f6f9', borderRadius: 8, padding: '12px 16px', marginBottom: 14 }}>
                  <p style={{ fontStyle: 'italic', color: '#374151', fontSize: 14, margin: 0, lineHeight: 1.6 }}>{result.oneliner}</p>
                </div>
              )}
              <Keywords result={result} />
              {result.problem && (
                <div style={{ background: '#f4f6f9', border: '0.5px solid #e0e3e8', borderRadius: 10, padding: '14px 18px', marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 6, letterSpacing: '0.4px' }}>THE PROBLEM</div>
                  <p style={{ color: '#374151', fontSize: 14, margin: 0, lineHeight: 1.65 }}>{result.problem}</p>
                </div>
              )}
              {result.concept && (
                <Section title="Core Concept">
                  <p style={{ color: '#374151', fontSize: 14, lineHeight: 1.75, margin: 0 }}>{result.concept}</p>
                </Section>
              )}
              {result.mechanics?.length > 0 && (
                <Section title="How It Works">
                  {result.mechanics.map((m, i) => (
                    <div key={i} style={{ padding: '5px 0', fontSize: 14, lineHeight: 1.65, color: '#374151' }}>
                      <span style={{ fontWeight: 700 }}>• {m.name}:</span>{' '}<span>{m.explanation}</span>
                    </div>
                  ))}
                </Section>
              )}
              {(result.keyAdvantage || result.key_advantage) && (
                <div style={{ borderLeft: '3px solid #1B4F9C', background: '#f0f5ff', borderRadius: '0 8px 8px 0', padding: '12px 14px', marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#1B4F9C', marginBottom: 4, letterSpacing: '0.4px' }}>KEY ADVANTAGE</div>
                  <p style={{ color: '#1B4F9C', fontSize: 14, fontWeight: 500, margin: 0, lineHeight: 1.6 }}>{result.keyAdvantage || result.key_advantage}</p>
                </div>
              )}
              {result.results && (
                <div style={{ background: '#EAF3DE', border: '0.5px solid #3B6D11', borderRadius: 10, padding: '14px 18px', marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#3B6D11', marginBottom: 6, letterSpacing: '0.4px' }}>RESULTS</div>
                  <p style={{ color: '#3B6D11', fontSize: 14, margin: 0, lineHeight: 1.65 }}>{result.results}</p>
                </div>
              )}
              {result.figures && (
                <div style={{ background: '#FAEEDA', border: '0.5px solid #854F0B', borderRadius: 10, padding: '14px 18px', marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#854F0B', marginBottom: 6, letterSpacing: '0.4px' }}>KEY FIGURES & DIAGRAMS</div>
                  <p style={{ color: '#854F0B', fontSize: 14, margin: 0, lineHeight: 1.65 }}>{result.figures}</p>
                </div>
              )}
              {result.keyNumbers?.length > 0 && (
                <Section title="Key Numbers">
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #e0e3e8' }}>
                        {['Metric', 'Value', 'Context'].map((h) => (
                          <th key={h} style={{ padding: '6px 8px 6px 0', textAlign: 'left', color: '#6b7280', fontWeight: 600 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.keyNumbers.map((kn, i) => (
                        <tr key={i} style={{ borderBottom: '0.5px solid #f3f4f6' }}>
                          <td style={{ padding: '6px 8px 6px 0', color: '#374151', fontWeight: 500 }}>{kn.metric}</td>
                          <td style={{ padding: '6px 8px', color: '#1B4F9C', fontWeight: 700 }}>{kn.value}</td>
                          <td style={{ padding: '6px 0', color: '#6b7280' }}>{kn.context}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Section>
              )}
              {result.limitations && (
                <div style={{ background: '#FAEEDA', border: '0.5px solid #854F0B', borderRadius: 10, padding: '14px 18px', marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#854F0B', marginBottom: 6, letterSpacing: '0.4px' }}>LIMITATIONS</div>
                  <p style={{ color: '#633806', fontSize: 14, margin: 0, lineHeight: 1.65 }}>{result.limitations}</p>
                </div>
              )}
            </>
          )}

          {/* ── ELI5 ── */}
          {mode === 'eli5' && (
            <>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 18, lineHeight: 1.3, marginBottom: 4 }}>{result.title}</div>
                <div style={{ color: '#9ca3af', fontSize: 13 }}>{result.year}</div>
              </div>
              {result.oneliner && (
                <div style={{ background: '#f4f6f9', borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontStyle: 'italic', color: '#374151', fontSize: 14, lineHeight: 1.6 }}>
                  {result.oneliner}
                </div>
              )}
              {[
                { label: 'Before', value: result.before, bg: '#FAEEDA', border: '#854F0B', text: '#633806' },
                { label: 'The Big Idea', value: result.idea, bg: '#EEEDFE', border: '#534AB7', text: '#1e1b4b' },
                { label: 'How It Works', value: result.how, bg: '#EAF3DE', border: '#3B6D11', text: '#1a3f00' },
                { label: 'What Changed', value: result.after, bg: '#E6F1FB', border: '#1B4F9C', text: '#0C447C' },
              ].map((step, i) => step.value && (
                <div key={i}>
                  {i > 0 && <div style={{ textAlign: 'center', fontSize: 20, color: '#9ca3af', margin: '2px 0' }}>↓</div>}
                  <div style={{ background: step.bg, border: `0.5px solid ${step.border}`, borderRadius: 10, padding: '14px 18px', marginBottom: 4 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: step.border, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{step.label}</div>
                    <p style={{ fontSize: 14, lineHeight: 1.75, color: step.text, margin: 0 }}>{step.value}</p>
                  </div>
                </div>
              ))}
              <div style={{ marginTop: 12 }}><Keywords result={result} /></div>
            </>
          )}

          {/* ── METHODOLOGY ── */}
          {mode === 'methodology' && (
            <>
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 18, lineHeight: 1.3, marginBottom: 4 }}>{result.title}</div>
                <div style={{ color: '#9ca3af', fontSize: 13 }}>{result.year}</div>
              </div>
              {result.oneliner && (
                <p style={{ fontStyle: 'italic', color: '#374151', fontSize: 14, marginBottom: 14, lineHeight: 1.6 }}>{result.oneliner}</p>
              )}
              {result.priorWork && (
                <Section title="Prior Work">
                  <p style={{ fontSize: 14, color: '#374151', lineHeight: 1.7, margin: 0 }}>{result.priorWork}</p>
                </Section>
              )}
              {result.architecture && (
                <Section title="Architecture">
                  <p style={{ fontSize: 14, color: '#374151', lineHeight: 1.7, margin: 0 }}>{result.architecture}</p>
                </Section>
              )}
              {result.trainingDetails && Object.values(result.trainingDetails).some(Boolean) && (
                <Section title="Training Details">
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <tbody>
                      {Object.entries(result.trainingDetails).filter(([, v]) => v).map(([k, v]) => (
                        <tr key={k} style={{ borderBottom: '0.5px solid #e0e3e8' }}>
                          <td style={{ padding: '7px 12px 7px 0', color: '#6b7280', fontWeight: 600, width: '28%', textTransform: 'capitalize' }}>{k}</td>
                          <td style={{ padding: '7px 0', color: '#374151' }}>{v}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Section>
              )}
              {result.evaluation && (
                <Section title="Evaluation">
                  {result.evaluation.metrics?.length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, marginBottom: 6 }}>METRICS</div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {result.evaluation.metrics.map((m, i) => (
                          <span key={i} style={{ background: '#f3f4f6', color: '#374151', padding: '3px 10px', borderRadius: 6, fontSize: 12 }}>{m}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {result.evaluation.benchmarks?.length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, marginBottom: 6 }}>BENCHMARKS</div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {result.evaluation.benchmarks.map((b, i) => (
                          <span key={i} style={{ background: '#EEEDFE', color: '#3C3489', padding: '3px 10px', borderRadius: 6, fontSize: 12 }}>{b}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {result.evaluation.results && (
                    <p style={{ fontSize: 14, color: '#374151', lineHeight: 1.7, margin: 0 }}>{result.evaluation.results}</p>
                  )}
                </Section>
              )}
              {result.ablations && (
                <Section title="Ablations">
                  <p style={{ fontSize: 14, color: '#374151', lineHeight: 1.7, margin: 0 }}>{result.ablations}</p>
                </Section>
              )}
              {result.limitations && (
                <div style={{ background: '#FAEEDA', border: '0.5px solid #854F0B', borderRadius: 10, padding: '14px 18px', marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#854F0B', marginBottom: 6, letterSpacing: '0.4px' }}>LIMITATIONS</div>
                  <p style={{ color: '#633806', fontSize: 14, margin: 0, lineHeight: 1.65 }}>{result.limitations}</p>
                </div>
              )}
              <Keywords result={result} />
            </>
          )}

          {/* Inline fact-check */}
          {result && paperText && (
            <InlineFact
              summary={[result.tldr, result.concept, result.findings]
                .filter(Boolean).join(' ')}
              abstract={paperText.slice(0, 3000)}
              autoRun={true}
            />
          )}

          {/* Share buttons */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
            <button
              onClick={() =>
                window.open(`https://wa.me/?text=${encodeURIComponent(shareText())}`, '_blank')
              }
              style={shareBtn('#25D366', '#fff')}
            >
              WhatsApp
            </button>
            <button
              onClick={() =>
                window.open(
                  `mailto:?subject=${encodeURIComponent(result.title || 'Paper Summary')}&body=${encodeURIComponent(shareText())}`,
                  '_blank'
                )
              }
              style={shareBtn('#fff', '#374151', '#d1d5db')}
            >
              Email
            </button>
            <button onClick={handleCopy} style={shareBtn('#fff', '#374151', '#d1d5db')}>
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>

          {/* Q&A section */}
          <div
            style={{
              background: '#fff',
              border: '0.5px solid #e0e3e8',
              borderRadius: 10,
              padding: 20,
            }}
          >
            <div style={{ fontWeight: 600, color: '#1B4F9C', marginBottom: 12, fontSize: 14 }}>
              Ask about this paper
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <textarea
                value={qaInput}
                onChange={(e) => setQaInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleAsk();
                  }
                }}
                placeholder="Ask a specific question about this paper…"
                rows={2}
                style={{
                  flex: 1,
                  padding: '9px 12px',
                  border: '0.5px solid #d1d5db',
                  borderRadius: 7,
                  fontSize: 13,
                  resize: 'none',
                  outline: 'none',
                  lineHeight: 1.5,
                }}
              />
              <button
                onClick={handleAsk}
                disabled={qaLoading || !qaInput.trim()}
                style={{
                  padding: '9px 16px',
                  background: qaLoading || !qaInput.trim() ? '#9ca3af' : '#1B4F9C',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 7,
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: qaLoading || !qaInput.trim() ? 'not-allowed' : 'pointer',
                  alignSelf: 'flex-start',
                }}
              >
                {qaLoading ? '…' : 'Ask'}
              </button>
            </div>

            {qaList.length > 0 && (
              <div style={{ marginTop: 16 }}>
                {qaList.map((qa, i) => (
                  <div
                    key={i}
                    style={{ borderTop: '0.5px solid #f3f4f6', paddingTop: 12, marginTop: 12 }}
                  >
                    <div style={{ fontWeight: 600, color: '#1a1a1a', marginBottom: 5, fontSize: 13 }}>
                      Q: {qa.q}
                    </div>
                    <div style={{ color: '#6b7280', lineHeight: 1.65, fontSize: 13 }}>
                      {qa.a}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Keywords({ result }) {
  if (!result.keywords?.length) return null;
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
      {result.keywords.map((kw, i) => {
        const c = TAG_COLORS[i % TAG_COLORS.length];
        return (
          <span key={i} style={{ background: c.bg, color: c.color, padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500 }}>
            {kw}
          </span>
        );
      })}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ background: '#fff', border: '0.5px solid #e0e3e8', borderRadius: 10, padding: 18, marginBottom: 14 }}>
      <div style={{ fontWeight: 600, color: '#1B4F9C', fontSize: 13, marginBottom: 10, letterSpacing: '0.3px' }}>
        {title.toUpperCase()}
      </div>
      {children}
    </div>
  );
}

function MetricBox({ value, label }) {
  return (
    <div
      style={{
        background: '#fff',
        border: '0.5px solid #e0e3e8',
        borderRadius: 8,
        padding: '12px 16px',
        textAlign: 'center',
        flex: 1,
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 700, color: '#1B4F9C' }}>{value}</div>
      <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{label}</div>
    </div>
  );
}

function shareBtn(bg, color, border) {
  return {
    flex: 1,
    padding: '9px',
    background: bg,
    color,
    border: border ? `0.5px solid ${border}` : 'none',
    borderRadius: 7,
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
  };
}
