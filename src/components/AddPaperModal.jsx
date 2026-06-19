import { useState } from 'react';
import Digest from './Digest';
import PaperSearch from './PaperSearch';

function ImportBibTeX({ onPaperSaved, onClose }) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');

  function parseBibTeX(raw) {
    const titleMatch = raw.match(/title\s*=\s*[{"](.+?)[}"]/is);
    const authorMatch = raw.match(/author\s*=\s*[{"](.+?)[}"]/is);
    const yearMatch = raw.match(/year\s*=\s*[{"]?(\d{4})[}"']?/i);
    const abstractMatch = raw.match(/abstract\s*=\s*[{"](.+?)[}"]/is);
    if (!titleMatch) return null;
    return {
      title: titleMatch[1].replace(/[{}]/g, '').trim(),
      authors: authorMatch ? authorMatch[1].replace(/[{}]/g, '').trim() : '',
      year: yearMatch ? yearMatch[1] : '',
      abstract: abstractMatch ? abstractMatch[1].replace(/[{}]/g, '').trim() : '',
      keywords: [],
      source: 'upload',
      summarized: false,
    };
  }

  function handleImport() {
    if (!text.trim()) { setError('Paste a BibTeX entry first'); return; }
    const paper = parseBibTeX(text);
    if (!paper) { setError('Could not parse BibTeX — make sure it has a title field.'); return; }
    onPaperSaved(paper);
    onClose();
  }

  return (
    <div>
      <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 12, lineHeight: 1.6 }}>
        Paste a BibTeX entry to import paper metadata into your library.
      </p>
      <textarea
        value={text}
        onChange={(e) => { setText(e.target.value); setError(''); }}
        placeholder={`@article{example2024,\n  title = {Your paper title},\n  author = {Author, Name},\n  year = {2024},\n  abstract = {...}\n}`}
        style={{
          width: '100%', minHeight: 180, padding: '10px 12px',
          border: '0.5px solid #d1d5db', borderRadius: 8,
          fontSize: 12, fontFamily: 'monospace', resize: 'vertical',
          boxSizing: 'border-box', background: '#fafbfc', outline: 'none',
        }}
      />
      {error && <div style={{ color: '#dc2626', fontSize: 12, marginTop: 6 }}>{error}</div>}
      <button
        onClick={handleImport}
        style={{
          marginTop: 12, width: '100%', padding: '10px',
          background: '#1B4F9C', color: '#fff', border: 'none',
          borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer',
        }}
      >
        Import Paper
      </button>
    </div>
  );
}

const TABS = [
  { id: 'upload', label: 'Upload PDF' },
  { id: 'search', label: 'Search arXiv' },
  { id: 'bibtex', label: 'BibTeX' },
];

export default function AddPaperModal({ open, onClose, onPaperSaved, library = [] }) {
  const [activeTab, setActiveTab] = useState('upload');

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.4)', zIndex: 300,
        }}
      />

      {/* Modal */}
      <div style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 'min(680px, 95vw)', maxHeight: '85vh',
        display: 'flex', flexDirection: 'column',
        background: '#fff', borderRadius: 14,
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        zIndex: 301, overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px 0', flexShrink: 0,
        }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>Add Paper</div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: 'none', fontSize: 22,
              color: '#9ca3af', cursor: 'pointer', lineHeight: 1, padding: '0 2px',
            }}
          >
            ×
          </button>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex', gap: 0, padding: '12px 20px 0', flexShrink: 0,
          borderBottom: '0.5px solid #e0e3e8',
        }}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '7px 14px', fontSize: 13, fontWeight: 500,
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: activeTab === tab.id ? '#1B4F9C' : '#6b7280',
                borderBottom: activeTab === tab.id
                  ? '2px solid #1B4F9C'
                  : '2px solid transparent',
                marginBottom: -1,
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          {activeTab === 'upload' && (
            <Digest
              onPaperSaved={(paper) => { onPaperSaved(paper); onClose(); }}
              insideModal
            />
          )}
          {activeTab === 'search' && (
            <PaperSearch
              onPaperSaved={onPaperSaved}
              library={library}
              initialOpen={true}
            />
          )}
          {activeTab === 'bibtex' && (
            <ImportBibTeX
              onPaperSaved={(paper) => { onPaperSaved(paper); onClose(); }}
              onClose={onClose}
            />
          )}
        </div>
      </div>
    </>
  );
}
