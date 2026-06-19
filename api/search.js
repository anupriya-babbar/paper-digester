import { config } from 'dotenv';
config({ path: '.env.local' });

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { query } = req.query;
  if (!query) {
    return res.status(400).json({ error: 'query required' });
  }

  try {
    const fields = 'title,abstract,year,authors,' +
      'externalIds,citationCount,publicationDate,venue';
    const url = `https://api.semanticscholar.org/graph/v1/paper/search` +
      `?query=${encodeURIComponent(query)}&limit=10&fields=${fields}`;

    const response = await fetch(url, {
      headers: { 'User-Agent': 'PaperDigester/1.0' },
    });

    if (!response.ok) {
      return res.status(response.status).json({
        error: `Semantic Scholar error: ${response.status}`,
      });
    }

    const data = await response.json();
    res.status(200).json(data);
  } catch (e) {
    console.error('Search proxy error:', e.message);
    res.status(500).json({ error: e.message });
  }
}
