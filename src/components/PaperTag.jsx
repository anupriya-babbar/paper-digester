export default function PaperTag({ publicationDate }) {
  if (!publicationDate) return null;

  const days = (Date.now() - new Date(publicationDate)) / (1000 * 60 * 60 * 24);
  if (days > 30) return null;

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 3,
      padding: '2px 7px',
      borderRadius: 10,
      background: '#EAF3DE',
      color: '#27500A',
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: '0.04em',
      border: '0.5px solid #8BC34A',
    }}>
      🆕 NEW
    </span>
  );
}
