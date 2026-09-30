/**
 * 快捷语 chip 条（`conversation.input.dock` slot 的渲染体）。
 *
 * 输入框卡片上方的独占一行：置顶快捷语常驻 + 「更多」按钮向上弹出
 * extra 组面板。点击任意 chip → 调用注入的 send(text)（由 index.js 的
 * register inject thunk 提供作用域化 conversation.send），面板自动收起。
 */
import { createElement, useState, useEffect, useRef } from 'react'
import * as store from './store.js'

/** 订阅快捷语数据的共享 hook：chip 条与设置页实时联动。 */
export function useQuickReplies() {
  const [snap, setSnap] = useState(store.getSnapshot)
  useEffect(() => store.subscribe(() => { setSnap(store.getSnapshot()) }), [])
  return snap
}

function Chip({ text, onSend }) {
  return createElement(
    'button',
    { type: 'button', className: 'qr-chip', title: text, onClick: onSend },
    text,
  )
}

/**
 * chip 条组件。props.send(text): Promise<void> 由注册方按会话作用域注入；
 * 发送结果以行尾短提示反馈（已发送/发送失败），失败不弹窗只记 console。
 */
export function QuickRepliesRow({ send }) {
  const snap = useQuickReplies()
  const [open, setOpen] = useState(false)
  const [flash, setFlash] = useState(null)
  const timerRef = useRef(undefined)

  useEffect(() => () => {
    if (timerRef.current !== undefined) clearTimeout(timerRef.current)
  }, [])

  const flashOnce = (kind) => {
    setFlash(kind)
    if (timerRef.current !== undefined) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => { setFlash(null) }, 1400)
  }

  const fire = (text) => {
    setOpen(false)
    if (typeof send !== 'function') {
      flashOnce('error')
      return
    }
    Promise.resolve()
      .then(() => send(text))
      .then(
        () => { flashOnce('sent') },
        (error) => {
          console.error('dsh-quick-replies: send failed: ' + String(error))
          flashOnce('error')
        },
      )
  }

  const extraEmpty = snap.extra.length === 0

  return createElement(
    'div', { className: 'qr-bar' },
    // 「更多」上弹面板：绝对定位锚在 chip 行上方，不挤压布局
    open
      ? createElement(
          'div', { className: 'qr-more' },
          extraEmpty
            ? createElement('span', { className: 'qr-empty' }, '还没有更多快捷语——在 设置 → 快捷语 里添加')
            : snap.extra.map((item) =>
                createElement(Chip, { key: item.id, text: item.text, onSend: () => { fire(item.text) } }),
              ),
        )
      : null,
    createElement(
      'div', { className: 'qr-row' },
      ...snap.pinned.map((item) =>
        createElement(Chip, { key: item.id, text: item.text, onSend: () => { fire(item.text) } }),
      ),
      createElement(
        'button',
        {
          type: 'button',
          className: 'qr-toggle' + (open ? ' qr-toggle-open' : '') + (extraEmpty ? ' qr-toggle-empty' : ''),
          title: extraEmpty ? '暂无更多快捷语，可在 设置 → 快捷语 中添加' : '展开/收起更多快捷语',
          onClick: () => { setOpen((v) => !v) },
        },
        '更多',
        createElement('span', { className: 'qr-caret' }, open ? '▴' : '▾'),
      ),
      flash === null
        ? null
        : createElement(
            'span', { className: 'qr-flash' + (flash === 'error' ? ' qr-flash-error' : '') },
            flash === 'sent' ? '已发送 ✓' : '发送失败 ✗',
          ),
    ),
  )
}
