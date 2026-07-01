import { config } from 'dotenv';
config({ path: '.env.local' });

const SELECT = 'title,authorships,publication_year,abstract_inverted_index,cited_by_count,locations,ids,topics';
const MAILTO = 'mailto=anupriyababbar0110@gmail.com';
const HEADERS = { 'User-Agent': 'PaperDigester/1.0' };

/** Apply the arXiv post-filter and map raw OpenAlex works to our shape. */
function parseResults(data) {
  return (data.results || [])
    .filter((p) =>
      p.locations?.some((l) => l.landing_page_url?.includes('arxiv.org')) ||
      p.ids?.arxiv
    )
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
}

function parseResultsRelaxed(data) {
  return (data.results || [])
    .map((p) => {
      // Try to get arxiv URL first
      const arxivLocation = p.locations?.find((l) =>
        l.landing_page_url?.includes('arxiv.org')
      );
      // Fall back to any open access URL
      const anyOALocation = p.locations?.find((l) =>
        l.landing_page_url && l.is_oa
      );
      const location = arxivLocation || anyOALocation;
      if (!location?.landing_page_url) return null;

      const url = location.landing_page_url;
      const arxivId = url.includes('arxiv.org')
        ? url.replace('https://arxiv.org/abs/', '')
            .replace('http://arxiv.org/abs/', '').trim()
        : null;

      let abstract = '';
      if (p.abstract_inverted_index) {
        const words = {};
        Object.entries(p.abstract_inverted_index).forEach(([word, positions]) => {
          positions.forEach((pos) => { words[pos] = word; });
        });
        abstract = Object.keys(words).sort((a, b) => Number(a) - Number(b))
          .map((k) => words[k]).join(' ');
      }

      return {
        title: p.title || '',
        authors: (p.authorships || []).slice(0, 3)
          .map((a) => a.author?.display_name || '').filter(Boolean).join(', '),
        year: p.publication_year,
        venue: '',
        abstract,
        arxiv_id: arxivId,
        citationCount: p.cited_by_count || 0,
        keywords: (p.topics || []).slice(0, 4).map((t) => t.display_name),
        publicationDate: p.publication_year ? `${p.publication_year}-01-01` : null,
      };
    })
    .filter((p) => p !== null && p.title);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { query } = req.query;
  if (!query) return res.status(400).json({ error: 'query required' });

  // Detect arXiv ID pattern: digits.digits (e.g. 1706.03762 or 2301.07041)
  const arxivIdPattern = /^\d{4}\.\d{4,5}(v\d+)?$/;
  if (arxivIdPattern.test(query.trim())) {
    const arxivId = query.trim().replace(/v\d+$/, ''); // strip version

    // Fetch directly from OpenAlex using arXiv ID filter
    const arxivUrl =
      `https://api.openalex.org/works` +
      `?filter=ids.arxiv:${arxivId}` +
      `&select=${SELECT}` +
      `&${MAILTO}`;

    try {
      const arxivRes = await fetch(arxivUrl, { headers: HEADERS });
      if (arxivRes.ok) {
        const arxivData = await arxivRes.json();
        const results = parseResults(arxivData);
        if (results.length > 0) {
          console.log('[search] strategy used: arxiv-id, results:', results.length);
          return res.status(200).json({ data: results });
        }
      }
    } catch (e) {
      console.warn('[search] arxiv-id OpenAlex lookup failed:', e.message);
    }

    // Fallback: fetch metadata directly from arXiv API
    const arXivApiUrl =
      `https://export.arxiv.org/api/query?id_list=${arxivId}&max_results=1`;

    const arXivRes = await fetch(arXivApiUrl, { headers: HEADERS });
    if (arXivRes.ok) {
      const xml = await arXivRes.text();

      const titleMatch = xml.match(/<title>([\s\S]*?)<\/title>/g);
      const title = titleMatch?.[1]
        ?.replace(/<title>|<\/title>/g, '')
        ?.trim() || '';

      const abstractMatch = xml.match(/<summary>([\s\S]*?)<\/summary>/);
      const abstract = abstractMatch?.[1]?.trim() || '';

      const authorMatches = [...xml.matchAll(/<name>(.*?)<\/name>/g)];
      const authors = authorMatches.slice(0, 3).map(m => m[1]).join(', ');

      const dateMatch = xml.match(/<published>(.*?)<\/published>/);
      const year = dateMatch?.[1]?.slice(0, 4) || '';

      if (title) {
        console.log('[search] strategy used: arxiv-api-direct');
        return res.status(200).json({
          data: [{
            title,
            abstract,
            authors,
            year: parseInt(year),
            arxiv_id: arxivId,
            citationCount: 0,
            keywords: [],
            publicationDate: year,
            venue: 'arXiv',
          }],
        });
      }
    }

    return res.status(200).json({
      data: [],
      message: 'Paper not found on arXiv. Please check the ID and try again.',
    });
  }

  try {
    // STEP 1 — Title search (relevance-ranked)
    const titleUrl =
      `https://api.openalex.org/works` +
      `?filter=title.search:${encodeURIComponent(query)},open_access.is_oa:true` +
      `&per_page=25` +
      `&sort=relevance_score:desc` +
      `&select=${SELECT}` +
      `&${MAILTO}`;

    const titleRes = await fetch(titleUrl, { headers: HEADERS });
    const titleResults = titleRes.ok ? parseResults(await titleRes.json()) : [];

    // STEP 2 — Keyword fallback when title search yields fewer than 3 arXiv results
    const kwUrl =
      `https://api.openalex.org/works` +
      `?search=${encodeURIComponent(query)}` +
      `&filter=open_access.is_oa:true` +
      `&per_page=25` +
      `&sort=relevance_score:desc` +
      `&select=${SELECT}` +
      `&${MAILTO}`;

    let kwResults = [];
    if (titleResults.length < 3) {
      console.log('[search] STEP2 triggering keyword fallback for:', query);
      try {
        const kwRes = await fetch(kwUrl, { headers: HEADERS });
        console.log('[search] STEP2 kwRes status:', kwRes.status);
        const kwData = await kwRes.json();
        console.log('[search] STEP2 raw results count:', kwData?.results?.length);
        kwResults = parseResults(kwData);
        console.log('[search] STEP2 after arXiv filter:', kwResults.length);
      } catch(e) {
        console.error('[search] STEP2 error:', e.message);
      }
    }

    // Combine, deduplicate by arxiv_id
    const seen = new Set();
    const combined = [...titleResults, ...kwResults].filter((p) => {
      if (seen.has(p.arxiv_id)) return false;
      seen.add(p.arxiv_id);
      return true;
    });

    if (combined.length === 0) {
      const kwUrl =
        `https://api.openalex.org/works` +
        `?search=${encodeURIComponent(query)}` +
        `&filter=open_access.is_oa:true` +
        `&per_page=25` +
        `&sort=relevance_score:desc` +
        `&select=${SELECT}` +
        `&${MAILTO}`;
      const relaxedRes = await fetch(kwUrl, { headers: HEADERS });
      const relaxedResults = relaxedRes.ok
        ? parseResultsRelaxed(await relaxedRes.json())
        : [];
      if (relaxedResults.length > 0) {
        console.log('[search] strategy used: relaxed results:', relaxedResults.length);
        return res.status(200).json({ data: relaxedResults.slice(0, 6) });
      }
    }

    const strategy = kwResults.length > 0 ? 'keyword' : 'title';
    console.log('[search] strategy used:', strategy, 'results:', combined.length);

    const papers = combined.slice(0, 6);

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
