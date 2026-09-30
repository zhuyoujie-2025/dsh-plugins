// @local/dsh-deepseek-web-bridge — DSH host plugin.
//
// What it does:
//   Registers 3 webserver routes on DSH's main webserver that reverse-proxy
//   to a local ds-free-api (NIyueeE/ds-free-api) on 127.0.0.1:22217.
//
//   Routes (relative to DSH root, e.g. http://127.0.0.1:3080):
//     GET  /v1/models                          — proxies to ds-free-api
//     POST /v1/chat/completions               — proxies (streamed SSE)
//     GET  /deepseek-webfree/health           — direct connection check
//
//   Auth: pass-through. Use sk-... key created in ds-free-api management UI
//   (or static [[api_keys]] in ds-free-api config.toml).
//
// Why this shape (vs dsh-llm-webfree bundle):
//   - No class with `baseURL` private field at all (no example for cordis
//     load-time enumeration to trip on).
//   - Not loaded via cordis-plugin-include (no bundle manifest entry). DSH
//     loads it via loader.create(name) directly, sidestepping the bundle
//     loader chain that was wiping client plugins.
//   - All configuration is plain `const` strings, not constructor fields.

import { appendFileSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  LlmError,
  ReasoningEffortId,
  resolveRetryPolicy,
} from '@deepseek-ai/dsh-llm'

const UPSTREAM_PORT = 22217
// 2026-08-22 fix (main-secondary swap fallout): the bridge now runs inside the
// WSL main, where 127.0.0.1:22217 no longer reaches ds-free-api listening on
// the Windows TCP stack. Resolve the Windows host from the WSL default route
// (/proc/net/route gateway); on Windows itself /proc/net/route does not exist
// and we fall back to loopback. Override with $DSH_DSFREE_UPSTREAM.
function resolveUpstreamBase() {
  if (process.env.DSH_DSFREE_UPSTREAM) return process.env.DSH_DSFREE_UPSTREAM
  try {
    const route = readFileSync('/proc/net/route', 'utf8')
    const line = route.split('\n').find((l) => l.includes('\t00000000\t'))
    if (line) {
      const gwHex = line.trim().split('\t')[2]
      // 校验 8 位十六进制网关，避免 parseInt 产生 NaN 拼出 http://NaN... 上游必挂
      if (/^[0-9a-f]{8}$/i.test(gwHex || '')) {
        const ip = [3, 2, 1, 0].map((i) => parseInt(gwHex.slice(i * 2, i * 2 + 2), 16)).join('.')
        if (ip && ip !== '0.0.0.0') return `http://${ip}:${UPSTREAM_PORT}`
      }
    }
  } catch { /* not on Linux (or no default route): use loopback */ }
  return `http://127.0.0.1:${UPSTREAM_PORT}`
}
const UPSTREAM_BASE = resolveUpstreamBase()
// key goes in $DSH_DSFREE_UPSTREAM_KEY (or pass-through Authorization header).
// Never hard-code a real upstream key here — this file is public.
const UPSTREAM_KEY = process.env.DSH_DSFREE_UPSTREAM_KEY || ''
// 2026-08-22 fix: derive paths from this module's own location instead of
// hard-coding a Windows drive letter. The plugin directory is shared by the
// WSL main (where "C:/..." does not resolve; readFileSync threw ENOENT and
// /deepseek-webfree/sha3_wasm_bg.wasm answered 500 "WASM unavailable",
// which blocks ds-free-api startup) and the Windows secondary.
// Ref ops-guide: 不要把 Windows 盘符路径硬编码进跨平台插件。
// this file lives in <pluginRoot>/src/, so the plugin root is one level up.
const PLUGIN_ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const LOG_PATH = join(PLUGIN_ROOT, 'bridge.log')
const WASM_PATH = join(PLUGIN_ROOT, 'sha3_wasm_bg.7b9ca65ddd.wasm')

function log(msg) {
  try {
    appendFileSync(LOG_PATH, `[${new Date().toISOString()}] ${msg}\n`)
  } catch {}
}

const WEBFREE_MODELS = new Set(['deepseek-default', 'deepseek-expert'])
// DSH UI exposes a six-step reasoning slider. Per user request, only "off" turns
// thinking off; every other notch (low/medium/high/max/ultra) opens DeepSeek
// Web's "深度思考" toggle. ds-free-api v0.2.6 accepts a `thinking: { type:'enabled' }`
// body field for either `deepseek-default` or `deepseek-expert`; sending it for
// default mode forces the Web frontend to enable its reasoning panel.
const ON_EFFORTS = new Set(['low', 'medium', 'high', 'max', 'ultra'])

function normalizeWebfreeRequestBody(body) {
  const payload = JSON.parse(body)
  if (!WEBFREE_MODELS.has(payload.model)) return body

  // DSH emits bare tool objects ({name, description, parameters}); ds-free-api
  // parses the strict OpenAI shape and requires each entry's `type` field.
  // Wrap them as {"type":"function","function":{...}} or the request 400s with
  // "missing field `type`".
  if (Array.isArray(payload.tools)) {
    payload.tools = payload.tools.map((t) =>
      t && t.type === 'function'
        ? t
        : {
            type: 'function',
            function: {
              name: t.name,
              description: t.description,
              parameters: t.parameters ?? t.input_schema ?? t.inputSchema,
            },
          },
    )
  }

  const effort = String(payload.reasoning_effort ?? '').toLowerCase()
  if (effort === 'off' || effort === 'none') {
    // Explicit "off" — strip any thinking field ds-llm might inject.
    delete payload.thinking
    payload.reasoning_effort = 'none'
  } else if (ON_EFFORTS.has(effort)) {
    // Any other notch → DeepSeek Web "深度思考" enabled.
    payload.thinking = { type: 'enabled' }
    payload.reasoning_effort = 'high'
  } else {
    payload.reasoning_effort = 'none'
  }
  return JSON.stringify(payload)
}

export const name = 'dsh-deepseek-web-bridge'
export const inject = ['webServer', 'llm']

/* ------------------------------------------------------------------------ */
/* LLM adapter                                                             */
/* ------------------------------------------------------------------------ */
// Function-object adapter (deliberately NOT a `class extends LlmAdapter`
// — class-shape prototypes triggered the cordis-plugin-include baseURL cache
// bug). DSH requires these methods: providerInfo / providerRetryPolicy /
// listModels / resolveModel / stream. See docs/user/develop/practice/llm-adapter.md.

function makeWebfreeAdapter() {
  return {
    providerInfo(provider) {
      if (provider !== 'deepseek-webfree') {
        throw new LlmError(
          `dsh-deepseek-web-bridge only handles provider 'deepseek-webfree', not '${provider}'`,
          'INVALID_ADAPTER',
        )
      }
      return {
        id: 'deepseek-webfree',
        name: 'DeepSeek Web Free (via ds-free-api)',
      }
    },

    providerRetryPolicy(provider) {
      return resolveRetryPolicy(
        {
          mode: 'normal',
          maxRetries: 2,
          retryableCodes: ['TRANSPORT', 'STREAM_CLOSED', 'RATE_LIMIT'],
          backoff: { initialDelayMs: 800, maxDelayMs: 8000, jitterRatio: 0.2 },
        },
        'dsh-deepseek-web-bridge',
      )
    },

    listModels(provider) {
      return [
        {
          provider: 'deepseek-webfree',
          id: 'deepseek-default',
          name: 'DeepSeek WebFree 快速 (deepseek-webfree)',
          description: 'Chat-deepseek.com 快速模式 (default). Off 默认关闭深度思考.',
          inputModalities: ['text'],
        },
        {
          provider: 'deepseek-webfree',
          id: 'deepseek-expert',
          name: 'DeepSeek WebFree 专家 (deepseek-webfree)',
          description: 'Chat-deepseek.com 专家模式 (expert). Off 默认关闭深度思考.',
          inputModalities: ['text'],
        },
      ]
    },

    resolveModel(provider, model, _signal) {
      const id = model
      const isRecognized = WEBFREE_MODELS.has(id)
      const displayName = isRecognized
        ? id === 'deepseek-expert'
          ? 'DeepSeek WebFree 专家 (deepseek-webfree)'
          : 'DeepSeek WebFree 快速 (deepseek-webfree)'
        : id
      // Per user spec: the six-step slider stays visible; "off" closes reasoning,
      // every other notch (low/medium/high/max/ultra) opens DeepSeek Web 深度思考.
      // normalizeWebfreeRequestBody() maps these wire values to the `thinking` field.
      const reasoning = {
        efforts: [
          { id: ReasoningEffortId('off'), name: 'off' },
          { id: ReasoningEffortId('low'), name: 'low (= on)' },
          { id: ReasoningEffortId('medium'), name: 'medium (= on)' },
          { id: ReasoningEffortId('high'), name: 'high (= on)' },
          { id: ReasoningEffortId('max'), name: 'max (= on)' },
          { id: ReasoningEffortId('ultra'), name: 'ultra (= on)' },
        ],
        defaultEffort: ReasoningEffortId('off'),
      }
      return Promise.resolve({
        provider,
        id,
        name: displayName,
        context: { contextWindow: 128_000 },
        defaultMaxTokens: 4096,
        inputModalities: ['text'],
        ...(isRecognized ? { reasoning } : {}),
      })
    },

    async *stream(options) {
      if (options.provider !== 'deepseek-webfree') {
        throw new LlmError(
          `dsh-deepseek-web-bridge: provider '${options.provider}' expected 'deepseek-webfree'`,
          'INVALID_ADAPTER',
        )
      }

      // Build request body mirroring the OpenAI Chat Completions shape, then
      // map our reasoning_effort → DeepSeek Web `thinking` toggle.
      const body = JSON.stringify({
        model: options.model,
        messages: options.messages,
        ...(options.system ? { system: options.system } : {}),
        ...(options.tools ? { tools: options.tools } : {}),
        ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
        ...(options.maxTokens !== undefined ? { max_tokens: options.maxTokens } : {}),
        ...(options.stop ? { stop: options.stop } : {}),
        // Slider selection reaches the wire: off → thinking off, any other notch → on.
        ...(options.reasoningEffort !== undefined && options.reasoningEffort !== null
          ? { reasoning_effort: String(options.reasoningEffort) }
          : {}),
        stream: true,
        stream_options: { include_usage: true },
      })
      const requestBody = normalizeWebfreeRequestBody(body)

      const url = `${UPSTREAM_BASE}/v1/chat/completions`
      let response
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${UPSTREAM_KEY}`,
            'Content-Type': 'application/json',
          },
          body: requestBody,
          signal: options.signal,
        })
      } catch (e) {
        if (options.signal?.aborted) throw e
        throw new LlmError(`upstream unreachable at ${url}`, 'TRANSPORT', { cause: e })
      }

      if (!response.ok) {
        let message = `HTTP ${response.status}`
        try {
          const err = await response.json()
          if (err?.error?.message) message = err.error.message
        } catch {}
        throw new LlmError(
          `ds-free-api returned ${message}`,
          response.status === 401 || response.status === 403
            ? 'AUTH'
            : response.status === 429
            ? 'RATE_LIMIT'
            : 'PROVIDER_HTTP_ERROR',
          { status: response.status },
        )
      }
      if (!response.body) {
        throw new LlmError('ds-free-api returned no response body', 'EMPTY_RESPONSE')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let lineBuffer = ''
      let textBlockStarted = false
      let reasoningBlockStarted = false
      let textBuffer = ''
      let reasoningBuffer = ''
      let sawDone = false
      let usage = null
      let finishReason = null
      let lastFinishValue = null

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          lineBuffer += decoder.decode(value, { stream: true })
          const lines = lineBuffer.split(/\r?\n/)
          lineBuffer = lines.pop() || ''
          for (const line of lines) {
            if (!line.startsWith('data:')) continue
            const data = line.slice(5).trim()
            if (data === '[DONE]') { sawDone = true; continue }
            let chunk
            try { chunk = JSON.parse(data) } catch { continue }
            if (chunk.usage) {
              const prompt = Number(chunk.usage.prompt_tokens ?? 0) || 0
              const cached = Number(chunk.usage.cached_tokens ?? 0) || 0
              const completion = Number(chunk.usage.completion_tokens ?? 0) || 0
              const reasoningT = Number(chunk.usage.reasoning_tokens ?? 0) || 0
              // dsh session events must be losslessly JSON-serializable: an own
              // property holding `undefined` is rejected outright, so only set
              // optional token counts when they carry a value.
              usage = {
                inputTokens: Math.max(0, prompt - cached),
                outputTokens: completion,
              }
              if (cached > 0) usage.cacheReadTokens = cached
              if (reasoningT > 0) usage.reasoningTokens = reasoningT
            }
            const choice = chunk.choices?.[0]
            if (!choice) continue
            const delta = choice.delta
            if (delta?.reasoning_content) {
              const r = String(delta.reasoning_content)
              if (r.length > 0) {
                if (!reasoningBlockStarted) {
                  reasoningBlockStarted = true
                  yield { type: 'block-start', index: 0, blockType: 'reasoning' }
                }
                reasoningBuffer += r
                yield { type: 'reasoning-delta', index: 0, text: r }
              }
            }
            if (delta?.content) {
              const c = String(delta.content)
              if (c.length > 0) {
                if (!textBlockStarted) {
                  textBlockStarted = true
                  yield { type: 'block-start', index: 1, blockType: 'text' }
                }
                textBuffer += c
                yield { type: 'text-delta', index: 1, text: c }
              }
            }
            if (choice.finish_reason) {
              lastFinishValue = String(choice.finish_reason)
            }
          }
        }
      } finally {
        try { reader.releaseLock() } catch {}
      }

      if (textBlockStarted) {
        yield { type: 'block-end', index: 1, block: { type: 'text', text: textBuffer } }
      }
      if (reasoningBlockStarted) {
        yield { type: 'block-end', index: 0, block: { type: 'reasoning', text: reasoningBuffer } }
      }
      if (usage) {
        yield { type: 'usage', usage }
      }
      const reason = lastFinishValue === 'length' || lastFinishValue === 'max_tokens'
        ? { kind: 'max-tokens' }
        : lastFinishValue === 'tool_calls' || lastFinishValue === 'function_call'
        ? { kind: 'tool-calls' }
        : { kind: 'stop' }
      yield { type: 'finish', reason }
    },
  }
}
const adapter = makeWebfreeAdapter()

export function apply(ctx) {
  const webServer = ctx.get('webServer')
  log('apply entered, webServer=' + (webServer ? 'ok' : 'MISSING'))

  // Register an LLM adapter so DSH's model selector surfaces
  // "deepseek-webfree / deepseek-default" and "deepseek-webfree / deepseek-expert"
  // without the user manually adding a Custom OpenAI endpoint.
  const llm = ctx.get('llm')
  if (llm) {
    llm.registerAdapter(['deepseek-webfree'], adapter)
    log('llm provider registered: deepseek-webfree (deepseek-default, deepseek-expert)')
  } else {
    log('llm service missing — adapter NOT registered')
  }

  // Local copy of DeepSeek's PoW module. ds-free-api v0.2.7-pre1 downloads
  // wasm_url during startup; serving it here avoids an upstream WAF/TLS race.
  webServer.register({
    kind: 'exact',
    path: '/deepseek-webfree/sha3_wasm_bg.wasm',
    handler: async (req, res) => {
      try {
        const wasm = readFileSync(WASM_PATH)
        res.writeHead(200, {
          'Content-Type': 'application/wasm',
          'Content-Length': wasm.length,
          'Cache-Control': 'public, max-age=86400',
        })
        res.end(wasm)
      } catch (e) {
        log(`/deepseek-webfree/sha3_wasm_bg.wasm fail: ${e?.message || e}`)
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('WASM unavailable')
      }
    },
  })

  // GET /v1/models
  webServer.register({
    kind: 'exact',
    path: '/v1/models',
    handler: async (req, res) => {
      try {
        const r = await fetch(`${UPSTREAM_BASE}/v1/models`, {
          headers: { Authorization: `Bearer ${UPSTREAM_KEY}` },
        })
        const text = await r.text()
        // 不加 CORS 头：本桥信任 DSH 主 webserver 的 127.0.0.1 绑定，跨域 JS 读不到响应，
        // 防止任意网页在浏览器里打 /v1/* 白嫖用户的 DeepSeek 网页凭据。
        res.writeHead(r.status, { 'Content-Type': 'application/json' })
        res.end(text)
      } catch (e) {
        log(`/v1/models fail: ${e?.message || e}`)
        res.writeHead(502, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: { message: 'upstream unreachable', detail: String(e?.message || e) } }))
      }
    },
  })

  // POST /v1/chat/completions (streamed SSE pass-through)
  webServer.register({
    kind: 'exact',
    path: '/v1/chat/completions',
    handler: async (req, res) => {
      try {
        let body = ''
        for await (const chunk of req) {
          body += chunk
          if (body.length > 16 * 1024 * 1024) {
            res.writeHead(413, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: { message: 'request body too large' } }))
            return
          }
        }
        try {
          body = normalizeWebfreeRequestBody(body)
        } catch (e) {
          // JSON 解析错误是调用方的问题，别误报成 upstream unreachable
          log(`/v1/chat/completions bad request body: ${e?.message || e}`)
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: { message: 'invalid JSON request body', detail: String(e?.message || e) } }))
          return
        }
        const r = await fetch(`${UPSTREAM_BASE}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${UPSTREAM_KEY}`,
            'Content-Type': 'application/json',
          },
          body,
        })
        const ct = r.headers.get('content-type') || 'application/json'
        res.writeHead(r.status, {
          'Content-Type': ct,
          'Cache-Control': 'no-cache',
        })
        if (r.body) {
          const reader = r.body.getReader()
          const decoder = new TextDecoder()
          let lineBuffer = ''
          let sawDone = false
          let sawCanonicalFinish = false
          let lastChunkMeta = null
          // 客户端断开就取消上游流，避免继续白拉数据
          req.on('close', () => { try { reader.cancel('client disconnected') } catch {} })

          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            res.write(Buffer.from(value))

            // Track complete SSE lines without delaying their pass-through.
            // ds-free-api may put finish_reason on a content-bearing chunk and
            // close the connection without [DONE], which DSH treats as a retry.
            lineBuffer += decoder.decode(value, { stream: true })
            const lines = lineBuffer.split(/\r?\n/)
            lineBuffer = lines.pop() || ''
            for (const line of lines) {
              if (!line.startsWith('data:')) continue
              const data = line.slice(5).trim()
              if (data === '[DONE]') {
                sawDone = true
                continue
              }
              try {
                const chunk = JSON.parse(data)
                lastChunkMeta = {
                  id: chunk.id,
                  created: chunk.created,
                  model: chunk.model,
                }
                const choice = chunk.choices?.[0]
                if (choice?.finish_reason && !choice?.delta?.content) {
                  sawCanonicalFinish = true
                }
              } catch {}
            }
          }

          lineBuffer += decoder.decode()
          if (lineBuffer.startsWith('data:')) {
            const data = lineBuffer.slice(5).trim()
            if (data === '[DONE]') sawDone = true
            else {
              try {
                const chunk = JSON.parse(data)
                lastChunkMeta = {
                  id: chunk.id,
                  created: chunk.created,
                  model: chunk.model,
                }
                const choice = chunk.choices?.[0]
                if (choice?.finish_reason && !choice?.delta?.content) {
                  sawCanonicalFinish = true
                }
              } catch {}
            }
          }

          if (!sawCanonicalFinish) {
            const finishChunk = {
              id: lastChunkMeta?.id || `chatcmpl-${Date.now()}`,
              object: 'chat.completion.chunk',
              created: lastChunkMeta?.created || Math.floor(Date.now() / 1000),
              model: lastChunkMeta?.model || 'deepseek-default',
              choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
            }
            res.write(`data: ${JSON.stringify(finishChunk)}\n\n`)
          }
          if (!sawDone) res.write('data: [DONE]\n\n')
        }
        res.end()
      } catch (e) {
        log(`/v1/chat/completions fail: ${e?.message || e}`)
        try {
          if (res.headersSent) { res.end() } else {
            res.writeHead(502, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: { message: 'upstream unreachable', detail: String(e?.message || e) } }))
          }
        } catch {}
      }
    },
  })

  // GET /deepseek-webfree/health — direct reachable check
  webServer.register({
    kind: 'exact',
    path: '/deepseek-webfree/health',
    handler: async (req, res) => {
      try {
        const r = await fetch(`${UPSTREAM_BASE}/health`, {
          signal: AbortSignal.timeout(5000),
        })
        const upstream = await r.text()
        res.writeHead(r.status, { 'Content-Type': 'application/json' })
        // 不回显 upstream_url（内网拓扑）也不加 CORS 头
        res.end(JSON.stringify({
          bridge: 'ok',
          upstream_status: r.status,
          upstream_body: upstream,
        }))
      } catch (e) {
        res.writeHead(502, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          bridge: 'ok',
          upstream_reachable: false,
          error: String(e?.message || e),
        }))
      }
    },
  })

  log('routes registered: /v1/models, /v1/chat/completions, /deepseek-webfree/health, /deepseek-webfree/sha3_wasm_bg.wasm')
  log('apply finished')
}
