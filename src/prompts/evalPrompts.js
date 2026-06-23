// src/prompts/evalPrompts.js
// All judge prompts for summary and chain evaluation.
// Each prompt is reference-anchored and returns a specific JSON shape.
// The judge is instructed to be strict — "seems reasonable" is not enough.

// ─────────────────────────────────────────────
// SUMMARY EVAL PROMPTS
// ─────────────────────────────────────────────

/**
 * Faithfulness — does the summary make claims the abstract doesn't support?
 * Requires abstract as ground truth. Returns issues[] and a score.
 */
export function faithfulnessPrompt(abstract, summaryText) {
  return `You are an academic fact-checker evaluating an AI summary.

IMPORTANT CONTEXT: This summary was generated from the FULL paper,
not just the abstract below. Therefore the summary will correctly
contain details, mechanisms, and specifics that are NOT in the
abstract. This is expected and GOOD — it means the summary read
the full paper.

ORIGINAL ABSTRACT (partial ground truth):
${abstract}

AI-GENERATED SUMMARY:
${summaryText}

Your task: Flag ONLY genuine faithfulness violations. A violation is:
- A claim that DIRECTLY CONTRADICTS the abstract
- An obviously fabricated specific number or result
- A claim that misrepresents what the paper does

NOT violations (do NOT flag these):
- Details present in the summary but not the abstract (came from full paper)
- Technical terms explained or elaborated
- Reasonable implications or context
- Simplifications that preserve meaning
- Specific mechanisms, architecture details, or method names not in abstract

Be generous. Only flag claims you are confident contradict the
paper or are fabricated. When in doubt, do NOT flag.

Return ONLY valid JSON:
{
  "issues": ["only genuine contradictions or fabrications"],
  "score": 90
}

Scoring: Start at 100. Subtract 25 for each GENUINE violation
(contradiction or fabrication). Simplifications and additions
from the full paper do NOT reduce the score. Empty issues = 100.`;
}

/**
 * Coverage — does the summary capture the paper's main contribution?
 * Requires abstract as ground truth. Returns mainContribution and covered bool.
 */
export function coveragePrompt(abstract, summaryText, fullText = '') {
  return `You are checking whether an AI summary captures the core contribution of a paper.

ORIGINAL ABSTRACT:
${abstract}

${fullText ? `ADDITIONAL PAPER CONTEXT (introduction, methods, results):
${fullText.slice(0, 2000)}` : ''}

AI-GENERATED SUMMARY:
${summaryText}

Task:
1. State the single most important contribution from the abstract.
2. Check if the summary covers ALL FOUR of these dimensions:
   - Main contribution (what the paper proposes)
   - At least one concrete result or number
   - The method or mechanism (how it works)
   - Scope or limitations
3. Is the main contribution clearly present in the summary?

Return ONLY valid JSON:
{
  "mainContribution": "one sentence",
  "coversContribution": true,
  "coversResults": true,
  "coversMechanism": true,
  "coversScope": true,
  "covered": true,
  "reason": "brief explanation",
  "score": 85
}

score: coversContribution(40pts) + coversResults(20pts) + coversMechanism(20pts) + coversScope(20pts)`;
}

/**
 * Mode Fidelity — does the summary follow the rules of its digest mode?
 * No abstract needed. Mode-specific criteria.
 */
export function modeFidelityPrompt(mode, summaryText) {
  const modeInstructions = {
    tldr: `TL;DR mode requirements:
1. Must be 3 sentences or fewer
2. Must be jargon-free — no domain-specific technical terms
3. Must cover: (a) the problem, (b) the solution, (c) why it matters

Return ONLY valid JSON:
{
  "sentenceCount": 3,
  "jargonFound": ["any technical terms found"],
  "coversAllThree": true,
  "issues": ["list specific violations"],
  "passes": true,
  "score": 90
}

score: start at 100. Subtract 20 if over 3 sentences. Subtract 15 per jargon term (max -30). Subtract 20 if misses any of the 3 required elements.`,

    eli5: `ELI5 mode requirements (Explain Like I'm 5/a curious teenager):
1. Must use at least one real-world analogy (not "like a computer does X")
2. Must avoid domain-specific jargon (technical terms a 16-year-old wouldn't know)
3. Must have before/after framing — what was the problem before, what changed after

Return ONLY valid JSON:
{
  "hasRealAnalogy": true,
  "jargonFound": ["technical terms found"],
  "hasBeforeAfter": true,
  "issues": ["list specific violations"],
  "passes": true,
  "score": 85
}

score: hasRealAnalogy=34pts + hasBeforeAfter=33pts + (jargonFound.length===0 ? 33 : max(0, 33 - jargonFound.length*10))`,

    methodology: `Methodology mode requirements (expert technical audience):
1. Must mention the model architecture or specific design decisions
2. Must mention training details: dataset used, training process, or hyperparameters
3. Must mention evaluation: specific benchmarks, metrics, or quantitative results

Return ONLY valid JSON:
{
  "hasArchitecture": true,
  "hasTrainingDetails": true,
  "hasEvaluation": true,
  "issues": ["list what's missing"],
  "passes": true,
  "score": 100
}

score: (hasArchitecture + hasTrainingDetails + hasEvaluation) / 3 * 100, rounded.`,

    full: `Full Breakdown mode requirements:
1. Must state the problem being solved
2. Must explain the approach or mechanics of the solution
3. Must include key results (ideally with numbers)
4. Must mention at least one limitation or caveat

Return ONLY valid JSON:
{
  "hasProblem": true,
  "hasApproach": true,
  "hasResults": true,
  "hasLimitations": false,
  "issues": ["Missing limitations"],
  "passes": false,
  "score": 75
}

score: (hasProblem + hasApproach + hasResults + hasLimitations) / 4 * 100, rounded.`
  };

  const instructions = modeInstructions[mode] || modeInstructions.full;

  return `You are checking whether an AI summary correctly follows the "${mode.toUpperCase()}" digest format.

SUMMARY TEXT:
${summaryText}

${instructions}`;
}

// ─────────────────────────────────────────────
// CHAIN EVAL PROMPTS
// ─────────────────────────────────────────────

/**
 * Citation Grounding — does the cited paper actually support the claim made?
 * Pass the specific paper's summary + the claim attributed to it.
 */
export function citationGroundingPrompt(paperNum, paperYear, paperSummary, claim) {
  return `You are a citation verifier. Your job is to check if a paper actually supports a specific claim.

PAPER P${paperNum} (${paperYear}) SUMMARY:
${paperSummary}

CLAIM ATTRIBUTED TO P${paperNum}:
"${claim}"

Does this paper's summary directly support this specific claim?
Rules:
- Be strict: the paper must actually say this or something equivalent
- Being in the same research area is NOT sufficient
- Paraphrases count — the exact wording doesn't need to match

Return ONLY valid JSON:
{
  "grounded": true,
  "reason": "one specific sentence explaining why it is or isn't grounded",
  "score": 100
}

score: 100 if grounded, 0 if not grounded.`;
}

/**
 * Contradiction Reality — is the stated contradiction a genuine disagreement?
 * Pass both paper summaries + the stated contradiction text.
 */
export function contradictionRealityPrompt(summaryA, paperALabel, summaryB, paperBLabel, contradiction) {
  return `You are validating whether a stated contradiction between two papers is real.

${paperALabel} SUMMARY:
${summaryA}

${paperBLabel} SUMMARY:
${summaryB}

STATED CONTRADICTION:
"${contradiction}"

Is this a genuine disagreement between these two papers?
Rules:
- Both papers must take opposing positions on the SAME specific point
- Discussing different things is NOT a contradiction
- Different scope or context is NOT a contradiction unless they make competing claims
- The disagreement must be evident from the summaries provided

Return ONLY valid JSON:
{
  "valid": true,
  "reason": "one specific sentence explaining the nature of the disagreement or why it isn't one",
  "score": 100
}

score: 100 if valid contradiction, 0 if not a real contradiction.`;
}

/**
 * Gap Novelty — is the research gap genuinely unaddressed by the papers?
 * Pass all paper summaries concatenated + the gap + suggested approach.
 */
export function gapNoveltyPrompt(allSummariesText, gap, suggestedApproach) {
  return `You are evaluating whether a research gap is genuinely unexplored.

PAPER SUMMARIES:
${allSummariesText}

STATED RESEARCH GAP:
"${gap}"

SUGGESTED APPROACH:
"${suggestedApproach || 'Not specified'}"

Is this gap genuinely unaddressed by any of the papers above?
Rules:
- If any paper substantially addresses this gap, it is NOT novel
- Partial coverage counts — if the gap is largely handled, flag it
- A gap can be novel even if papers mention the topic, as long as they don't solve it

Return ONLY valid JSON:
{
  "novel": true,
  "reason": "one specific sentence explaining why this is or isn't a genuine gap",
  "addressedBy": null,
  "score": 100
}

addressedBy: set to paper label (e.g. "P3 (2015)") if that paper addresses the gap, otherwise null.
score: 100 if genuinely novel and unaddressed, 0 if one of the papers already addresses it.`;
}

/**
 * Synthesis Quality — does the key insight go beyond individual summaries?
 * Pass all paper summaries + the chain's keyInsight.
 */
export function synthesisQualityPrompt(allSummariesText, keyInsight) {
  return `You are evaluating whether a cross-paper synthesis adds genuine insight.

INDIVIDUAL PAPER SUMMARIES:
${allSummariesText}

CROSS-PAPER KEY INSIGHT:
"${keyInsight}"

Does this key insight reveal something that is NOT already stated in any individual paper summary?
Rules:
- Genuine synthesis connects papers and reveals a pattern not visible from any one paper alone
- Restating what one paper says, even in different words, is NOT synthesis
- Aggregating two points from different papers into one sentence is NOT synthesis
- Synthesis must reveal something only visible when all papers are considered together

Return ONLY valid JSON:
{
  "beyondIndividual": true,
  "reason": "one specific sentence explaining what makes this genuine synthesis or why it falls short",
  "score": 100
}

score: 100 if genuinely synthesizes across papers, 0 if it restates individual paper content.`;
}
