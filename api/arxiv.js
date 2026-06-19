import { config } from 'dotenv';
config({ path: '.env.local' });

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  if (!id) {
    return res.status(400).json({ error: 'id required' });
  }

  try {
    const response = await fetch(
      `https://export.arxiv.org/api/query?id_list=${id}`
    );
    if (!response.ok) {
      return res.status(response.status).json({
        error: `arXiv error: ${response.status}`,
      });
    }
    const xml = await response.text();
    res.status(200).send(xml);
  } catch (e) {
    console.error('arXiv proxy error:', e.message);
    res.status(500).json({ error: e.message });
  }
}
