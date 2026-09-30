// @local/dsh-llm-webfree — full implementation.
import {
  type ContentBlock,
  type FinishReason,
  LlmAdapter,
  LlmError,
  type LlmModelInfo,
  type LlmResolvedModelInfo,
  type GenerateOptions,
  type Message,
  type StreamChunk,
  type TokenUsage,
  attributionHeaders,
  CallId,
  ReasoningEffortId,
  resolveRetryPolicy,
} from '@deepseek-ai/dsh-llm'
import { appendFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

// Top-level side effect: every module evaluation gets one log line.
function fileLog(msg: string) {
  try {
    appendFileSync(
      process.env['DSH_WEBFREE_LOG'] || join(homedir(), '.dsh', 'logs', 'dsh-llm-webfree-apply.log'),
      `[${new Date().toISOString()}] ${msg}\n`,
    )
  } catch {}
}
fileLog('module evaluated — begin')

export const PROVIDER_ID = 'deepseek-webfree'
export const name = 'webfree'
export const inject = ['llm'] as const

// --- env-only config; do NOT touch ctx.<property> (reflect proxy throws) ----
const DEFAULT_BASE_URL = 'http://127.0.0.1:22217/v1'
const DEFAULT_API_KEY = 'sk-webfree'
const DEFAULT_API_KEY_ENV = 'DSH_LLM_WEBFREE_KEY'
const DEFAULT_BASE_URL_ENV = 'DSH_LLM_WEBFREE_BASE_URL'
const STREAM_IDLE_TIMEOUT_MS = 5 * 60 * 1000

function pickEnv(name: string, fallback?: string): string | undefined {
  if (typeof process !== 'undefined' && process.env && process.env[name]) {
    return process.env[name]
  }
  return fallback
}

function resolveBaseURL(): string {
  return (pickEnv(DEFAULT_BASE_URL_ENV) ?? DEFAULT_BASE_URL).replace(/\/+$/, '')
}

function resolveApiKey(): string {
  return pickEnv(DEFAULT_API_KEY_ENV, DEFAULT_API_KEY) ?? DEFAULT_API_KEY
}

export function apply(ctx: any, _config: any = {}) {
  fileLog('apply entered')
  try {
    const llm = ctx.get('llm')
    const adapter = new WebfreeAdapter({
      endpointURL: (typeof process !== 'undefined' && process.env[DEFAULT_BASE_URL_ENV]) || DEFAULT_BASE_URL,
      apiKey: (typeof process !== 'undefined' && process.env[DEFAULT_API_KEY_ENV]) || DEFAULT_API_KEY,
      streamIdleTimeoutMs: STREAM_IDLE_TIMEOUT_MS,
    })
    llm.registerAdapter([PROVIDER_ID], adapter)
    fileLog('registerAdapter OK')
  } catch (e: any) {
    fileLog(`apply THREW: ${e?.message}`)
    throw e
  }
}

// --- serializer helpers (no ctx access) -------------------------------------
function flattenText(blocks: readonly ContentBlock[] | undefined): string {
  if (!blocks) return ''
  return blocks
    .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
    .map((b) => b.text)
    .join('')
}

function serializeMessage(m: Message): unknown[] | null {
  if (m.role === 'system') {
    const text = flattenText(m.content)
    return [{ role: 'system', content: text }]
  }
  if (m.role === 'assistant') {
    const text = flattenText(m.content)
    const reasoning = (m.content as ContentBlock[])
      .filter((b): b is { type: 'reasoning'; text: string } => b.type === 'reasoning')
      .map((b) => b.text)
      .join('')
    const toolBlocks = (m.content as ContentBlock[]).filter(
      (b): b is Extract<ContentBlock, { type: 'tool-call' }> => b.type === 'tool-call',
    )
    const toolCalls = toolBlocks.length
      ? toolBlocks.map((b) => ({
          id: b.id,
          type: 'function',
          function: { name: b.name, arguments: b.arguments },
        }))
      : undefined
    const out: Record<string, unknown> = { role: 'assistant', content: text }
    if (reasoning.length > 0) out['reasoning_content'] = reasoning
    if (toolCalls && toolCalls.length > 0) out['tool_calls'] = toolCalls
    return [out]
  }
  const toolResults = (m.content as ContentBlock[]).filter(
    (b): b is Extract<ContentBlock, { type: 'tool-result' }> => b.type === 'tool-result',
  )
  const text = flattenText(m.content)
  const out: Record<string, unknown>[] = []
  if (text.length > 0 || toolResults.length === 0) {
    out.push({ role: 'user', content: text })
  }
  for (const r of toolResults) {
    out.push({
      role: 'tool',
      tool_call_id: r.toolCallId,
      content: flattenText(r.content) || '(no output)',
    })
  }
  return out
}

function serializeMessages(messages: readonly Message[]): unknown[] {
  const out: unknown[] = []
  for (const m of messages) {
    const parts = serializeMessage(m)
    if (parts) out.push(...parts)
  }
  return out
}

function serializeTools(tools: GenerateOptions['tools']) {
  if (!tools || tools.length === 0) return undefined
  return tools.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }))
}

function buildRequestBody(options: GenerateOptions) {
  const messages = options.system
    ? [{ role: 'system', content: options.system }, ...serializeMessages(options.messages)]
    : serializeMessages(options.messages)
  const tools = serializeTools(options.tools)
  return {
    model: options.model,
    messages,
    stream: true,
    stream_options: { include_usage: true },
    ...options.temperature !== undefined ? { temperature: options.temperature } : {},
    ...options.maxTokens !== undefined ? { max_tokens: options.maxTokens } : {},
    ...options.stop !== undefined ? { stop: options.stop } : {},
    ...tools && tools.length > 0 ? { tools } : {},
  }
}

interface FunctionCallDelta {
  index?: number
  id?: string
  function?: { name?: string; arguments?: string }
}

interface ToolCallWire {
  index: number
  id: string
  type?: string
  function: { name: string; arguments: string }
}

interface ChoiceWire {
  index: number
  finish_reason?: string | null
  delta?: {
    role?: string
    content?: string | null
    reasoning_content?: string | null
    tool_calls?: FunctionCallDelta[]
  }
}

interface ChunkWire {
  id?: string
  model?: string
  choices?: ChoiceWire[]
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    cached_tokens?: number
    reasoning_tokens?: number
    total_tokens?: number
  }
}

async function* parseSse(stream: ReadableStream<Uint8Array>): AsyncIterable<string> {
  // Hand-rolled SSE parser — avoids `eventsource-parser/stream`, which depends
  //   on a transform stream surface the cordis loader inspects at module load.
  const reader = stream.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) {
        if (buffer.length > 0) {
          for (const line of buffer.split('\n')) yield* parseSseLine(line)
        }
        return
      }
      buffer += value
      let nl: number
      while ((nl = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, nl).replace(/\r$/, '')
        buffer = buffer.slice(nl + 1)
        yield* parseSseLine(line)
      }
    }
  } finally {
    reader.releaseLock()
  }
}

function* parseSseLine(line: string): Iterable<string> {
  if (line.length === 0) return
  if (!line.startsWith('data:')) return
  const data = line.slice(5).trim()
  yield data
}

function mapFinishReason(raw?: string | null): FinishReason {
  switch (raw) {
    case 'stop':
      return { kind: 'stop' }
    case 'tool_calls':
    case 'function_call':
      return { kind: 'tool-calls' }
    case 'length':
    case 'max_tokens':
      return { kind: 'max-tokens' }
    case 'content_filter':
    case 'safety':
      return { kind: 'error', failure: { message: raw ?? 'safety', code: 'CONTENT_FILTER' } }
    default:
      return { kind: 'stop' }
  }
}

function toolCallIndex(slot: number): number {
  return 2 + slot
}

export class WebfreeAdapter extends LlmAdapter {
  private readonly endpointURL: string
  private readonly apiKey: string
  private readonly streamIdleTimeoutMs: number

  constructor(opts: { endpointURL?: string; apiKey?: string; streamIdleTimeoutMs?: number } = {}) {
    super()
    this.endpointURL = (opts.endpointURL ?? DEFAULT_BASE_URL).replace(/\/+$/, '')
    this.apiKey = opts.apiKey ?? DEFAULT_API_KEY
    this.streamIdleTimeoutMs = opts.streamIdleTimeoutMs ?? STREAM_IDLE_TIMEOUT_MS
  }

  providerInfo(provider: string) {
    if (provider !== PROVIDER_ID) {
      throw new LlmError(
        `dsh-llm-webfree only handles provider "${PROVIDER_ID}", not "${provider}"`,
        'INVALID_ADAPTER',
      )
    }
    return { id: PROVIDER_ID, name: 'DeepSeek (web free, via ds-free-api)' }
  }

  providerRetryPolicy() {
    return resolveRetryPolicy(
      {
        mode: 'normal',
        maxRetries: 2,
        retryableCodes: ['TRANSPORT', 'STREAM_CLOSED', 'RATE_LIMIT'],
        backoff: { initialDelayMs: 800, maxDelayMs: 8000, jitterRatio: 0.2 },
      },
      'dsh-llm-webfree',
    )
  }

  listModels(): Promise<LlmModelInfo[]> {
    return Promise.resolve([
      {
        provider: PROVIDER_ID,
        id: 'deepseek-chat',
        name: 'DeepSeek Chat (web free)',
        description: 'Fast conversational model via chat.deepseek.com',
        inputModalities: ['text'],
      },
      {
        provider: PROVIDER_ID,
        id: 'deepseek-reasoner',
        name: 'DeepSeek Reasoner (web free)',
        description: 'Deep-thinking model exposed as reasoning_content',
        inputModalities: ['text'],
      },
    ])
  }

  resolveModel(
    provider: string,
    model: string,
    _signal?: AbortSignal,
  ): Promise<LlmResolvedModelInfo> {
    const isReasoner = model === 'deepseek-reasoner'
    return Promise.resolve({
      provider,
      id: model,
      name:
        model === 'deepseek-chat'
          ? 'DeepSeek Chat (web free)'
          : model === 'deepseek-reasoner'
          ? 'DeepSeek Reasoner (web free)'
          : model,
      context: { contextWindow: 128_000 },
      defaultMaxTokens: 4096,
      inputModalities: ['text'],
      ...(isReasoner
        ? {
            reasoning: {
              efforts: [
                { id: ReasoningEffortId('off'), name: 'No reasoning' },
                { id: ReasoningEffortId('high'), name: 'Deep thinking (default)' },
              ],
              defaultEffort: ReasoningEffortId('high'),
            },
          }
        : {}),
    })
  }

  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    if (options.provider !== PROVIDER_ID) {
      throw new LlmError(
        `dsh-llm-webfree: provider "${PROVIDER_ID}" expected, got "${options.provider}"`,
        'INVALID_ADAPTER',
      )
    }

    const body = JSON.stringify(buildRequestBody(options))
    const url = `${this.endpointURL}/chat/completions`
    const headers = {
      'content-type': 'application/json',
      accept: 'text/event-stream',
      authorization: `Bearer ${this.apiKey}`,
      ...attributionHeaders(),
      'user-agent': 'dsh-llm-webfree/0.1 (+local)',
    }

    let response: Response
    try {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body,
        signal: options.signal,
      })
    } catch (error) {
      if (options.signal?.aborted) throw error
      throw new LlmError(`ds-free-api unreachable at ${url}`, 'TRANSPORT', {
        cause: error as Error,
      })
    }

    if (!response.ok) {
      let providerMessage = `HTTP ${response.status}`
      try {
        const errJson: any = await response.json()
        if (errJson && typeof errJson.error?.message === 'string') {
          providerMessage = errJson.error.message
        } else if (typeof errJson?.message === 'string') {
          providerMessage = errJson.message
        }
      } catch {
        /* non-json body, ignore */
      }
      throw new LlmError(
        `ds-free-api error (HTTP ${response.status}): ${providerMessage}`,
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

    let textIndex: number | null = null
    let textBuffer = ''
    const reasoningIndexByChoice = new Map<number, number>()
    const reasoningBufferByChoice = new Map<number, string>()
    const toolCallAccumulator = new Map<string, ToolCallWire>()
    const toolCallFinishedBlock = new Set<string>()
    let usage: TokenUsage | null = null
    let finish: FinishReason | null = null

    try {
      for await (const data of parseSse(response.body)) {
        if (data === '[DONE]') break
        if (!data) continue
        let chunk: ChunkWire
        try {
          chunk = JSON.parse(data)
        } catch {
          continue
        }

        if (chunk.usage) {
          const prompt = Number(chunk.usage.prompt_tokens ?? 0) || 0
          const cached = Number(chunk.usage.cached_tokens ?? 0) || 0
          const uncached = Math.max(0, prompt - cached)
          const completion = Number(chunk.usage.completion_tokens ?? 0) || 0
          const reasoning = Number(chunk.usage.reasoning_tokens ?? 0) || 0
          usage = {
            inputTokens: uncached,
            outputTokens: completion,
            cacheReadTokens: cached > 0 ? cached : undefined,
            reasoningTokens: reasoning > 0 ? reasoning : undefined,
          }
        }

        const choices = chunk.choices ?? []
        for (const choice of choices) {
          if (choice.finish_reason) finish = mapFinishReason(choice.finish_reason)
        }

        for (const choice of choices) {
          const delta = choice.delta
          if (!delta) continue

          if (typeof delta.content === 'string' && delta.content.length > 0) {
            if (textIndex === null) {
              textIndex = 0
              yield { type: 'block-start', index: textIndex, blockType: 'text' }
            }
            textBuffer += delta.content
            yield { type: 'text-delta', index: textIndex, text: delta.content }
          }

          if (typeof delta.reasoning_content === 'string' && delta.reasoning_content.length > 0) {
            let rIndex = reasoningIndexByChoice.get(choice.index)
            if (rIndex === undefined) {
              rIndex = textIndex !== null ? 1 : 0
              reasoningIndexByChoice.set(choice.index, rIndex)
              yield { type: 'block-start', index: rIndex, blockType: 'reasoning' }
            }
            const prev = reasoningBufferByChoice.get(choice.index) ?? ''
            reasoningBufferByChoice.set(choice.index, prev + delta.reasoning_content)
            yield { type: 'reasoning-delta', index: rIndex, text: delta.reasoning_content }
          }

          if (Array.isArray(delta.tool_calls)) {
            for (const tc of delta.tool_calls) {
              const slot = tc.index ?? 0
              const key = `${choice.index}:${slot}`
              let acc = toolCallAccumulator.get(key)
              if (!acc) {
                const id = tc.id ?? `call-${slot}-${Date.now().toString(36)}`
                acc = { index: slot, id, function: { name: '', arguments: '' } }
                toolCallAccumulator.set(key, acc)
                yield {
                  type: 'block-start',
                  index: toolCallIndex(slot),
                  blockType: 'tool-call',
                }
              }
              if (tc.id) acc.id = tc.id
              if (tc.function?.name) acc.function.name = tc.function.name
              if (tc.function?.arguments) {
                acc.function.arguments += tc.function.arguments
                yield {
                  type: 'tool-call-delta',
                  index: toolCallIndex(slot),
                  id: CallId(acc.id),
                  ...tc.function.name ? { name: tc.function.name } : {},
                  argumentsDelta: tc.function.arguments,
                }
              }
            }
          }
        }
      }
    } finally {
      /* end-of-stream */
    }

    if (textIndex !== null) {
      yield {
        type: 'block-end',
        index: textIndex,
        block: { type: 'text', text: textBuffer },
      }
    }
    for (const [choice, rIndex] of reasoningIndexByChoice) {
      yield {
        type: 'block-end',
        index: rIndex,
        block: {
          type: 'reasoning',
          text: reasoningBufferByChoice.get(choice) ?? '',
        },
      }
    }
    for (const [, acc] of toolCallAccumulator) {
      if (toolCallFinishedBlock.has(acc.id)) continue
      toolCallFinishedBlock.add(acc.id)
      yield {
        type: 'block-end',
        index: toolCallIndex(acc.index),
        block: {
          type: 'tool-call',
          id: CallId(acc.id),
          name: acc.function.name,
          arguments: acc.function.arguments,
        },
      }
    }

    if (usage) yield { type: 'usage', usage }
    yield { type: 'finish', reason: finish ?? { kind: 'stop' } }
  }
}
