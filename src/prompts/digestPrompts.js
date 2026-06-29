const smartText = (text) => {
  const words = text.split(' ');
  const intro  = words.slice(0, 500).join(' ');
  const mid    = words.slice(
    Math.floor(words.length / 2 - 150),
    Math.floor(words.length / 2 + 150)
  ).join(' ');
  const end    = words.slice(-400).join(' ');
  return `${intro}\n\n[...]\n\n${mid}\n\n[...]\n\n${end}`;
};

const PREAMBLE = `You must respond with ONLY a valid JSON object.
No markdown. No backticks. No preamble.
Start with { and end with }.
Do NOT ask for more information.
Generate the JSON immediately.

Extract conclusions from Figure/Table captions and surrounding text. Include exact numbers, percentages, model names from the paper.`;

export const tldr = (text) => `${PREAMBLE}

Summarize this research paper in exactly 3 plain English sentences for someone with no domain expertise.

Sentence 1: What problem did this paper solve?
Sentence 2: What did they build or discover?
Sentence 3: What was the key result? Include specific numbers if mentioned (accuracy %, BLEU score, etc.)

Rules:
- Zero jargon. If a technical term is unavoidable, explain it in brackets e.g. "neural network [a type of AI]"
- Include the single most important number from the paper
- Do NOT use analogies
- Do NOT explain how it works — just what and why

Return JSON:
{"title":"paper title","year":"YYYY","authors":"Last et al.","tldr":"Three plain sentences here.","keyNumber":"the single most important metric e.g. 28.4 BLEU","keywords":["tag1","tag2","tag3","tag4"]}

Paper text:
${smartText(text)}`;

export const full = (text) => `${PREAMBLE}

Analyze this research paper using the IMRAD structure (Introduction, Methods, Results, Discussion).

Rules:
- Accessibility rule: Every technical term must be defined the FIRST time it appears using this format: term (plain English definition). Examples: "attention mechanism (a way for the model to focus on the most relevant parts of the input)", "BLEU score (a standard 0-100 metric for translation quality — higher is better)", "encoder (the part that reads and compresses input)". This applies to ALL technical terms in ALL fields. No exceptions.
- Include ALL specific numbers, percentages, benchmark scores mentioned in the paper
- Extract conclusions from Figure and Table captions
- keyNumbers must have 4-6 entries with exact values

Return this exact JSON:
{
  "title": "paper title",
  "year": "YYYY",
  "authors": "Last et al.",
  "readTime": 8,
  "complexity": "Advanced",
  "oneliner": "One sentence: what this paper is and why it matters",
  "problem": "Answer these three things in 3 sentences: 1. What was the state of the field BEFORE this paper? Name the specific limitation or gap. 2. Why did that limitation matter? What could NOT be done because of it? 3. What would solving it enable? This is the motivation section — make it clear to someone who has never heard of this field.",
  "concept": "The core idea explained clearly. Technical terms allowed but must be defined in parentheses on first use. 3-4 sentences.",
  "mechanics": [{"name": "Component or technique name", "explanation": "What it does, how it works, why it matters. Include numbers where relevant. Generate maximum 4 mechanics. Each explanation must be under 80 words."}],
  "keyNumbers": [{"metric": "metric name e.g. Top-5 Error Rate", "value": "exact value e.g. 15.3%", "context": "what this means e.g. vs 26.2% previous best. Generate maximum 4 key numbers."}],
  "keyAdvantage": "What makes this better than what came before. One specific sentence with evidence.",
  "results": "Specific benchmark results with exact numbers from the paper.",
  "figures": "What key figures and tables show. Extract from captions and surrounding text.",
  "limitations": "What the authors acknowledge as limitations or future work. 1-2 sentences.",
  "keywords": ["tag1","tag2","tag3","tag4","tag5","tag6"]
}

Paper text:
${smartText(text)}`;

export const eli5 = (text) => `${PREAMBLE}

Explain this research paper to a curious 12-year-old with no science background.

Rules:
- ZERO technical terms. Not even common ones like "neural network", "algorithm", "parameter", "model". Replace ALL with everyday language or analogies
- ZERO numbers or percentages
- Use only concrete real-world analogies
- Structure as: before this existed → the key idea → what changed after
- Every concept must be explained through something the reader already knows

Return JSON:
{"title":"paper title in plain English","year":"YYYY","oneliner":"What this paper is about in one sentence a child could understand","before":"What was the problem or limitation before this paper? Use an everyday analogy. 2 sentences.","idea":"The core breakthrough explained through a real-world analogy. Start with 'Imagine...' or 'Think of it like...'. 3-4 sentences.","how":"How the solution actually works, explained through the same analogy. No technical terms. 2-3 sentences.","after":"What changed because of this discovery? Real-world impact explained simply. 2 sentences.","keywords":["plain English tag1","plain English tag2","tag3","tag4"]}

Paper text:
${smartText(text)}`;

export const methodology = (text) => `${PREAMBLE}

Extract the complete methodological details of this research paper for an expert reader.

Rules:
- Maximum technical precision
- Include all dataset names, model architectures, hyperparameters, evaluation metrics mentioned
- Reference figures and tables by number
- Include training details, compute requirements
- Note statistical significance where mentioned
- Include ALL numbers, formulas described in text

Return JSON:
{
  "title": "paper title",
  "year": "YYYY",
  "oneliner": "One technical sentence describing the contribution",
  "priorWork": "What prior methods this builds on or replaces. Cite specific systems by name.",
  "architecture": "Complete architecture description. Layers, dimensions, components. Reference figures.",
  "trainingDetails": {
    "dataset": "dataset name and size",
    "optimizer": "optimizer and learning rate if mentioned",
    "compute": "hardware and training time if mentioned",
    "epochs": "training duration if mentioned",
    "augmentation": "data augmentation techniques if mentioned"
  },
  "evaluation": {
    "metrics": ["metric1", "metric2"],
    "benchmarks": ["benchmark1", "benchmark2"],
    "results": "All numeric results with exact values and comparison to baselines"
  },
  "ablations": "Ablation studies conducted and their findings if present",
  "limitations": "Explicitly stated limitations and failure modes",
  "keywords": ["technical-tag1","technical-tag2","tag3","tag4","tag5"]
}

Paper text:
${smartText(text)}`;
