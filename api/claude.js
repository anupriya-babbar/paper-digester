import { config } from 'dotenv';
config({ path: '.env.local' });
import Anthropic from '@anthropic-ai/sdk';

export default async function handler(req, res) {
  console.log('ENV KEY exists:', !!process.env.ANTHROPIC_API_KEY);
  console.log('ENV KEY prefix:', process.env.ANTHROPIC_API_KEY?.slice(0, 10));

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { prompt, maxTokens = 1000, system } = req.body;
  const safeMaxTokens = Math.min(maxTokens, 4500);

  if (!prompt) {
    return res.status(400).json({ error: 'prompt required' });
  }

  try {
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: safeMaxTokens,
      messages: [{ role: 'user', content: prompt }],
      ...(system ? { system } : {}),
    });

    const text = message.content[0]?.text || '';
    res.status(200).json({ text });
  } catch (e) {
    console.error('Claude API error:', e.message);
    res.status(500).json({ error: e.message });
  }
};
