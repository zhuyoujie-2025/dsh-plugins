/**
 * 快捷语数据层：localStorage 持久化 + 页内订阅。
 *
 * 结构 v1：{ pinned: [{id,text}], extra: [{id,text}] }
 * - pinned：输入框上方常驻显示的 chip（最多 PINNED_MAX 条，可编辑）
 * - extra：收进「更多」展开面板的快捷语（设置里新添加的默认进这里）
 *
 * 约束（store 层兜底，UI 层同步限制）：
 * - 每条快捷语最多 MAX_LEN 个字符（按 Unicode 码点计，超长截断）
 * - 置顶组最多 PINNED_MAX 条，满员后 pin() 静默拒绝
 *
 * 同一 bundle 内的 chip 条与设置页共享此模块实例，一端改动另一端实时刷新。
 */
const KEY = 'dsh.quick-replies.v1'

/** 每条快捷语的字符上限（Unicode 码点数）。 */
export const MAX_LEN = 15
/** 置顶组（直接显示的快捷语）条数上限。 */
export const PINNED_MAX = 3

/** 首次使用（localStorage 无数据）时的默认置顶快捷语。 */
const DEFAULT_PINNED_TEXTS = ['继续', '都按你说的做', '这不对，请你重新思考']

const listeners = new Set()

/** 当前内存态；null 表示尚未从 localStorage 加载。 */
let current = null

function makeId() {
  return 'q' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

/** 规整一段输入文本：去首尾空白并截到 MAX_LEN 个字符。 */
function clip(text) {
  return Array.from(text.trim()).slice(0, MAX_LEN).join('')
}

function defaultState() {
  return {
    pinned: DEFAULT_PINNED_TEXTS.map((text) => ({ id: makeId(), text })),
    extra: [],
  }
}

/** 复原时做形状校验：字段缺失/类型不对就丢弃该项，整体损坏则回退默认；
 *  文字统一走 clip 规整、置顶组裁到上限，防手改 localStorage 破坏约束。 */
function sanitize(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return defaultState()
  const clean = (list) =>
    Array.isArray(list)
      ? list
          .filter(
            (it) =>
              it !== null && typeof it === 'object' &&
              typeof it.text === 'string' && it.text.trim() !== '',
          )
          .map((it) => ({
            id: typeof it.id === 'string' && it.id !== '' ? it.id : makeId(),
            text: clip(it.text),
          }))
          .filter((it) => it.text !== '')
      : []
  return { pinned: clean(raw.pinned).slice(0, PINNED_MAX), extra: clean(raw.extra) }
}

function load() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw === null) {
      const fresh = defaultState()
      current = fresh
      persist()
      return fresh
    }
    return sanitize(JSON.parse(raw))
  } catch {
    return defaultState()
  }
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(current))
  } catch {
    /* 隐私模式等写入失败：仅本次会话内生效 */
  }
}

/** 读取当前快照（React 组件的 state 初值与订阅回调都用它）。 */
export function getSnapshot() {
  if (current === null) current = load()
  return current
}

/** 订阅数据变更，返回取消订阅函数（供 useEffect 清理）。 */
export function subscribe(callback) {
  listeners.add(callback)
  return () => {
    listeners.delete(callback)
  }
}

function commit(next) {
  current = next
  persist()
  for (const callback of listeners) callback()
}

/** 添加快捷语——按需求默认进「更多」组；空串/重复/超长截断后为空则忽略。 */
export function addExtra(text) {
  const clipped = clip(text)
  if (clipped === '') return
  const snap = getSnapshot()
  if (
    snap.pinned.some((it) => it.text === clipped) ||
    snap.extra.some((it) => it.text === clipped)
  ) return
  commit({ pinned: snap.pinned, extra: [...snap.extra, { id: makeId(), text: clipped }] })
}

/** 重命名（两组通用）；空串或与他条重名则静默忽略。 */
export function update(id, text) {
  const clipped = clip(text)
  if (clipped === '') return
  const snap = getSnapshot()
  const dup =
    snap.pinned.some((it) => it.id !== id && it.text === clipped) ||
    snap.extra.some((it) => it.id !== id && it.text === clipped)
  if (dup) return
  const map = (list) => list.map((it) => (it.id === id ? { ...it, text: clipped } : it))
  commit({ pinned: map(snap.pinned), extra: map(snap.extra) })
}

/** 「更多」→ 置顶（追加到 pinned 末尾）；置顶组已满 PINNED_MAX 条时静默拒绝。 */
export function pin(id) {
  const snap = getSnapshot()
  if (snap.pinned.length >= PINNED_MAX) return
  const item = snap.extra.find((it) => it.id === id)
  if (item === undefined) return
  commit({
    pinned: [...snap.pinned, item],
    extra: snap.extra.filter((it) => it.id !== id),
  })
}

/** 置顶 → 「更多」（追加到 extra 末尾）。 */
export function unpin(id) {
  const snap = getSnapshot()
  const item = snap.pinned.find((it) => it.id === id)
  if (item === undefined) return
  commit({
    pinned: snap.pinned.filter((it) => it.id !== id),
    extra: [...snap.extra, item],
  })
}

/** 删除（两组通用）。 */
export function remove(id) {
  const snap = getSnapshot()
  commit({
    pinned: snap.pinned.filter((it) => it.id !== id),
    extra: snap.extra.filter((it) => it.id !== id),
  })
}
