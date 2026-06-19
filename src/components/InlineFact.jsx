import { useState, useEffect } from 'react';
import { extractClaims, checkClaim } from '../hooks/useGeminiJudge';

export default function InlineFact({ summary, abstract, autoRun = true }) {
  const [status, setStatus] = useState('idle'); // idle | running | done | error
  const [verified, setVerified] = useState(0);
  const [total, setTotal] = useState(0);
  const [details, setDetails] = useState([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (autoRun && abstract && summary) {
      runFactCheck();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abstract, summary]);

  async function runFactCheck() {
    if (!abstract || !summary) return;
    setStatus('running');
    setVerified(0);
    setDetails([]);
    try {
      const claims = await extractClaims(abstract);
      setTotal(claims.length);

      let verifiedCount = 0;
      const results = [];
      for (const claim of claims) {
        const result = await checkClaim(claim, summary);
        if (result.found) verifiedCount++;
        results.push({ claim, ...result });
        setVerified(verifiedCount);
      }

      setDetails(results);
      setStatus('done');
    } catch (e) {
      console.error('Fact check error:', e);
      setStatus('error');
    }
  }

  if (status === 'idle' || status === 'error') return null;

  if (status === 'running') {
    return (
      <div style={{
        fontSize: 12, color: 'var(--muted)', padding: '6px 0',
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          background: '#378ADD', display: 'inline-block',
          animation: 'pd-spin 1s linear infinite',
        }} />
        Fact checking {verified}/{total} claims…
      </div>
    );
  }

  const pct = total > 0 ? Math.round((verified / total) * 100) : 0;
  const color = pct >= 75 ? '#27500A' : pct >= 50 ? '#854F0B' : '#A32D2D';
  const bg    = pct >= 75 ? '#EAF3DE' : pct >= 50 ? '#FAEEDA' : '#FCEBEB';

  return (
    <div style={{ padding: '6px 0' }}>
      <div
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '3px 10px', borderRadius: 10,
          background: bg, color, fontSize: 12, fontWeight: 500,
          cursor: 'pointer', userSelect: 'none',
        }}
      >
        🔍 {verified}/{total} claims verified
        <span style={{ fontSize: 10 }}>{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {details.map((d, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, fontSize: 12, alignItems: 'flex-start' }}>
              <span style={{ color: d.found ? '#27500A' : '#A32D2D', flexShrink: 0, marginTop: 1 }}>
                {d.found ? '✓' : '✗'}
              </span>
              <div>
                <div style={{ color: 'var(--text)', lineHeight: 1.4 }}>{d.claim}</div>
                {!d.found && d.reason && (
                  <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 2 }}>{d.reason}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
