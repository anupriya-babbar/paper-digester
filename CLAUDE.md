# Paper Digester

AI research synthesis capstone — React 18 + Vite, zero backend.

## Commands
- `npm run dev` — start dev server at http://localhost:5173
- `npm run build` — production build
- `npm run preview` — preview production build

## Setup
Copy `.env.example` to `.env` and add your Anthropic API key:
```
VITE_ANTHROPIC_API_KEY=sk-ant-...
```

## Architecture
- No backend. All state in `localStorage` under key `pd-library`.
- Claude API called directly from browser via `@anthropic-ai/sdk` with `dangerouslyAllowBrowser: true`.
- PDF text extraction: `pdfjs-dist` with CDN worker (v3.11.174, cloudflare).
- Model: `claude-sonnet-4-6`, max_tokens: 1200.

## Key files
| File | Role |
|------|------|
| `src/App.jsx` | Tab nav, library state, routing |
| `src/components/Digest.jsx` | PDF upload, mode select, analysis, Q&A |
| `src/components/Library.jsx` | Saved papers, chain selection |
| `src/components/Chain.jsx` | Timeline, synthesis, citation chips |
| `src/components/CitationChip.jsx` | Blue pill [P1: year] → scroll to card |
| `src/hooks/usePDF.js` | extractPDF(file) → {text, pages} |
| `src/hooks/useClaude.js` | callClaude(prompt, maxTokens) → string |
| `src/prompts/digestPrompts.js` | 4 prompt builders (tldr/full/eli5/methodology) |
| `src/prompts/chainPrompt.js` | chainPrompt(papers, name) → string |
| `src/eval/evalRunner.js` | Node.js eval script (not a browser module) |

## Eval runner
`src/eval/evalRunner.js` is a standalone Node.js script.
Run it with `node src/eval/evalRunner.js` (uses `ANTHROPIC_API_KEY`, not the VITE_ one).
Results are appended to `eval-results.json`.
