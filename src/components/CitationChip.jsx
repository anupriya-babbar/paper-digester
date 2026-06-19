export default function CitationChip({ paperId, year }) {
  // paperId is always "P1", "P2", etc.
  const num = parseInt(paperId.replace('P', ''), 10);
  const label = `${paperId}: ${year}`;

  const handleClick = () => {
    const el = document.getElementById(`paper-card-${num}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.style.transition = 'border-color 0.15s, box-shadow 0.15s';
    el.style.borderColor = '#1B4F9C';
    el.style.boxShadow = '0 0 0 3px rgba(27,79,156,0.2)';
    setTimeout(() => {
      el.style.borderColor = '';
      el.style.boxShadow = '';
    }, 2500);
  };

  return (
    <span
      onClick={handleClick}
      title={`Jump to paper ${paperId}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        background: '#dbeafe',
        color: '#1d4ed8',
        padding: '1px 8px',
        borderRadius: 12,
        fontSize: 12,
        fontWeight: 600,
        cursor: 'pointer',
        margin: '0 2px',
        border: '0.5px solid #93c5fd',
        whiteSpace: 'nowrap',
        userSelect: 'none',
      }}
    >
      📎 {label}
    </span>
  );
}
