async function callJudge(prompt) {
  const res = await fetch('/api/judge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });
  if (!res.ok) throw new Error('Judge API failed');
  const data = await res.json();
  return data.text || '';
}

function parseYesNo(raw, defaultValue = true) {
  if (!raw) return defaultValue;
  const text = raw.trim().toUpperCase();
  const yesIndex = text.indexOf('YES');
  const noIndex = text.indexOf('NO');

  if (yesIndex === -1 && noIndex === -1) {
    console.warn('Ambiguous response:', raw);
    return defaultValue;
  }
  if (yesIndex === -1) return false;
  if (noIndex === -1) return true;
  return yesIndex < noIndex;
}

function parseJSON(raw, fallback) {
  const cleaned = raw.replace(/```json/g, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1) return fallback;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return fallback;
  }
}

function sentenceFallback(text) {
  return text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20)
    .slice(0, 8);
}

export async function extractClaims(abstract) {
  const prompt = `Extract exactly 8 specific factual claims from this abstract. Each claim must be a complete sentence that is specific and verifiable. Include numbers, model names, percentages where present in the abstract.

IMPORTANT: Return ONLY this JSON, nothing else:
{"claims": ["claim 1", "claim 2", "claim 3", "claim 4", "claim 5", "claim 6", "claim 7", "claim 8"]}

Abstract: ${abstract.slice(0, 2000)}`;

  try {
    const raw = await callJudge(prompt);
    console.log('extractClaims raw response:', raw);

    const parsed = parseJSON(raw, { claims: [] });
    const claims = parsed.claims || [];

    if (claims.length === 0) {
      console.error('Empty claims from judge, using sentence fallback');
      return sentenceFallback(abstract);
    }

    console.log('Extracted claims:', claims);
    return claims;
  } catch (e) {
    console.error('extractClaims error:', e);
    return sentenceFallback(abstract);
  }
}

export async function checkClaim(claim, summary) {
  const prompt = `Read this summary and check if it contains this information.

CLAIM: ${claim}

SUMMARY: ${summary.slice(0, 2000)}

Does the summary contain this information (exact or paraphrased)?
Reply with only one word: YES or NO`;

  try {
    const raw = await callJudge(prompt);
    console.log('RAW GEMINI RESPONSE:', raw);
    console.log('checkClaim result:', raw.trim().slice(0, 10));
    return { found: parseYesNo(raw, false), reason: '' };
  } catch (e) {
    return { found: false, reason: '' };
  }
}

export async function checkSentence(sentence, abstract) {
  const prompt = `You are checking if a sentence from a research paper summary is factually accurate based on the paper abstract.

Sentence from summary: "${sentence}"

Paper abstract: "${abstract.slice(0, 1500)}"

Rules:
- Mark as supported if the sentence describes the same concept in different words or with an analogy
- Mark as supported if it is a reasonable educational explanation of what the abstract says
- Only mark as NOT supported if it contains a factual claim that CONTRADICTS the abstract or introduces completely unrelated information

Is this sentence factually supported by or consistent with the abstract?

You MUST respond with exactly one word: YES or NO`;

  try {
    const raw = await callJudge(prompt);
    return { supported: parseYesNo(raw, true), reason: raw.trim() };
  } catch (e) {
    return { supported: true, reason: 'Error' };
  }
}

export async function checkCitation(citedPaperSummary, synthesisClaim, paperId) {
  const prompt = `Paper summary: "${citedPaperSummary.slice(0, 500)}"

Synthesis claims about this paper: "${synthesisClaim}"

Does the paper summary support this claim?
Reply with only one word: YES or NO`;

  const raw = await callJudge(prompt);
  return {
    accurate: parseYesNo(raw, false),
    reason: raw.trim(),
  };
}

export async function checkContradiction(paperASummary, paperBSummary, contradictionClaim) {
  const prompt = `Paper A: "${paperASummary.slice(0, 400)}"
Paper B: "${paperBSummary.slice(0, 400)}"

Claimed contradiction: "${contradictionClaim}"

Is this a genuine contradiction between these papers?
Reply with only one word: YES or NO`;

  const raw = await callJudge(prompt);
  return {
    valid: parseYesNo(raw, false),
    reason: raw.trim(),
  };
}

export async function checkGap(allSummaries, gapClaim) {
  const summariesText = allSummaries
    .map((s, i) => `Paper ${i + 1}: ${s.slice(0, 400)}`)
    .join('\n\n');

  const cleanGap = gapClaim
    .replace(/\[P\d+(?::\s*\d{4})?\]/g, '')
    .replace(/P\d+\s*\[\d{4}\]/g, '')
    .trim();

  const prompt = `You are evaluating research gaps.

These are summaries of the papers in the collection:
${summariesText}

Claimed research gap: "${cleanGap}"

Question: Is this research question genuinely NOT answered by any of the paper summaries above?

Important:
- Read the paper summaries carefully
- If none of the summaries address this question → YES
- If any summary addresses this question → NO
- Ignore any paper labels like P1, P2, P3

Reply with only one word: YES or NO`;

  try {
    const raw = await callJudge(prompt);
    console.log('checkGap:', cleanGap.slice(0, 60), '→', raw.trim());
    return {
      plausible: parseYesNo(raw, true),
      reason: raw.trim(),
    };
  } catch (e) {
    return { plausible: true, reason: 'Error' };
  }
}
