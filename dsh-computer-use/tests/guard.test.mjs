// guard 纯逻辑回归：危险词判定、快照 TTL、区域限制与密码框保护。
// 全部走真实 snapshot 模块（有 setSnapshot/clearSnapshot 测试缝），无需 mock 框架。
import test from 'node:test'
import assert from 'node:assert/strict'

import { isDangerousLabel } from '../lib/guard.js'
import { guard } from '../lib/guard.js'
import { setSnapshot, clearSnapshot, isFresh } from '../lib/snapshot.js'

const OP_TOOLS = ['computer_click', 'computer_type', 'computer_key', 'computer_drag']
const NOOP_CTX = {} // 无 approval 服务 → askApproval 走 fail-closed 分支

function makeSnap(appName = 'Editor', entries = new Map()) {
  return { appName, at: Date.now(), entries }
}

function snapAt(ageMs, appName, entries) {
  return { ...(appName ? makeSnap(appName, entries) : makeSnap()), at: Date.now() - ageMs }
}

test('isDangerousLabel：危险词命中', () => {
  for (const label of ['删除文件.txt', '清空回收站', '格式化磁盘', '确认支付 ¥100', '购买会员', '退出登录 Apple ID']) {
    assert.equal(isDangerousLabel(label), true, `应命中：${label}`)
  }
})

test('isDangerousLabel：普通标签不命中且对空值安全', () => {
  for (const label of ['保存文档', 'Untitled.md', 'OK']) {
    assert.equal(isDangerousLabel(label), false)
  }
  assert.equal(isDangerousLabel(null), false)
  assert.equal(isDangerousLabel(undefined), false)
  assert.equal(isDangerousLabel(''), false)
})

test('快照 TTL：过期与新鲜判定', () => {
  clearSnapshot()
  setSnapshot(snapAt(10_000))
  assert.equal(isFresh(5_000), false)
  assert.equal(isFresh(60_000), true)
  clearSnapshot()
  assert.equal(isFresh(60_000), false)
})

test('区域限制：无快照时操作类工具被拒、观察类放行', async () => {
  clearSnapshot()
  const cfg = { allowedApps: ['Terminal'] }
  for (const tool of OP_TOOLS) {
    const r = await guard(NOOP_CTX, cfg, tool, {})
    assert.equal(r.ok, false, `${tool} 应因无快照被拒`)
  }
  // 观察类不在 OPERATION_TOOLS 里，不受限
  const r = await guard(NOOP_CTX, cfg, 'computer_screen_observe', {})
  assert.equal(r.ok, true)
})

test('区域限制：快照应用不在白名单内拒绝，在白名单内放行', async () => {
  setSnapshot(makeSnap('Vim'))
  const cfg = { allowedApps: ['Terminal', 'Vim'] }
  assert.equal((await guard(NOOP_CTX, cfg, 'computer_click', {})).ok, true)

  const blocked = await guard(NOOP_CTX, { allowedApps: ['Terminal'] }, 'computer_type', {})
  assert.equal(blocked.ok, false)
  assert.match(blocked.reason, /区域限制/)
  clearSnapshot()
})

test('敏感输入保护：密码框拒绝自动输入（type 直接拒绝）', async () => {
  const entries = new Map([[1, { role: 'AXSecureTextField', label: 'Password' }]])
  setSnapshot(makeSnap('Safari', entries))
  const r = await guard(NOOP_CTX, {}, 'computer_type', { element: 1 })
  assert.equal(r.ok, false)
  assert.match(r.reason, /密码框/)
  clearSnapshot()
})

test('危险标签审批失败关闭：无 approval 服务时视为不可用并拒绝', async () => {
  const entries = new Map([[2, { role: 'AXButton', label: '删除全部草稿' }]])
  setSnapshot(makeSnap('Mail', entries))
  const r = await guard(NOOP_CTX, {}, 'computer_click', { element: 2 })
  assert.equal(r.ok, false)
  assert.match(r.reason, /未获批准|不可用/)
  clearSnapshot()
})

test('普通元素操作直接放行', async () => {
  const entries = new Map([[3, { role: 'AXButton', label: 'Save' }]])
  setSnapshot(makeSnap('Editor', entries))
  const r = await guard(NOOP_CTX, {}, 'computer_click', { element: 3 })
  assert.equal(r.ok, true)
  clearSnapshot()
})
