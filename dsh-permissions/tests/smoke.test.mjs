// 权限引擎 smoke：模块可加载 + tools/pre-execute 四级规则决策正确。
// 通过最小 mock 宿主 context（所有可选服务缺省走守卫分支），只驱动
// apply 注册出来的拦截处理器，验证 hard/deny/allow/ask 与开关行为。
import test from 'node:test'
import assert from 'node:assert/strict'

import { apply } from '../lib/index.js'

const NEXT = async () => 'next-called'
const AGENT = {} // session 缺失 → workspace 解析为空，走 global 作用域

/** 最小宿主 context：捕获注册的事件处理器，settings 只回读同一份配置。 */
function makeCtx(initialConfig) {
  let currentConfig = initialConfig
  const handlers = new Map()
  return {
    handlers,
    effect() {},
    on(event, handler) {
      handlers.set(event, handler)
    },
    // 所有宿主服务按 undefined 处理：systemPrompt/webServer 有守卫，approval
    // 缺失时 effectivePolicy 固定 'ask'，workspaceRegistry 缺失不解析工作区。
    get: () => undefined,
    settings: {
      register: (_name, _schema, _opts) => ({
        get: () => currentConfig,
        watch: () => () => {},
        replace: async (next) => {
          currentConfig = next
        },
      }),
    },
  }
}

async function setup(rules) {
  const ctx = makeCtx({ enabled: true, hard: [], deny: [], ask: [], allow: [], workspaces: {}, ...rules })
  apply(ctx)
  const handler = ctx.handlers.get('tools/pre-execute')
  assert.equal(typeof handler, 'function', 'apply 应注册 tools/pre-execute 处理器')
  return handler
}

test('总开关关闭时直接放行', async () => {
  const handler = await setup({ enabled: false, deny: ['write'] })
  const out = await handler({ name: 'write', arguments: {}, agent: AGENT }, NEXT)
  assert.equal(out, 'next-called')
})

test('未命中任何规则时 fallback 放行', async () => {
  const handler = await setup({ deny: ['write'] })
  const out = await handler({ name: 'web_search', arguments: {}, agent: AGENT }, NEXT)
  assert.equal(out, 'next-called')
})

test('deny 规则命中 → kind:deny', async () => {
  const handler = await setup({ deny: ['write'] })
  const out = await handler({ name: 'write', arguments: { file_path: '/tmp/a' }, agent: AGENT }, NEXT)
  assert.equal(out.kind, 'deny')
  assert.match(out.reason, /deny/)
})

test('hard 规则命中 → 拒绝且标注不可豁免', async () => {
  const handler = await setup({ hard: ['bash'], deny: [], allow: [] })
  const out = await handler({ name: 'bash', arguments: { command: 'ls' }, agent: AGENT }, NEXT)
  assert.equal(out.kind, 'deny')
  assert.match(out.reason, /硬规则/)
})

test('allow 规则命中 → 放行', async () => {
  const handler = await setup({ deny: ['write'], allow: ['glob'] })
  const out = await handler({ name: 'glob', arguments: { pattern: '*.md' }, agent: AGENT }, NEXT)
  assert.equal(out, 'next-called')
})

test('ask 规则命中且无豁免策略 → kind:ask', async () => {
  const handler = await setup({ ask: ['bash'] })
  const out = await handler({ name: 'bash', arguments: { command: 'ls' }, agent: AGENT }, NEXT)
  assert.equal(out.kind, 'ask')
  assert.match(out.reason, /确认/)
})

test('优先级：hard 压过同工具的 allow', async () => {
  const handler = await setup({ hard: ['write'], allow: ['write'] })
  const out = await handler({ name: 'write', arguments: {}, agent: AGENT }, NEXT)
  assert.equal(out.kind, 'deny')
})
