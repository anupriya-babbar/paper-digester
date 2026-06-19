import Anthropic from '@anthropic-ai/sdk';
import { writeFile, readFile } from 'fs/promises';
import { existsSync } from 'fs';

// Node.js eval script — run with: node src/eval/evalRunner.js
// Requires ANTHROPIC_API_KEY env var (not the VITE_ prefixed one)

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const RESULTS_FILE = 'eval-results.json';

export async function evaluateSummary(paperText, summary, title) {
  const prompt = `You are an academic evaluator. Compare this research paper summary against the original text. Score on:
- accuracy: did it misrepresent anything? (1-5, where 5 = perfectly accurate)
- completeness: were key findings covered? (1-5, where 5 = fully complete)
- clarity: is it understandable to a non-expert? (1-5, where 5 = very clear)
- overall: weighted average of the above (1-5)

ORIGINAL PAPER TEXT (first 8000 chars):
${paperText.slice(0, 8000)}

SUMMARY TO EVALUATE:
${summary}

Return ONLY valid JSON, no markdown, no backticks:
{"accuracy":N,"completeness":N,"clarity":N,"overall":N,"missed_points":["..."],"hallucinations":["..."]}

For missed_points: list key findings from the paper not covered in the summary (empty array if none).
For hallucinations: list any claims in the summary not supported by the paper (empty array if none).`;

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1200,
    messages: [{ role: 'user', content: prompt }],
  });

  const responseText = message.content[0].text;
  const score = JSON.parse(responseText.trim());

  let results = [];
  if (existsSync(RESULTS_FILE)) {
    const existing = await readFile(RESULTS_FILE, 'utf8');
    results = JSON.parse(existing);
  }
  results.push({ title, timestamp: new Date().toISOString(), score });
  await writeFile(RESULTS_FILE, JSON.stringify(results, null, 2));

  return score;
}

export async function runEvalSuite(papersWithSummaries) {
  const results = [];
  for (const { paperText, summary, title } of papersWithSummaries) {
    console.log(`Evaluating: ${title}`);
    const score = await evaluateSummary(paperText, summary, title);
    results.push({ title, score });
    console.log(`  accuracy=${score.accuracy} completeness=${score.completeness} clarity=${score.clarity} overall=${score.overall}`);
  }

  const avg = (key) =>
    results.reduce((sum, r) => sum + (r.score[key] || 0), 0) / results.length;

  const averages = {
    accuracy: +avg('accuracy').toFixed(2),
    completeness: +avg('completeness').toFixed(2),
    clarity: +avg('clarity').toFixed(2),
    overall: +avg('overall').toFixed(2),
  };

  console.log('\nAverage scores:', averages);
  return { results, averages };
}
