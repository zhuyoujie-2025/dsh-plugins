#!/usr/bin/env node
// extract-cookies.mjs — Pull `chat.deepseek.com` cookies out of a logged-in
// Chrome via the DevTools Protocol and emit them as both:
//   1. raw JSON (`-o cookies.json`)        — ds-free-api compatible array
//   2. env-var form (`-o cookies.env`)      — sets DSH_LLM_WEBFREE_COOKIE
//
// USAGE
//   1. Launch Chrome with remote debugging enabled and the profile that has
//      chat.deepseek.com logged in:
//        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" \
//          --remote-debugging-port=9222 \
//          --remote-allow-origins=* \
//          "https://chat.deepseek.com"
//      (do NOT add `--user-data-dir` if you already have one; just reuse it.)
//   2. Confirm chat.deepseek.com is logged in (test by opening that tab).
//   3. Run:
//        node tools/extract-cookies.mjs -o ../cookies.json
//
// The script does NOT steal accounts or bypass anything — it just reads
// cookies from your own logged-in browser. ds-free-api then reuses them.

import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { argv, exit } from 'node:process'

const HOST = process.env['DSH_WEBFREE_CHROME_HOST'] || '127.0.0.1'
const PORT = Number(process.env['DSH_WEBFREE_CHROME_PORT'] || 9222)
const ORIGIN = 'https://chat.deepseek.com'

function parseArgs() {
  const out = { out: '', json: true }
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '-o' || a === '--out') out.out = argv[++i] || ''
    else if (a === '--env') out.json = false
    else if (a === '-h' || a === '--help') {
      console.log('Usage: extract-cookies [-o <file>] [--env]')
      console.log('  -o <file>   write to file (default: stdout)')
      console.log('  --env       emit as DSH_LLM_WEBFREE_COOKIE="..."  env line')
      exit(0)
    }
  }
  return out
}

async function main() {
  const args = parseArgs()
  const versionUrl = `http://${HOST}:${PORT}/json/version`
  const tabsEndpoint = `http://${HOST}:${PORT}/json`
  // suppress the ORIGIN constant lint for now (kept for documentation)
  void ORIGIN

  process.stderr.write(`[extract-cookies] connecting to ${HOST}:${PORT}…\n`)
  const vResp = await fetch(versionUrl)
  if (!vResp.ok) {
    console.error(`[extract-cookies] cannot reach chrome devtools at ${versionUrl}: HTTP ${vResp.status}`)
    console.error('  hint: launch chrome with --remote-debugging-port=9222 and an allow-origins flag.')
    process.exit(1)
  }
  process.stderr.write(`[extract-cookies] chrome reachable: ${vResp.headers.get('content-type')}\n`)

  const tabs = await (await fetch(tabsEndpoint)).json()
  if (!Array.isArray(tabs) || tabs.length === 0) {
    console.error('[extract-cookies] no open tabs found')
    process.exit(1)
  }
  const candidates = tabs.filter((t) => typeof t.webSocketDebuggerUrl === 'string')
  if (candidates.length === 0) {
    console.error('[extract-cookies] no tabs expose a websocket URL (did you launch chrome with --remote-allow-origins=*?)')
    process.exit(1)
  }

  const preferred =
    candidates.find((t) => typeof t.url === 'string' && t.url.includes('chat.deepseek.com')) ||
    candidates.find((t) => typeof t.url === 'string' && t.url.startsWith('https://')) ||
    candidates[0]

  process.stderr.write(`[extract-cookies] using tab: ${preferred.title || '(no title)'} — ${preferred.url || preferred.type}\n`)

  const wsMod = await import('ws').catch(() => null)
  if (!wsMod) {
    console.error('[extract-cookies] missing "ws" package — run: pnpm i -D ws')
    process.exit(1)
  }
  const WebSocketImpl = wsMod.WebSocket ?? wsMod.default ?? wsMod

  await new Promise((resolveWs, rejectWs) => {
    let nextId = 1
    const pending = new Map()
    const sock = new WebSocketImpl(preferred.webSocketDebuggerUrl)
    sock.on('open', () => {
      const send = (method, params = {}) => {
        const id = nextId++
        sock.send(JSON.stringify({ id, method, params }))
        return new Promise((res, rej) => pending.set(id, { res, rej }))
      }
      send('Network.enable')
        .then(() => send('Network.getAllCookies'))
        .then((r) => {
          const all = (r?.result?.cookies || []).filter(
            (c) => c.domain && c.domain.endsWith('deepseek.com'),
          )
          if (all.length === 0) {
            console.error('[extract-cookies] no chat.deepseek.com cookies found — open that tab once and retry')
            process.exit(2)
          }
          const cookieHeader = all
            .map((c) => `${c.name}=${c.value}`)
            .join('; ')
          const payload = args.json
            ? JSON.stringify(
                all.map((c) => ({
                  name: c.name,
                  value: c.value,
                  domain: c.domain,
                  path: c.path,
                  expires: c.expires,
                  httpOnly: c.httpOnly,
                  secure: c.secure,
                  sameSite: c.sameSite,
                })),
                null,
                2,
              )
            : `DSH_LLM_WEBFREE_COOKIE="${cookieHeader.replace(/"/g, '\\"')}"\n`

          if (args.out) {
            const filePath = resolve(args.out)
            writeFileSync(filePath, payload, 'utf8')
            console.error(`[extract-cookies] wrote ${all.length} cookies to ${filePath}`)
          } else {
            process.stdout.write(payload)
          }
          try {
            sock.close()
          } catch {}
          resolveWs()
        })
        .catch((e) => {
          console.error('[extract-cookies] CDP error:', e?.message || e)
          try {
            sock.close()
          } catch {}
          rejectWs(e)
        })
    })
    sock.on('message', (raw) => {
      const msg = JSON.parse(raw.toString())
      if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id)
        pending.delete(msg.id)
        if (msg.error) rej(msg.error)
        else res(msg)
      }
    })
    sock.on('error', (e) => rejectWs(e))
  })
}

main().catch((e) => {
  console.error('[extract-cookies] fatal:', e?.stack || e?.message || e)
  process.exit(1)
})
