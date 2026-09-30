/**
 * @dsh-external/dsh-debugger — DSH 沙箱调试器工具包。
 *
 * 提供 4 个工具，让 agent 能在沙箱中诊断和调试 DSH 自身问题：
 *   debug_scan_errors     — 扫描所有会话日志，提取错误/失败事件
 *   debug_health_check    — 全链路健康检查（端口/插件 fiber/LLM 提供商/会话存储）
 *   debug_session_inspect — 读取指定会话的事件流（支持 zstd 多帧解压）
 *   debug_replay_context  — 提取某轮失败对话的上下文摘要，供隔离子代理重放
 *
 * ⚠️ 健康检查铁律（2026-08-18 修复自死锁 bug）：
 *   debug_health_check 运行在 DSH 进程内，不能用自己的 httpRequest 打自己的端口——
 *   agent loop 等工具返回 → 工具等 HTTP 响应 → HTTP 服务器等 agent loop 空闲 → 死锁 → timeout。
 *   端口检查改用 TCP net.connect（只查端口是否在监听，不发 HTTP 请求）；
 *   providerHealth 改为直接读 ~/.dsh/provider-health.json 文件。
 *
 * 会话文件格式：~/.dsh/sessions/<workspace-dir>/<session-id>/session.jsonl.zstd
 *   多帧 zstd 容器（每批事件一个独立帧），需逐帧扫描+解压再拼接 JSONL。
 *   帧扫描逻辑移植自 dsh-session-persistence-jsonl/src/zstd.ts (scanZstdFrames)。
 *
 * 规范：资源注册必须挂 ctx.effect（热重载/卸载自动清理——注入器踩坑记录）。
 */
import type { Context } from 'cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import z from 'schemastery'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, basename } from 'node:path'
import { homedir } from 'node:os'
import { zstdDecompressSync } from 'node:zlib'
import { connect as netConnect } from 'node:net'

export const name = "@dsh-external/dsh-debugger"
export const inject = ['tools']

export interface Config {
  greeting: string
  /** debug_health_check 要探测的 TCP 端口列表（label 仅用于报告展示） */
  healthPorts: { label: string; port: number }[]
}

export const Config = z.object({
  greeting: z.string().default('你好'),
  healthPorts: z.array(z.object({ label: z.string(), port: z.number() })).default([{ label: 'dsh-web', port: 3080 }]),
})

// ── zstd 多帧扫描（移植自 dsh 源码 scanZstdFrames）──────────────────────────

const ZSTD_MAGIC = 0xfd2fb528

/**
 * 扫描 concatenated zstd 帧流，返回每个完整帧的 [start,end) 字节范围。
 * EOF 截断的末帧被跳过（torn frame）。
 */
function scanZstdFrames(buffer: Buffer): { start: number, end: number }[] {
  const frames: { start: number, end: number }[] = []
  let offset = 0
  while (offset < buffer.length) {
    const start = offset
    if (buffer.length - offset < 4) break
    if (buffer.readUInt32LE(offset) !== ZSTD_MAGIC) break
    offset += 4
    if (offset === buffer.length) break
    const descriptor = buffer.readUInt8(offset)
    offset += 1
    if ((descriptor & 0x18) !== 0) break
    const contentSizeFlag = descriptor >>> 6
    const singleSegment = (descriptor & 0x20) !== 0
    const checksum = (descriptor & 0x04) !== 0
    const dictionaryFlag = descriptor & 0x03
    const dictionaryBytes = dictionaryFlag === 3 ? 4 : dictionaryFlag
    const contentSizeBytes = contentSizeFlag === 0 ? (singleSegment ? 1 : 0) : 1 << contentSizeFlag
    const remainingHeaderBytes = (singleSegment ? 0 : 1) + dictionaryBytes + contentSizeBytes
    if (buffer.length - offset < remainingHeaderBytes) break
    offset += remainingHeaderBytes
    let lastBlock = false
    while (!lastBlock) {
      if (buffer.length - offset < 3) { offset = start; lastBlock = true; break }
      const blockHeader = buffer.readUIntLE(offset, 3)
      offset += 3
      lastBlock = (blockHeader & 1) !== 0
      const blockType = (blockHeader >>> 1) & 0x03
      const blockSize = blockHeader >>> 3
      if (blockType === 0x03) { offset = start; break }
      const payloadBytes = blockType === 0x01 ? 1 : blockSize
      if (buffer.length - offset < payloadBytes) { offset = start; lastBlock = true; break }
      offset += payloadBytes
    }
    if (offset === start) break
    if (checksum) {
      if (buffer.length - offset < 4) break
      offset += 4
    }
    frames.push({ start, end: offset })
  }
  return frames
}

/**
 * 解压多帧 zstd 会话文件，返回完整 JSONL 文本。
 */
function decompressSessionLog(filePath: string): { text: string, frames: number, torn: boolean } {
  const buf = readFileSync(filePath)
  const frames = scanZstdFrames(buf)
  const chunks: Buffer[] = []
  for (const { start, end } of frames) {
    try { chunks.push(zstdDecompressSync(buf.subarray(start, end))) } catch { /* skip corrupt frame */ }
  }
  const torn = frames.length > 0 && frames[frames.length - 1].end < buf.length
  return { text: Buffer.concat(chunks).toString('utf8'), frames: frames.length, torn }
}

// ── 会话目录发现 ──────────────────────────────────────────────────────────

// DSH_HOME 优先：桌面端/服务账户部署下 homedir() 会指向错误实例的家目录。
const DSH_HOME = process.env.DSH_HOME || join(homedir(), '.dsh')

interface SessionDir {
  workspace: string
  sessionId: string
  path: string
  sizeKB: number
}

/**
 * 枚举所有工作区下的会话目录。
 */
function listSessionDirs(): SessionDir[] {
  const sessRoot = join(DSH_HOME, 'sessions')
  if (!existsSync(sessRoot)) return []
  const out: SessionDir[] = []
  for (const ws of readdirSync(sessRoot)) {
    const wsDir = join(sessRoot, ws)
    if (!statSync(wsDir).isDirectory()) continue
    for (const sid of readdirSync(wsDir)) {
      const sidDir = join(wsDir, sid)
      try { if (!statSync(sidDir).isDirectory()) continue } catch { continue }
      const logFile = join(sidDir, 'session.jsonl.zstd')
      const plainFile = join(sidDir, 'session.jsonl')
      let sizeKB = 0
      for (const f of [logFile, plainFile]) {
        if (existsSync(f)) { try { sizeKB = Math.round(statSync(f).size / 1024) } catch {} break }
      }
      out.push({ workspace: ws, sessionId: sid, path: sidDir, sizeKB })
    }
  }
  return out
}

/**
 * 读取一个会话的全部事件（JSONL 行数组）。
 */
function readSessionEvents(sess: SessionDir): { events: object[], frames: number, torn: boolean } {
  const zstdFile = join(sess.path, 'session.jsonl.zstd')
  const plainFile = join(sess.path, 'session.jsonl')
  let text = '', frames = 0, torn = false
  if (existsSync(zstdFile)) {
    const r = decompressSessionLog(zstdFile)
    text = r.text; frames = r.frames; torn = r.torn
  } else if (existsSync(plainFile)) {
    text = readFileSync(plainFile, 'utf8')
  }
  const events = text.split('\n').filter(l => l.trim()).map(l => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
  return { events, frames, torn }
}

// ── 错误扫描 ──────────────────────────────────────────────────────────────
// 真实事件 schema（2026-08-18 按 ~/.dsh/sessions 实际轨迹校准）：
//   tool/result  — data.message.content[] 里 type:"tool-result" 且 isError:true，
//                  错误文本在其 content[].text
//   llm/retry    — data.provider + data.failure {message, code}（提供商级失败重试）
//   turn/end     — data.finish.kind === "error"（轮次以错误收尾）
//   时间戳字段是 evt.time（ms epoch），不是 timestamp/ts。

/**
 * 从 tool/result 事件里取出 isError:true 的工具结果文本。
 */
function toolResultErrors(evt: any): { text: string }[] {
  const out: { text: string }[] = []
  const msg = evt.data && evt.data.message
  for (const c of ((msg && msg.content) || [])) {
    if (c.type !== 'tool-result' || c.isError !== true) continue
    let text = ''
    for (const cc of (c.content || [])) if (cc.type === 'text') text += cc.text
    out.push({ text: text.replace(/\s+/g, ' ').slice(0, 300) })
  }
  return out
}

/**
 * 判断一个事件是否代表错误/失败。
 */
function isErrorEvent(evt: any): boolean {
  const t = evt.type || evt.t || ''
  if (t === 'llm/retry') return true
  if (t === 'tool/result') return toolResultErrors(evt).length > 0
  if (t === 'turn/end' && evt.data && evt.data.finish && evt.data.finish.kind === 'error') return true
  if (typeof t === 'string' && /error|fail|abort|crash|exception|denied|timeout/i.test(t)) return true
  if (evt.error) return true
  if (evt.payload && typeof evt.payload === 'object') {
    const p = evt.payload
    if (p.error || p.errorCode || p.failed === true) return true
    if (typeof p.content === 'string' && /error[: ]|fail[: ]|exception[: ]/i.test(p.content)) return true
  }
  if (evt.result && typeof evt.result === 'object' && evt.result.error) return true
  return false
}

/**
 * 从事件流中提取错误事件的摘要。
 */
function extractErrors(events: any[], maxResults = 20): any[] {
  const errors: any[] = []
  for (let i = 0; i < events.length; i++) {
    const evt = events[i]
    if (!isErrorEvent(evt)) continue
    const t = evt.type || evt.t || 'unknown'
    const tsMs = evt.time || evt.timestamp || evt.ts || evt.createdAt || 0
    const ts = typeof tsMs === 'number' && tsMs > 1e12 ? new Date(tsMs).toISOString().slice(0, 19) : String(tsMs)
    let detail = ''
    const d = evt.data || {}
    if (t === 'llm/retry' && d.failure) {
      detail = `${d.provider || '?'} [${d.failure.code || '?'}] ${d.failure.message || ''}`.slice(0, 300)
    } else if (t === 'tool/result') {
      detail = toolResultErrors(evt).map((e: any) => e.text).join(' | ').slice(0, 300)
    } else if (t === 'turn/end' && d.finish) {
      detail = JSON.stringify(d.finish).slice(0, 300)
    } else if (evt.error) detail = typeof evt.error === 'string' ? evt.error : (evt.error.message || JSON.stringify(evt.error)).slice(0, 300)
    else if (evt.payload?.error) detail = typeof evt.payload.error === 'string' ? evt.payload.error : (evt.payload.error.message || JSON.stringify(evt.payload.error)).slice(0, 300)
    else if (evt.payload?.content) detail = String(evt.payload.content).slice(0, 300)
    errors.push({ index: i, type: t, timestamp: ts, detail, sessionId: evt.id || '' })
    if (errors.length >= maxResults) break
  }
  return errors
}

// ── TCP 端口探测（避免 HTTP 自死锁）─────────────────────────────────────────
// ⚠️ debug_health_check 运行在 DSH 进程内，用 httpRequest 打自己的端口会自死锁：
//    agent loop 等工具返回 → 工具等 HTTP 响应 → HTTP 服务器等 agent loop 空闲 → 死锁 → timeout。
//    改用 TCP connect（只检查端口是否在监听，不发 HTTP 请求，不依赖服务器处理请求）。

/**
 * TCP 连接探测：检查端口是否可连接。
 */
function probePort(port: number, host = '127.0.0.1', timeoutMs = 3000): Promise<{ ok: boolean, error?: string }> {
  return new Promise(resolve => {
    let settled = false
    const done = (r: { ok: boolean, error?: string }) => { if (!settled) { settled = true; resolve(r) } }
    try {
      const sock = netConnect({ port, host, timeout: timeoutMs }, () => {
        sock.destroy()
        done({ ok: true })
      })
      sock.on('timeout', () => { sock.destroy(); done({ ok: false, error: 'timeout' }) })
      sock.on('error', e => done({ ok: false, error: e.message }))
    } catch (e: any) { done({ ok: false, error: e.message }) }
  })
}

// ── 工具注册 ──────────────────────────────────────────────────────────────

const renderText = (_a: unknown, v: unknown) => [{ type: 'text' as const, text: typeof v === 'string' ? v : JSON.stringify(v, null, 2) }]

export function apply(ctx: Context, config: Config): void {
  // debug_scan_errors — 扫描所有会话日志，提取错误事件
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'debug_scan_errors',
    description: '扫描 DSH 全部会话日志，提取错误/失败事件。返回每个错误的类型、时间、摘要和所在会话 ID。用于快速定位哪个会话出了什么问题。',
    parameters: {
      maxSessions: { type: 'number', description: '最多扫描多少个会话（按大小降序），默认 15' },
      maxErrors: { type: 'number', description: '每个会话最多提取多少条错误，默认 20' },
    },
    output: { schema: { type: 'string' }, render: renderText },
    async execute(args: { maxSessions?: number, maxErrors?: number }) {
      const maxSessions = args.maxSessions || 15
      const maxErrors = args.maxErrors || 20
      const sessions = listSessionDirs().sort((a, b) => b.sizeKB - a.sizeKB).slice(0, maxSessions)
      if (sessions.length === 0) return '未找到任何会话目录（~/.dsh/sessions 为空）'
      const report: any[] = []
      let totalErrors = 0
      for (const sess of sessions) {
        const { events, frames, torn } = readSessionEvents(sess)
        const errors = extractErrors(events, maxErrors)
        if (errors.length > 0) {
          totalErrors += errors.length
          report.push({
            session: sess.sessionId,
            workspace: sess.workspace, // 目录名无法无损还原路径（连字符歧义），原样展示
            sizeKB: sess.sizeKB,
            events: events.length,
            frames,
            torn,
            errors,
          })
        }
      }
      return `扫描了 ${sessions.length} 个会话，发现 ${totalErrors} 个错误事件：\n\n${JSON.stringify(report, null, 2)}`
    },
  }), '@dsh-external/dsh-debugger: scan_errors'))

  // debug_health_check — 全链路健康检查
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'debug_health_check',
    description: 'DSH 全链路健康检查：端口探测（可在插件配置 healthPorts 中自定义）、LLM 提供商健康（含 TTL 过期判断）、会话存储、super-injector 自愈日志。返回每个检查点的 ok/fail 状态。',
    parameters: {},
    output: { schema: { type: 'string' }, render: renderText },
    async execute() {
      const checks: Record<string, any> = {}
      // 端口探测（TCP connect，避免 HTTP 自死锁）；探测列表来自插件配置 healthPorts
      checks.ports = {}
      for (const { label, port } of config.healthPorts) {
        const r = await probePort(port)
        checks.ports[label] = { ok: r.ok, status: r.ok ? 'listening' : r.error }
      }
      // 提供商健康（直接读文件，避免 HTTP 自死锁）
      // 真实格式（2026-08-18 校准）：{ "providers": { "<provider>": { state, at, message, ttlSec } } }
      // state 取值如 billing/error/rate_limited/auth；记录自带 TTL，过期不算失败（与选择器展示逻辑一致）
      try {
        const phPath = join(DSH_HOME, 'provider-health.json')
        if (existsSync(phPath)) {
          const raw = readFileSync(phPath, 'utf8')
          const parsed = JSON.parse(raw)
          const data = parsed.providers && typeof parsed.providers === 'object' ? parsed.providers : parsed
          const now = Date.now()
          const active = Object.entries(data).filter(([, v]: any) => v && v.state && (now - (v.at || 0)) < (v.ttlSec || 900) * 1000)
          const failing = active.filter(([, v]: any) => v.state !== 'ok' && v.state !== 'healthy')
          checks.providerHealth = { ok: failing.length === 0, count: Object.keys(data).length, activeFailures: failing.map(([k, v]: any) => `${k}:${v.state}`) }
          if (failing.length > 0) checks.providerHealth.details = Object.fromEntries(failing.map(([k, v]: any) => [k, (v.message || '').slice(0, 200)]))
        } else {
          checks.providerHealth = { ok: true, note: 'no provider-health.json (no failures recorded)' }
        }
      } catch (e: any) {
        checks.providerHealth = { ok: true, note: 'provider-health.json unreadable: ' + (e.message || e) }
      }
      // 会话存储
      const sessions = listSessionDirs()
      checks.sessionStorage = { ok: sessions.length > 0, count: sessions.length, totalSizeKB: sessions.reduce((s, x) => s + x.sizeKB, 0) }
      // super-injector 统计（从 self-heal.log 读取最近状态）
      try {
        const logPath = join(DSH_HOME, 'super-injector', 'self-heal.log')
        if (existsSync(logPath)) {
          const lines = readFileSync(logPath, 'utf8').trim().split('\n')
          checks.injector = { ok: true, lastEntry: lines[lines.length - 1]?.slice(0, 200) }
        } else { checks.injector = { ok: true, note: 'no self-heal log' } }
      } catch { checks.injector = { ok: true, note: 'log unreadable' } }
      // 汇总失败项：顶层检查 + ports 子项（端口失败不能淹没在"全部通过"里）
      const failed = Object.entries(checks).filter(([, v]) => v && v.ok === false).map(([k]) => k)
      for (const [label, p] of Object.entries(checks.ports || {})) if ((p as any) && (p as any).ok === false) failed.push('port:' + label)
      return `健康检查完成${failed.length > 0 ? `（${failed.length} 项失败: ${failed.join(', ')}）` : '（全部通过）'}：\n\n${JSON.stringify(checks, null, 2)}`
    },
  }), '@dsh-external/dsh-debugger: health_check'))

  // debug_session_inspect — 读取指定会话的事件流
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'debug_session_inspect',
    description: '读取指定会话的事件流。输入会话 ID（或部分匹配），返回事件类型序列、关键转折点和可选的原始事件。支持 zstd 多帧解压。',
    parameters: {
      sessionId: { type: 'string', required: true, description: '会话 ID（或部分匹配，如前 8 位）' },
      maxEvents: { type: 'number', description: '最多返回多少条事件摘要，默认 50' },
      raw: { type: 'boolean', description: '是否返回原始 JSON 事件（量大时慎用），默认 false' },
    },
    output: { schema: { type: 'string' }, render: renderText },
    async execute(args: { sessionId: string, maxEvents?: number, raw?: boolean }) {
      const sid = args.sessionId
      const maxEvents = args.maxEvents || 50
      const all = listSessionDirs()
      const match = all.find(s => s.sessionId.includes(sid) || s.sessionId === sid)
      if (!match) return `未找到匹配 "${sid}" 的会话（共 ${all.length} 个会话目录）`
      const { events, frames, torn } = readSessionEvents(match)
      if (events.length === 0) return `会话 ${match.sessionId} 无事件（文件可能为空或损坏）`
      const summary = events.slice(0, maxEvents).map((e: any, i: number) => {
        const t = e.type || e.t || '?'
        const tsMs = e.time || e.timestamp || e.ts || e.createdAt || ''
        const ts = typeof tsMs === 'number' ? new Date(tsMs).toISOString().slice(11, 19) : String(tsMs).slice(11, 19)
        let snippet = ''
        const msg = e.data && e.data.message
        if (msg && Array.isArray(msg.content)) {
          // 真实 schema：data.message.content[]（user/assistant/tool 消息块）
          for (const c of msg.content) {
            if (c.type === 'text' && c.text) { snippet = c.text.slice(0, 80); break }
            if (c.type === 'tool-call') { snippet = `→ ${c.toolName || c.name} ${JSON.stringify(c.input || c.args || {}).slice(0, 60)}`; break }
            if (c.type === 'tool-result') { snippet = `${c.isError ? '✗' : '✓'} tool-result`; break }
          }
        }
        if (!snippet && t === 'llm/retry' && e.data?.failure) snippet = `${e.data.provider} [${e.data.failure.code}]`
        if (!snippet && e.payload?.content) snippet = String(e.payload.content).slice(0, 80)
        else if (!snippet && e.payload?.text) snippet = String(e.payload.text).slice(0, 80)
        else if (!snippet && e.error) snippet = String(e.error.message || e.error).slice(0, 80)
        return { i, type: t, ts, snippet }
      })
      const result: any = {
        session: match.sessionId,
        workspace: match.workspace,
        sizeKB: match.sizeKB,
        totalEvents: events.length,
        frames,
        torn,
        eventSummary: summary,
      }
      if (args.raw) result.rawEvents = events.slice(0, Math.min(maxEvents, 20))
      return JSON.stringify(result, null, 2)
    },
  }), '@dsh-external/dsh-debugger: session_inspect'))

  // debug_replay_context — 提取某轮失败对话的上下文摘要
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'debug_replay_context',
    description: '提取指定会话中某个错误事件的上下文（前后各 N 条事件），生成可喂给隔离子代理重放的摘要。用于沙箱复现问题。',
    parameters: {
      sessionId: { type: 'string', required: true, description: '会话 ID（或部分匹配）' },
      errorIndex: { type: 'number', description: '错误事件在事件流中的索引（先用 debug_scan_errors 获取），默认取第一个错误' },
      contextRadius: { type: 'number', description: '错误前后各取多少条事件作为上下文，默认 5' },
    },
    output: { schema: { type: 'string' }, render: renderText },
    async execute(args: { sessionId: string, errorIndex?: number, contextRadius?: number }) {
      const sid = args.sessionId
      const radius = args.contextRadius || 5
      const all = listSessionDirs()
      const match = all.find(s => s.sessionId.includes(sid))
      if (!match) return `未找到匹配 "${sid}" 的会话`
      const { events } = readSessionEvents(match)
      const errors = extractErrors(events, 50)
      if (errors.length === 0) return `会话 ${match.sessionId} 中未检测到错误事件`
      const targetIdx = args.errorIndex != null ? args.errorIndex : errors[0].index
      const start = Math.max(0, targetIdx - radius)
      const end = Math.min(events.length, targetIdx + radius + 1)
      const context = events.slice(start, end).map((e: any, i: number) => {
        const t = e.type || e.t || '?'
        const isErr = isErrorEvent(e)
        let content = ''
        const msg = e.data && e.data.message
        if (msg && Array.isArray(msg.content)) {
          // 真实 schema：提取消息块的可读文本/工具调用摘要
          const parts: string[] = []
          for (const c of msg.content) {
            if (c.type === 'text' && c.text) parts.push(c.text.slice(0, 400))
            else if (c.type === 'tool-call') parts.push(`tool-call ${c.toolName || c.name}: ${JSON.stringify(c.input || c.args || {}).slice(0, 200)}`)
            else if (c.type === 'tool-result') {
              let rt = ''
              for (const cc of (c.content || [])) if (cc.type === 'text') rt += cc.text
              parts.push(`tool-result${c.isError ? '(ERROR)' : ''}: ${rt.replace(/\s+/g, ' ').slice(0, 300)}`)
            }
          }
          content = parts.join('\n').slice(0, 500)
        }
        if (!content && t === 'llm/retry' && e.data?.failure) content = `${e.data.provider} [${e.data.failure.code}] ${e.data.failure.message}`
        if (!content && e.payload?.content) content = String(e.payload.content).slice(0, 500)
        else if (!content && e.payload?.text) content = String(e.payload.text).slice(0, 500)
        else if (!content && e.error) content = String(e.error.message || e.error).slice(0, 500)
        else if (!content) content = JSON.stringify(e).slice(0, 300)
        return { index: start + i, type: t, isError: isErr, content }
      })
      return JSON.stringify({
        session: match.sessionId,
        errorEventIndex: targetIdx,
        errorSummary: errors.find(e => e.index === targetIdx) || errors[0],
        contextWindow: context,
        replayInstructions: `将以上上下文喂给一个隔离子代理（subagent），让它分析错误根因并提出修复方案。错误事件标在 isError: true 的条目里。`,
      }, null, 2)
    },
  }), '@dsh-external/dsh-debugger: replay_context'))
}
