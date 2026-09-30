// tests/smoke.mjs — minimal smoke test for the compiled WebfreeAdapter.
//   1. Imports lib/index.js (the compiled artifact).
//   2. Builds a fake GenerateOptions and runs the parser against a mocked
//      OpenAI SSE response by monkey-patching global fetch.
//   3. Asserts each StreamChunk protocol step lands in order.
import { WebfreeAdapter, PROVIDER_ID } from '../lib/index.js'

const fakeSse = [
  { data: JSON.stringify({ id: '1', choices: [{ index: 0, delta: { role: 'assistant', content: '你好' } }] }) },
  { data: JSON.stringify({ id: '1', choices: [{ index: 0, delta: { content: '，', reasoning_content: '先想' } }] }) },
  { data: JSON.stringify({ id: '1', choices: [{ index: 0, delta: { content: '世界' } }] }) },
  { data: JSON.stringify({
    id: '1',
    choices: [{
      index: 0,
      finish_reason: 'stop',
      delta: {},
    }],
    usage: { prompt_tokens: 12, completion_tokens: 5, cached_tokens: 4, reasoning_tokens: 3 },
  }) },
  { data: '[DONE]' },
]

function makeReadableStream() {
  const chunks = fakeSse.map((msg) => `data: ${msg.data}\n\n`)
  const enc = new TextEncoder()
  let i = 0
  return new ReadableStream({
    pull(controller) {
      if (i >= chunks.length) {
        controller.close()
        return
      }
      controller.enqueue(enc.encode(chunks[i++]))
    },
  })
}

globalThis.fetch = async () => new Response(makeReadableStream(), {
  status: 200,
  headers: { 'content-type': 'text/event-stream' },
})

const adapter = new WebfreeAdapter({ baseURL: 'http://127.0.0.1:1/v1', apiKey: 'sk-test' })

const events = []
const iterator = adapter.stream({
  provider: PROVIDER_ID,
  model: 'deepseek-reasoner',
  system: '',
  messages: [
    { role: 'user', content: [{ type: 'text', text: 'hi' }] },
  ],
  tools: [],
  signal: new AbortController().signal,
})[Symbol.asyncIterator]()

while (true) {
  const next = await iterator.next()
  if (next.done) break
  events.push(next.value)
}

const types = events.map((e) => e.type)
const ok =
  types[0] === 'block-start' &&
  types.includes('text-delta') &&
  types.includes('reasoning-delta') &&
  types.includes('usage') &&
  types.at(-1) === 'finish'

if (!ok) {
  console.error('FAIL — chunk order wrong:', types)
  process.exit(1)
}

const finish = events.at(-1)
if (finish.reason.kind !== 'stop') {
  console.error('FAIL — finish kind:', finish.reason.kind)
  process.exit(1)
}

const usage = events.find((e) => e.type === 'usage')?.usage
if (usage.inputTokens !== 8 || usage.cacheReadTokens !== 4 || usage.reasoningTokens !== 3) {
  console.error('FAIL — token math wrong:', usage)
  process.exit(1)
}

const info = adapter.providerInfo(PROVIDER_ID)
if (info.id !== PROVIDER_ID || !info.name.startsWith('DeepSeek')) {
  console.error('FAIL — providerInfo:', info)
  process.exit(1)
}

console.log('OK — WebfreeAdapter smoke test passed:', {
  events: types.length,
  blockStarts: events.filter((e) => e.type === 'block-start').length,
  blockEnds: events.filter((e) => e.type === 'block-end').length,
  usage,
  finish: finish.reason.kind,
})
