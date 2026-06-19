function cleanJSON(text) {
  let cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '');
  const objStart = cleaned.indexOf('{');
  const arrStart = cleaned.indexOf('[');
  const isArray = arrStart !== -1 && (objStart === -1 || arrStart < objStart);
  const start = isArray ? arrStart : objStart;
  const end = isArray ? cleaned.lastIndexOf(']') : cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) {
    throw new Error('No JSON found in response');
  }
  return cleaned.slice(start, end + 1).trim();
}

const callClaude = async (prompt, maxTokens = 800) => {
  const res = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, maxTokens }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Claude API failed');
  }
  const data = await res.json();
  console.log('Claude raw response:\n', data.text);
  return data.text;
};

export function useClaude() {
  return { callClaude };
}
