import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import https from 'node:https'
import http from 'node:http'

function proxyRequest(targetUrl, res, depth = 0) {
  if (depth > 6) { res.statusCode = 500; res.end('Too many redirects'); return }
  let parsed
  try { parsed = new URL(targetUrl) } catch { res.statusCode = 400; res.end('Invalid URL'); return }
  const client = parsed.protocol === 'https:' ? https : http
  const opts = {
    hostname: parsed.hostname,
    port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
    path: parsed.pathname + parsed.search,
    headers: { 'User-Agent': 'PaperDigester/1.0' },
  }
  const req = client.get(opts, (upstream) => {
    if ([301, 302, 303, 307, 308].includes(upstream.statusCode) && upstream.headers.location) {
      upstream.resume()
      const loc = upstream.headers.location
      const next = loc.startsWith('http') ? loc : new URL(loc, targetUrl).href
      proxyRequest(next, res, depth + 1)
      return
    }
    res.statusCode = upstream.statusCode || 200
    res.setHeader('Content-Type', upstream.headers['content-type'] || 'application/octet-stream')
    res.setHeader('Access-Control-Allow-Origin', '*')
    upstream.pipe(res)
  })
  req.on('error', (e) => { res.statusCode = 502; res.end(e.message) })
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'paper-digester-proxy',
      configureServer(server) {
        // /api/fetch-pdf?url=<encodedArxivPdfUrl>
        server.middlewares.use('/api/fetch-pdf', (req, res) => {
          const url = new URL(`http://localhost${req.url}`).searchParams.get('url')
          if (!url) { res.statusCode = 400; res.end('Missing url param'); return }
          proxyRequest(url, res)
        })

        // /api/fetch-text?pmcid=<pmcId>
        server.middlewares.use('/api/fetch-text', (req, res) => {
          const pmcId = new URL(`http://localhost${req.url}`).searchParams.get('pmcid')
          if (!pmcId) { res.statusCode = 400; res.end('Missing pmcid param'); return }
          const url = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pmc&id=${pmcId}&rettype=text&retmode=text`
          proxyRequest(url, res)
        })
      },
    },
  ],
  optimizeDeps: {
    include: ['pdfjs-dist'],
  },
})
