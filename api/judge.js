import { config } from 'dotenv';
config({ path: '.env.local' });

// api/judge.js — Redesigned judge endpoint
// Replaces the old YES/NO single-prompt judge
// Accepts: { evalType, payload: { prompt } }
// Returns: { result: { ...scores }, evalType }

import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Token budgets per eval type — faithfulness needs room for issue lists
const TOKEN_LIMITS = {
  faithfulness:         400,
  coverage:             400,
  modeFidelity:         300,
  citationGrounding:    200,
  contradictionReality: 250,
  gapNovelty:           200,
  synthesisQuality:     250,
};

function cleanJSON(text) {
  const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object found in response');
  return cleaned.slice(start, end + 1);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { evalType, payload } = req.body || {};

  if (!evalType || !payload?.prompt) {
    return res.status(400).json({ error: 'evalType and payload.prompt are required' });
  }

  if (!TOKEN_LIMITS[evalType]) {
    return res.status(400).json({ error: `Unknown evalType: ${evalType}` });
  }

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: TOKEN_LIMITS[evalType],
      system: [
        'You are a strict academic evaluator.',
        'Return ONLY valid JSON — no markdown, no backticks, no explanation.',
        'Start your response with { and end with }.',
        'Be critical and specific. Vague or generic feedback is not useful.',
      ].join(' '),
      messages: [{ role: 'user', content: payload.prompt }],
    });

    const raw = response.content[0]?.text || '';

    let result;
    try {
      result = JSON.parse(cleanJSON(raw));
    } catch {
      // If Claude still wrapped in markdown, return a safe error shape
      result = { error: 'parse_failed', raw: raw.slice(0, 300) };
    }

    if (result?.error) {
      console.error('[judge] parse failed for', evalType, ':', result.raw?.slice(0, 200));
    }

    return res.status(200).json({ result, evalType });
  } catch (err) {
    console.error(`[judge] ${evalType} error:`, err.message);
    return res.status(500).json({ error: err.message });
  }
}
