function buildPaperDescription(paper) {
  const parts = [];

  // Use one concise summary — prefer tldr, fall back to concept or oneliner
  const summary = paper.tldr?.slice(0, 200)
    ?? paper.concept?.slice(0, 200)
    ?? paper.oneliner
    ?? null;
  if (summary) parts.push(`Summary: ${summary}`);

  if (paper.key_advantage) parts.push(`Key advantage: ${paper.key_advantage.slice(0, 120)}`);
  if (paper.keywords?.length) parts.push(`Keywords: ${paper.keywords.slice(0, 4).join(', ')}`);

  if (parts.length === 0) {
    parts.push('Note: Only title and year available. Synthesize based on your knowledge.');
  }

  return parts.join('\n');
}

export function chainPrompt(papers) {
  const paperList = papers
    .map((p, i) =>
      `[P${i + 1}] ${p.year || 'Unknown year'} — ${p.title}\n${buildPaperDescription(p)}`
    )
    .join('\n\n---\n\n');

  return `IMPORTANT: You have all the information you need. Do NOT ask for more info. Generate the JSON immediately.

You are a research synthesis expert. Analyze these ${papers.length} papers and return ONLY valid JSON.
No markdown. No backticks. Start your response with { and end with }.
Be concise — keep every string field under 80 words.

Use citations in exactly this format: [P1: 2021] — never any other format.

Return EXACTLY this JSON structure (no extra fields):
{
  "keyInsight": "single most important takeaway across all papers, with citations [P1: year]",
  "evolution": "2-3 paragraph narrative of how ideas evolved. Cite every claim [P1: year]. Separate paragraphs with \\n\\n.",
  "agreements": "what the papers agree on, every claim cited [P1: year] [P2: year]",
  "contradictions": "where papers disagree or differ in approach, every claim cited",
  "gaps": [
    {
      "gap": "specific unanswered research question",
      "citations": ["P1: 2021", "P2: 2019"],
      "suggestedApproach": "brief suggestion for a future paper"
    },
    {
      "gap": "second unanswered research question",
      "citations": ["P3: 2017"],
      "suggestedApproach": "brief suggestion for a future paper"
    }
  ]
}

Papers to analyze:
${paperList}`;
}
