# Paper Digester — Product Requirements Document

**Version 3.0 — Eval System Redesign**
*Built with Claude Code | Stack: React + Vite, Anthropic Claude API, PDF.js, OpenAlex API, Supabase*

---

## Document Info

| Field | Value |
|---|---|
| Version | 3.0 — Eval System Redesign |
| Status | Active Development — Capstone Build |
| Build Tool | Claude Code (claude-code CLI) |
| AI Model | claude-haiku-4-5 — summarizer + judge (same model, adversarial prompts) |
| Storage | Supabase (PostgreSQL + Auth) — all data including eval results |
| Hosting | Vercel free tier + Vercel Serverless Functions |
| Est. Cost | < $1 total for full capstone testing + demo |

---

## 0. What Changed from v1.0

This section documents every major decision made during the build phase that differs from the original PRD v1.0.

### 0.1 Architecture Changes

- Removed separate Search tab — search lives inside Digest tab as collapsible PaperSearch panel
- Removed Chain tab — chains live in sidebar Library under Chains section
- Added two-panel layout: 260px fixed sidebar + main content area replacing 3-tab navigation
- Added Vercel serverless functions (`api/fetch-pdf.js`, `api/fetch-text.js`) to bypass CORS for arXiv/PMC
- Added `SummaryPanel.jsx` — slide-in right panel for search result summaries
- Added `PaperView.jsx` — full paper summary view in main area when paper clicked from sidebar

### 0.2 AI Model Decision

> **Model: claude-haiku-4-5 (not Groq, not Gemini)**
>
> During development, Groq free tier (6000 TPM limit) and Gemini 2.0 Flash (daily quota exceeded) both failed repeatedly during testing. Switched to Anthropic claude-haiku-4-5 with $5 API credit. Total estimated spend for entire capstone: <$1. Decision: use Anthropic directly — reliability > free tier friction.

### 0.3 Free Paper Sources — Final Decision

- arXiv + PMC only for free full text — Unpaywall removed (unreliable third-party URLs)
- Semantic Scholar API for search (200M+ papers, no key required)
- Paywalled papers show Google Scholar + Semantic Scholar links only
- CORS bypass via Vercel serverless proxy — enables full PDF fetch from arXiv in browser

### 0.4 Prompt Engineering — Major Upgrade

> **Key insight: Teach, don't summarize**
>
> Original prompt said "summarize this paper". Changed to: explain the core concept as if teaching for the first time, explain what problem existed before, use analogies, explain how it works mechanically, include figure/table conclusions from captions. Output is now structured JSON with: `oneliner`, `concept`, `mechanics[]`, `key_advantage`, `results`, `figures`, `keywords`.

- Added figure/diagram awareness: extract conclusions from figure captions and surrounding text
- Smart text extraction: first 400 words + last 300 words instead of first 12000 chars — captures abstract AND conclusion
- Chain prompt upgraded with mandatory `[P1: year]` citation format — model never makes uncited claim
- Added IMPORTANT prefix to chain prompt: "Do NOT ask for more information — generate JSON immediately"

### 0.5 Library Structure — 4 Sections

- **Uploaded Papers** — `source: 'upload'` — PDFs digested via Digest tab
- **Searched Papers** — `source: 'search'` — summarized from Semantic Scholar results
- **My Downloads** — `source: 'download'` — fetched from arXiv/PMC, PDF saved to device
- **Chains** — saved chain syntheses, stored in localStorage key `pd-chains`

### 0.6 Demo Data — Neural Network Chain

5 pre-loaded landmark Neural Network papers seeded automatically on first load. Stored in `src/data/demoLibrary.js`.

| Paper | Title |
|---|---|
| P1 2012 | AlexNet — ImageNet Classification with Deep CNNs |
| P2 2014 | Seq2Seq — Sequence to Sequence Learning with Neural Networks |
| P3 2015 | Bahdanau — Neural Machine Translation by Jointly Learning to Align and Translate |
| P4 2017 | Transformer — Attention Is All You Need |
| P5 2020 | GPT-3 — Language Models are Few-Shot Learners |

All 5 available as free PDFs on arXiv. Pre-loaded with full summaries. Demo chain "Neural Network Evolution" auto-created in Chains section.

### 0.7 Eval System — Complete Redesign (v3.0)

> **Problem with v2.0 eval:** The old system asked Claude to score its own output in isolation — no ground truth, YES/NO responses in 100 tokens, session-based localStorage that reset daily. Scores were unreliable and all dimensions showed N/A due to structural bugs.

> **v3.0 approach: Reference-anchored, adversarial, semantic evaluation stored persistently in Supabase.**

#### Summary Eval — 3 LLM Dimensions + 2 Free Checks

| Dimension | Type | What it checks |
|---|---|---|
| Faithfulness | LLM judge | Claims in summary NOT supported by abstract — adversarial prompt finds specific unsupported statements |
| Coverage | LLM judge | Main contribution per abstract — is it present in the summary? |
| Mode Fidelity | LLM judge | TL;DR ≤3 sentences; ELI5 has analogy + no jargon; Methodology has architecture + training + eval |
| Keyword Coverage | Free (rule-based) | % of paper's stored keywords found in summary text |
| Number Preservation | Free (rule-based) | % of significant numbers from abstract preserved in summary |

Overall = LLM avg × 70% + free checks avg × 30%

#### Chain Eval — 4 LLM Dimensions + 1 Free Check

| Dimension | Type | What it checks |
|---|---|---|
| Citation Grounding | LLM judge | Does cited paper's summary actually support the specific claim? Semantic check, not structural |
| Contradiction Reality | LLM judge | Do both papers genuinely take opposing positions, or just discuss different things? |
| Gap Novelty | LLM judge | Is the research gap genuinely unaddressed by any paper in the chain? |
| Synthesis Quality | LLM judge | Does the key insight go beyond what any individual paper says? |
| Citation Density | Free (rule-based) | % of sentences in evolution + agreements that carry a [Pn: year] chip |

#### Key Architecture Decisions

- **Same model (haiku) as judge** — made reliable via adversarial prompts and reference-anchoring. Judge always receives source (abstract or paper summaries) alongside the output being evaluated.
- **Separate token budgets per eval type** — faithfulness gets 400 tokens (needs room for issues list), citation grounding gets 200 (yes/no + reason). Old system used 100 tokens for everything.
- **Persistent storage** — eval results saved to Supabase `eval_results` table (not localStorage). Overview tab aggregates across all sessions.
- **Background eval** — fires 3 seconds after summary generation, dispatches `pd:evalComplete` DOM event for sidebar badge update.
- **Abstract dependency** — faithfulness and coverage require abstract. Demo papers lack abstracts (known issue). Papers summarized via Search arXiv now save abstract + arxiv_id to Supabase at summarization time.
- **Score variance** — LLM judge scores vary slightly across runs (non-deterministic). This is expected; reported as a known characteristic in capstone presentation.

#### New Files Added (v3.0)

```
api/judge.js                    — redesigned: accepts evalType, routes to correct token budget
src/prompts/evalPrompts.js      — all 7 eval prompts (faithfulness, coverage, modeFidelity,
                                  citationGrounding, contradictionReality, gapNovelty, synthesisQuality)
src/hooks/useEval.js            — primary eval hook: runSummaryEval() + runChainEval()
src/utils/freeChecks.js         — rule-based: keywordCoverage, numberPreservation, lengthSanity,
                                  citationDensity, extractCitationClaims, extractContradictionPairs
src/utils/evalStorage.js        — Supabase eval persistence + computeOverviewStats()
src/hooks/useBackgroundEval.js  — redesigned: fires after summary, saves to Supabase
```

---

## 1. Executive Summary

Paper Digester is a zero-subscription AI research synthesis tool built as a capstone project. It solves a specific pain point: researchers, students, and knowledge workers spend disproportionate time reading and manually synthesizing academic papers.

> **Core Hypothesis**
>
> Researchers who accumulate paper summaries over time will find cross-paper synthesis — specifically the identification of contradictions and research gaps with verifiable citation trails — significantly more valuable than single-paper summarization alone.

The product has four functional layers:

- **Digest** — upload any PDF or search papers, get AI-powered structured breakdown with teaching-first approach
- **Library Sidebar** — persistent reading history in 4 sections: Uploaded, Searched, Downloads, Chains
- **Chain Synthesis** — select papers from library, generate cross-paper synthesis with cited evidence
- **Eval Runner** — LLM-as-judge automatically scores summary quality across accuracy, completeness, clarity

---

## 2. Final Architecture

### 2.1 Two-Panel Layout

```
┌──────────────┬──────────────────────────────────────────┐
│  SIDEBAR     │  MAIN AREA                               │
│  260px fixed │                                          │
│              │  Default: Digest (upload + search)       │
│ 📄 Uploaded  │                                          │
│ 🔍 Searched  │  Paper click → PaperView                 │
│ ⬇ Downloads  │  Chain click → ChainView                 │
│ 🔗 Chains    │  Build Chain bar → ChainView             │
│   Demo chain │                                          │
│   + New      │                                          │
└──────────────┴──────────────────────────────────────────┘
```

LEFT: 260px fixed sidebar (collapsible, hamburger on mobile)
RIGHT: Main content area — Digest / PaperView / ChainView

### 2.2 Main Views

| View | Description |
|---|---|
| Digest view | Default. PDF upload + PaperSearch collapsible panel. Analyze + mode selector + output. |
| Paper view | Opens when paper clicked in sidebar. Full structured summary. Back button returns. |
| Chain view | Opens when chain clicked OR Build Chain clicked. Timeline + synthesis. |
| SummaryPanel | Slide-in right overlay (420px) when Summarize clicked on search result. |

### 2.3 Tech Stack — Final

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite |
| PDF parsing | PDF.js (pdfjs-dist) — client-side, CDN worker |
| AI model | Anthropic claude-haiku-4-5 via @anthropic-ai/sdk |
| Paper search | OpenAlex API — free, no key, no rate limits, 250M+ papers (switched from Semantic Scholar) |
| Free full text | arXiv API + PMC E-utilities — restricted to these two only |
| CORS proxy | Vercel serverless: `api/fetch-pdf.js` + `api/fetch-text.js` |
| Storage | Supabase (PostgreSQL + Auth) — papers, chains, eval_results, feedback, suggestions_cache |
| Hosting | Vercel free tier — `npm i -g vercel && vercel` |
| Eval | `src/hooks/useEval.js` — reference-anchored LLM-as-judge, results stored in Supabase eval_results |

---

## 3. Feature Specifications

### 3.1 Digest Tab

| Feature | Description | Priority | Status |
|---|---|---|---|
| PDF Upload | Drag-and-drop or click. PDF.js extracts text. Max 8 pages. | P0 | Done |
| Smart text extract | First 400 words + last 300 words — captures abstract AND conclusion. | P0 | Done |
| TL;DR Mode | 3 sentences: problem → solution → why it matters. | P0 | Done |
| Full Breakdown | Teaching-first: concept with analogy, mechanics[], key advantage, results, figures. | P0 | Done |
| ELI5 Mode | Explain to curious 16-year-old. Real analogies. Before/after framing. | P0 | Done |
| Methodology Mode | Step-by-step method, datasets, eval metrics, differentiation. | P1 | Done |
| Figure awareness | Extract conclusions from Figure/Table captions and surrounding text. | P0 | Done |
| Auto-save to Library | Every digest saved with all fields + mode + date. Appears in sidebar immediately. | P0 | Done |
| Share — WhatsApp | wa.me deep link with pre-formatted summary. | P1 | Done |
| Share — Email | mailto: with subject + body. | P1 | Done |
| Copy to clipboard | Full summary text, one click. | P1 | Done |
| Q&A on paper | Follow-up questions with paper context. Enter key submits. | P1 | Done |

### 3.2 PaperSearch (inside Digest tab)

| Feature | Description | Priority | Status |
|---|---|---|---|
| Semantic Scholar search | Query 200M+ papers. Returns title, authors, year, abstract, citations, venue. | P0 | Done |
| Auto-access detection | On result load, auto-check arXiv/PMC ids. Green (free) or amber (paywalled). | P0 | Done |
| Summarize button | Only for arXiv/PMC papers. Fetches full text via proxy → AI summary → Library. | P0 | Done |
| Download button | arXiv only. Fetches PDF via proxy, triggers browser download, saves to My Downloads. | P1 | Done |
| SummaryPanel | Slide-in right panel shows summary while generating. Close & Save saves to library. | P0 | Done |
| Paywalled fallback | Google Scholar + Semantic Scholar links. Clear "No free full text" message. | P0 | Done |
| Load more | Paginated results. Shows total count and remaining. | P1 | Done |

### 3.3 Library Sidebar

| Feature | Description | Priority | Status |
|---|---|---|---|
| 4-section split | Uploaded / Searched / Downloads / Chains. Each collapsible with count badge. | P0 | Done |
| Paper click → view | Opens PaperView in main area with full summary. | P0 | Done |
| Checkbox selection | Check papers to select for chain. Full card left side clickable. | P0 | Done |
| Checked highlight | Selected papers get blue left border. Tab shows "2 selected". | P0 | Done |
| Build Chain bar | Sticky bottom bar when 1+ checked. Disabled until 2+ selected. | P0 | Done |
| My Downloads section | Shows PDF badge + Summarize Now button if not yet summarized. | P0 | Done |
| Demo data banner | Purple banner when demo papers present. "Clear demo data" link. | P1 | Done |
| Sidebar toggle | ≡ collapses/expands. Mobile: hamburger + overlay. | P0 | Done |
| Upload/Search CTA | "+ Upload / Search Paper" button in sidebar footer. | P0 | Done |

### 3.4 Chain Synthesis

| Feature | Description | Priority | Status |
|---|---|---|---|
| Timeline per paper | One card per paper chronologically. Year, short title, contribution. | P0 | Done |
| Key Insight card | Highlighted purple card at top — single most important takeaway. | P0 | Done |
| Evolution narrative | How thinking shifted across papers. Every sentence cited `[P1: year]`. | P0 | Done |
| Agreements section | Bullet list of what papers agree on, each with citation chips. | P0 | Done |
| Contradictions section | Each contradiction as a card — Side A vs Side B with citations + significance. | P0 | Done |
| Research Gaps | Numbered gap cards with reasoning + suggestedApproach. Cited. | P0 | Done |
| Citation chips | `[P1: 2021]` renders as clickable blue pills. Click → scroll + highlight 2.5s. | P0 | Done |
| renderWithCitations() | Parser splits text on `[Pn: year]` pattern, renders chips inline. | P0 | Done |
| Editable chain name | Inline input field. Saved to localStorage. | P1 | Done |
| Save chain | Saved to `pd-chains` in localStorage. Appears in sidebar. | P0 | Done |
| Demo chain | "Neural Network Evolution" pre-loaded with 5 papers. | P0 | Done |
| Share synthesis | WhatsApp / Email / Copy — key insight + evolution + gaps. | P1 | Done |

### 3.5 Eval Runner

| Feature | Description | Priority | Status |
|---|---|---|---|
| evaluateSummary() | paperText + summary → Claude judge → scores + missed_points + hallucinations | P0 | Built |
| runEvalSuite() | Array of papers → results[] with averages | P0 | Built |
| Eval Dashboard UI | Visual scorecard. Run live during demo. | P0 | Pending |
| eval-results.json | Output file for capstone report. | P1 | Pending |

---

## 4. Prompt Engineering

### 4.1 All Digest Prompts Start With

```
You must respond with ONLY a valid JSON object. No markdown. 
No backticks. No preamble. Start with { end with }. 
Do NOT ask for more information.
```

### 4.2 Figure Awareness Instruction (all modes)

```
Extract conclusions from Figure/Table captions and surrounding 
text. If paper says "Figure 3 shows X" — include X. 
Include key numbers from tables even if you cannot see the image.
```

### 4.3 Chain Prompt Critical Rules

- IMPORTANT prefix: "Generate JSON immediately. Do NOT ask for more information."
- Citation format: EXACTLY `[P1: 2021]` — no variations allowed
- Never make an uncited claim
- `buildPaperDescription()` uses all available fields: tldr, concept, oneliner, findings, key_advantage, abstract, keywords
- max_tokens: 1500 for chain synthesis

### 4.4 JSON Cleaning (useClaude.js)

```javascript
function cleanJSON(text) {
  let cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '')
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('No JSON found')
  return cleaned.slice(start, end + 1).trim()
}
```

---

## 5. Free Paper Sources

### 5.1 Allowed Sources

| Source | Usage |
|---|---|
| Semantic Scholar | Search only. 200M+ papers. No key required. |
| arXiv | Full PDF via Vercel proxy. `https://arxiv.org/pdf/{arxivId}` |
| PubMed Central | Full text via `/api/fetch-text?pmcid=` |

### 5.2 Removed Sources

- **Unpaywall** — removed. Third-party URLs unreliable, CORS issues.
- **Unknown domain PDFs** — removed. Security risk.

### 5.3 Paywalled Paper Handling

Show Google Scholar + Semantic Scholar links only. Amber badge: "No free full text available." Message: "Upload PDF manually via Digest tab if you have access."

---

## 6. Demo Neural Network Chain

### 6.1 Five Papers

| Paper | Title | Key Contribution | Contradiction With |
|---|---|---|---|
| P1 2012 | AlexNet | Depth + GPU = breakthrough image recognition | — |
| P2 2014 | Seq2Seq | Encoder-decoder LSTMs for variable-length sequences | — |
| P3 2015 | Bahdanau | Attention fixes fixed-vector bottleneck in Seq2Seq | P2: fixed vectors lose info |
| P4 2017 | Transformer | Attention replaces recurrence entirely | P2+P3: recurrence unnecessary |
| P5 2020 | GPT-3 | Scale alone produces few-shot generalization | P1–P4: task-specific training needed |

### 6.2 Expected Chain Output

- **Key Insight:** The field moved from task-specific architectures to scale-driven generalization — each paper removed one more constraint on what neural networks require.
- **Contradiction 1:** P2+P3 argue recurrence essential `[P2: 2014]` → P4 eliminates it entirely `[P4: 2017]`
- **Contradiction 2:** P1–P4 assume task-specific training needed → P5 shows scale removes this `[P5: 2020]`
- **Gap 1:** No paper addresses computational cost vs capability tradeoff at scale `[P4: 2017]` `[P5: 2020]`
- **Gap 2:** No paper studies emergent abilities below 10B parameters `[P5: 2020]`
- **Gap 3:** None address multimodal (vision + language) unified architectures `[P1: 2012]` `[P5: 2020]`

---

## 7. Evaluation Framework

> **v3.0 redesign** — the old 5-question generic checklist with YES/NO judge has been replaced with a reference-anchored, adversarial, semantically-grounded eval system. See section 0.7 for full architecture.

### 7.1 Summary Eval — LLM-as-Judge (Automated)

Judge endpoint: `POST /api/judge` with `{ evalType, payload: { prompt } }`
Model: claude-haiku-4-5 | Token budgets: 200–400 per eval type

**Dimension prompts:**

| evalType | Ground truth passed | What judge looks for |
|---|---|---|
| `faithfulness` | abstract + summary | List every claim NOT in abstract. Adversarial — finds specific unsupported statements |
| `coverage` | abstract + summary | State main contribution. Is it in the summary? Binary yes/no |
| `modeFidelity` | summary only | Mode-specific rules: TL;DR ≤3 sentences, ELI5 analogy + no jargon, Methodology has arch+train+eval |

**Free checks (zero LLM cost):**

| Check | Logic |
|---|---|
| Keyword Coverage | `keywords[]` from paper vs summary text — string match, returns % found |
| Number Preservation | Regex extracts ≥2-digit numbers from abstract, checks % in summary |
| Length Sanity | TL;DR only — summary word count < abstract word count? |

### 7.2 Chain Eval — Semantic Validation

| evalType | Input | What judge checks |
|---|---|---|
| `citationGrounding` | paper summary + claim with [Pn] chip | Does the paper actually support this specific claim? |
| `contradictionReality` | both paper summaries + stated contradiction | Do both papers genuinely take opposing positions? |
| `gapNovelty` | all paper summaries + gap | Is the gap genuinely unaddressed by any paper? |
| `synthesisQuality` | all paper summaries + keyInsight | Does insight go beyond any individual paper? |
| Citation Density (free) | evolution + agreements text | % of sentences with [Pn: year] chips |

### 7.3 Eval Storage

All eval results stored in Supabase `eval_results` table:
```
eval_results (id UUID, user_id UUID, eval_type TEXT,
  target_id UUID, target_title TEXT, results JSONB, created_at TIMESTAMPTZ)
```

Overview tab aggregates with `computeOverviewStats()` — shows avg per dimension, needs-attention list (overall < 70).

### 7.4 Capstone Eval Methodology Statement

> "We evaluate using a reference-anchored LLM-as-judge system. For summary eval, every dimension is grounded in the paper's abstract — the judge receives both the source and output and is prompted adversarially to find problems. For chain eval, citation grounding is semantic: we check whether the cited paper's summary actually supports the attributed claim. Scores are stored persistently in Supabase and aggregated across sessions. Score variance of ±10–15% across runs is expected due to LLM non-determinism; we report session averages."

### 7.5 Test Cases

| ID | Test |
|---|---|
| TC-01 | Search a paper with a known abstract → summarize → Run Eval → Faithfulness and Coverage should score |
| TC-02 | Same paper, all 4 modes → Mode Fidelity should differ per mode |
| TC-03 | Upload scanned/image PDF → must show clear error, not garbled output |
| TC-04 | Build demo chain (5 NN papers) → Run Chain Eval → Citation Grounding, Gap Novelty should score |
| TC-05 | Build chain with 3 papers, swap one → verify synthesis changes |
| TC-06 | Click 10 citation chips → each must scroll to correct card and highlight |
| TC-07 | Search "transformer models" → arXiv papers show Summarize, Nature papers show paywalled |
| TC-08 | Cold user test — give to classmate, observe without helping |
| TC-09 | Run Summary Eval → switch tabs → Overview should retain scores without reset |
| TC-10 | Run eval on paper with no abstract → Faithfulness/Coverage show N/A gracefully, Mode Fidelity still scores |

---

## 8. Capstone Presentation Guide

> **Positioning:** Do NOT pitch as "AI paper summarizer". Pitch as: *a research synthesis tool that builds a verifiable literature map from your own reading history — and tells you what nobody has studied yet.*

### 8.1 3-Minute Demo Script

1. Open app. Sidebar shows 5 pre-loaded Neural Network papers in My Downloads.
2. Click AlexNet → PaperView opens. Show structured breakdown with mechanics, results, figures.
3. Say: *"This is not a summary — it teaches you what the paper discovered and why it mattered."*
4. Check all 5 papers in sidebar → Build Chain bar appears at bottom.
5. Click Build Chain → Chain view opens → Synthesize → wait 10-15 seconds.
6. Show Key Insight card. Scroll to Contradictions — show P2 vs P4 card.
7. Click citation chip `[P4: 2017]` — scrolls to Transformer card, highlights blue.
8. Say: *"Every claim is traceable. This is not a black box."*
9. Show Research Gaps. Say: *"This tells researchers what to study next."*
10. Share → WhatsApp → show synthesis landing in chat.

### 8.2 Evaluator Q&A

| Question | Answer |
|---|---|
| "Scholarcy already does this" | Scholarcy summarizes single papers. It does not build cross-paper synthesis, identify research gaps, or provide a verifiable citation trail. The Chain feature is the product. |
| "What about paywalled papers?" | We support arXiv and PubMed Central — the two largest open access repositories. Paywalled papers show clear message and external links. Users can upload PDFs they have access to. |
| "Can you trust the AI synthesis?" | Every claim has a citation chip. Click it, scroll to source paper, verify the claim yourself. The Chain Eval system also semantically verifies citation grounding automatically. |
| "Why Supabase?" | All data — papers, chains, eval results, feedback — persists across devices and sessions. Supabase provides PostgreSQL + Auth with free tier sufficient for capstone scale. |
| "What did it cost to build?" | Zero subscription cost. API spend: under $1. Hosting: Vercel free tier. All paper sources: free APIs. |
| "What would you build next?" | Citation Formatter (APA/MLA/IEEE), Auto Literature Review Draft, Live Eval Dashboard. |

---

## 9. File Structure

```
src/
  App.jsx                    — two-panel layout, auth gate, all state
  App.css                    — CSS variables, animations
  main.jsx
  components/
    Digest.jsx               — PDF upload, mode selector, summary output, Q&A, share
    PaperSearch.jsx          — collapsible search panel, OpenAlex search, summarize flow
    Sidebar.jsx              — accordion: Summarized/Downloads/Chains/Quality
    PaperView.jsx            — split view (left: original, right: AI summary)
    ChainView.jsx            — timeline + synthesis + citation chips
    DevDashboard.jsx         — Eval Report (Overview/Summary Eval/Chain Eval)
    LibraryOverview.jsx      — default main area (stats + charts + suggestions)
    AddPaperModal.jsx        — modal (Upload PDF | Search | BibTeX tabs)
    SummaryPanel.jsx         — slide-in panel for search result summaries
    AuthPage.jsx             — email login + "Try Demo" button
    FeedbackWidget.jsx       — thumbs up/down on summaries
    InlineFact.jsx           — auto fact-check badge on summaries
    SuggestedReads.jsx       — suggested papers based on library keywords
    ImportBibTeX.jsx         — .bib file importer with S2 enrichment
  hooks/
    useAuth.js               — Supabase auth state
    useLibrary.js            — papers CRUD (Supabase) + seedDemoIfNeeded
    useChains.js             — chains CRUD (Supabase) + seedDemoChainIfNeeded
    useSuggestions.js        — daily recommendations cached in Supabase
    useEval.js               — NEW: runSummaryEval() + runChainEval() — primary eval hook
    useBackgroundEval.js     — REDESIGNED: fires 3s after summary, saves to Supabase
    useClaude.js             — callClaude() with JSON cleaning + error handling
    usePDF.js                — extractPDF() + fetchRemotePDF() + fetchRemoteText()
  prompts/
    digestPrompts.js         — tldr / full / eli5 / methodology prompt builders
    chainPrompt.js           — chainPrompt() with mandatory [P1: year] citations
    evalPrompts.js           — NEW: 7 eval prompts (faithfulness, coverage, modeFidelity,
                               citationGrounding, contradictionReality, gapNovelty, synthesisQuality)
  data/
    demoLibrary.js           — 5 Neural Network papers pre-loaded
  utils/
    freeChecks.js            — NEW: keywordCoverage, numberPreservation, lengthSanity,
                               citationDensity, extractCitationClaims, extractContradictionPairs
    evalStorage.js           — NEW: Supabase eval persistence + computeOverviewStats()
    sessionEval.js           — DEPRECATED: replaced by evalStorage.js
    recommendationEngine.js  — keyword + gap signal extraction
  lib/
    supabase.js              — Supabase client initialisation
api/
  claude.js                  — Anthropic API proxy (hides key from browser)
  judge.js                   — REDESIGNED: accepts evalType + token budget routing
  search.js                  — OpenAlex search proxy (no rate limits, no key needed)
  arxiv.js                   — arXiv abstract fetch proxy (CORS bypass)
  fetch-pdf.js               — Vercel serverless: CORS proxy for arXiv PDFs
  fetch-text.js              — Vercel serverless: PMC full text fetcher
CLAUDE.md                    — Claude Code project context
vercel.json                  — serverless function config
.env.example                 — ANTHROPIC_API_KEY, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
```

---

## 10. Post-Capstone Roadmap

### Immediate (< 2hrs each)

| Feature | Description | Effort |
|---|---|---|
| Citation Formatter | APA/MLA/IEEE/Chicago for any paper. One click copy. Prompt only. | 30min |
| Bias Detector | Flag small samples, single-country, self-reported data in methodology mode. | 1hr |
| Paper vs Paper Debate | Select 2 papers → structured AI debate. Most memorable demo feature. | 2hrs |
| Copy as Markdown | Export summary or chain as Markdown for Notion/Obsidian. | 30min |
| Star papers | Float starred papers to top of section. | 45min |
| Dark mode | CSS variable swap. Researchers read at night. | 1hr |

### Production Upgrade Path

- Move Anthropic key to backend — never expose in browser (currently server-side via Vercel serverless)
- Auto Literature Review Draft — select 5+ papers → generate academic literature review
- Knowledge Graph — D3.js visualization of paper relationships
- Multilingual summary — Hindi, Spanish, French, Arabic (Claude native)
- Reading Dashboard — papers per week chart, topic distribution, complexity breakdown

---

*Paper Digester PRD v3.0 — Built with Claude Code | Eval System Redesigned June 2026*
