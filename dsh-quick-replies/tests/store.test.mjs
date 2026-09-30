// store 数据层回归：截断、去重、置顶上限与损坏数据兜底。
// store 是模块单例且依赖 localStorage——每个用例用 query 后缀 cache-bust
// 重新加载模块，配合内存版 localStorage 实现用例间隔离。
import test from 'node:test'
import assert from 'node:assert/strict'

const KEY = 'dsh.quick-replies.v1'

function memoryStorage(initial) {
  const map = initial instanceof Map ? new Map(initial) : new Map()
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  }
}

let caseSeq = 0
async function freshStore(storage) {
  globalThis.localStorage = storage
  // query 后缀让 Node 把同一文件视为新模块，丢弃上一个用例的单例内存态
  return import(`../src/client/store.js?case=${++caseSeq}`)
}

test('首次使用生成默认置顶三条', async () => {
  const s = await freshStore(memoryStorage())
  const snap = s.getSnapshot()
  assert.equal(snap.pinned.length, 3)
  assert.equal(snap.extra.length, 0)
  assert.equal(typeof snap.pinned[0].id, 'string')
})

test('addExtra 进入「更多」组并做长度截断（Unicode 码点）', async () => {
  const s = await freshStore(memoryStorage())
  // 15 个码点上限：10 个 emoji + 8 个 ASCII = 18 码点 → 截到 15
  s.addExtra('😄😄😄😄😄😄😄😄😄😄abcdefgh')
  assert.equal(s.getSnapshot().extra.length, 1)
  assert.equal(Array.from(s.getSnapshot().extra[0].text).length, s.MAX_LEN)
})

test('addExtra 与已有条目重复时静默忽略', async () => {
  const s = await freshStore(memoryStorage())
  s.addExtra('自定义短语A') // 不与默认置顶重名
  assert.equal(s.getSnapshot().extra.length, 1)
  s.addExtra('自定义短语A') // 与 extra 内重名
  s.addExtra('继续')        // 与默认 pinned 重名
  assert.equal(s.getSnapshot().extra.length, 1)
})

test('空白输入被忽略', async () => {
  const s = await freshStore(memoryStorage())
  s.addExtra('   ')
  assert.equal(s.getSnapshot().extra.length, 0)
})

test('update 重命名保护：与他条重名静默忽略', async () => {
  const s = await freshStore(memoryStorage())
  s.addExtra('甲')
  s.addExtra('乙')
  const [a] = s.getSnapshot().extra
  const conflictId = s.getSnapshot().extra[1].id
  s.update(a.id, '乙') // 与第二条重名 → 忽略
  assert.equal(s.getSnapshot().extra[0].text, '甲')
  s.update(conflictId, '丙') // 正常改名
  assert.equal(s.getSnapshot().extra[1].text, '丙')
})

test('pin：默认置顶组已满 PINNED_MAX 时静默拒绝', async () => {
  const s = await freshStore(memoryStorage())
  assert.equal(s.getSnapshot().pinned.length, s.PINNED_MAX) // 默认即满
  s.addExtra('甲')
  const item = s.getSnapshot().extra[0]
  s.pin(item.id)
  // 满员拒绝：extra 不变、pinned 不超上限
  assert.equal(s.getSnapshot().extra.length, 1)
  assert.equal(s.getSnapshot().pinned.length, s.PINNED_MAX)
})

test('损坏的 localStorage 数据回退默认态而不是抛错', async () => {
  const st = memoryStorage()
  st.setItem(KEY, '{not json!')
  const s = await freshStore(st)
  const snap = s.getSnapshot()
  assert.equal(snap.pinned.length, 3)
  assert.equal(snap.extra.length, 0)
})
