import { config } from 'dotenv';
config({ path: '.env.local' });

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { query } = req.query;
  if (!query) return res.status(400).json({ error: 'query required' });

  try {
    const url =
      `https://api.openalex.org/works` +
      `?search=${encodeURIComponent(query)}` +
      `&filter=open_access.is_oa:true` +
      `&per_page=10` +
      `&select=title,authorships,publication_year,` +
      `abstract_inverted_index,cited_by_count,` +
      `locations,ids,topics` +
      `&mailto=anupriyababbar0110@gmail.com`;

    const response = await fetch(url, {
      headers: { 'User-Agent': 'PaperDigester/1.0' },
    });

    if (!response.ok) {
      return res.status(response.status).json({
        error: `Search failed: ${response.status}`,
      });
    }

    const data = await response.json();

    const papers = (data.results || [])
      .filter((p) =>
        p.locations?.some((l) => l.landing_page_url?.includes('arxiv.org')) ||
        p.ids?.arxiv
      )
      .slice(0, 6)
      .map((p) => {
        const arxivLocation = p.locations?.find((l) =>
          l.landing_page_url?.includes('arxiv.org')
        );
        const arxivUrl =
          arxivLocation?.landing_page_url || p.ids?.arxiv || '';
        const arxivId = arxivUrl
          .replace('https://arxiv.org/abs/', '')
          .replace('http://arxiv.org/abs/', '')
          .trim();

        let abstract = '';
        if (p.abstract_inverted_index) {
          const words = {};
          Object.entries(p.abstract_inverted_index).forEach(([word, positions]) => {
            positions.forEach((pos) => { words[pos] = word; });
          });
          abstract = Object.keys(words)
            .sort((a, b) => Number(a) - Number(b))
            .map((k) => words[k])
            .join(' ');
        }

        const authors = (p.authorships || [])
          .slice(0, 3)
          .map((a) => a.author?.display_name || '')
          .filter(Boolean)
          .join(', ');

        const keywords = (p.topics || [])
          .slice(0, 4)
          .map((t) => t.display_name);

        return {
          title: p.title || '',
          authors,
          year: p.publication_year,
          venue: '',
          abstract,
          arxiv_id: arxivId,
          citationCount: p.cited_by_count || 0,
          publicationDate: p.publication_year ? `${p.publication_year}-01-01` : null,
          keywords,
        };
      })
      .filter((p) => p.arxiv_id && p.title);

    if (papers.length === 0) {
      return res.status(200).json({
        data: [],
        message: 'No open access papers found. Try different keywords.',
      });
    }

    res.status(200).json({ data: papers });
  } catch (e) {
    console.error('OpenAlex search error:', e.message);
    res.status(500).json({ error: e.message });
  }
}
