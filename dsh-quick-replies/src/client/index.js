/**
 * dsh-quick-replies — client half（浏览器半）。
 *
 * 在输入框卡片上方的独占一行（`conversation.input.dock`，目标条/排队行
 * 同款座位，order 30 使其紧贴输入卡片）注册快捷语 chip 条；在设置里新增
 * 「快捷语」页（`settings.section`）管理短语。
 *
 * 点击 chip 的发送走 `conversation.send(text)`（queue 模式），作用域寻址
 * 与官方 QueueDock 一致：register 的 inject thunk 收到 sessionId，在
 * `ctx.sessions.scope(sessionId)` 上取 conversation 服务。发送独立于输入框
 * 草稿——草稿不会被清掉。
 */
import { QuickRepliesRow } from './chips.js'
import { QuickRepliesSettings } from './settings.js'

export const inject = ['slots', 'sessions', 'conversation', 'locale']

const ID = 'dsh-quick-replies'

const ZH = { title: '快捷语' }
const EN = { title: 'Quick Replies' }

const CSS = [
  /* —— 输入框上方 chip 条（chip 平分行宽、整体居中，长短文字都均匀） —— */
  '.qr-bar { position: relative; display: flex; justify-content: center; }',
  '.qr-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 8px; padding: 0 2px 6px; }',
  '.qr-chip, .qr-toggle {',
  '  font: inherit; font-size: 12px; line-height: 1; padding: 5px 11px; border-radius: 999px;',
  '  border: 1px solid rgba(127,127,137,.35); background: transparent; color: inherit;',
  '  cursor: pointer; opacity: .82; white-space: nowrap;',
  '  transition: opacity .12s ease, border-color .12s ease, background .12s ease;',
  '}',
  '.qr-chip:hover, .qr-toggle:hover { opacity: 1; border-color: rgba(127,127,137,.65); background: rgba(127,127,137,.12); }',
  '.qr-chip:active { transform: translateY(1px); }',
  '.qr-chip { flex: 1 1 0; max-width: 320px; text-align: center; overflow: hidden; text-overflow: ellipsis; }',
  '.qr-toggle { flex: none; display: inline-flex; align-items: center; gap: 3px; }',
  '.qr-caret { font-size: 10px; opacity: .8; }',
  '.qr-toggle-empty { opacity: .5; }',
  '.qr-flash { font-size: 11px; opacity: .75; padding: 0 4px; }',
  '.qr-flash-error { color: #e5484d; opacity: 1; }',
  /* —— 「更多」上弹面板（绝对定位在 chip 行上方，不挤压布局） —— */
  '.qr-more {',
  '  position: absolute; right: 2px; bottom: calc(100% + 4px); z-index: 40;',
  '  max-width: 440px; padding: 8px;',
  '  display: flex; flex-wrap: wrap; gap: 6px; justify-content: center;',
  '  border: 1px solid rgba(127,127,137,.35); border-radius: 10px;',
  '  background: rgba(127,127,137,.18);',
  '  background: color-mix(in srgb, canvas 94%, transparent);',
  '  backdrop-filter: blur(6px);',
  '  box-shadow: 0 4px 14px rgba(0,0,0,.18);',
  '}',
  '.qr-empty { font-size: 12px; opacity: .65; padding: 2px 4px; }',
  /* —— 设置页 —— */
  '.qrs-page { display: flex; flex-direction: column; gap: 16px; max-width: 640px; }',
  '.qrs-desc { font-size: 12px; opacity: .7; margin: 0; }',
  '.qrs-group { display: flex; flex-direction: column; gap: 8px; }',
  '.qrs-groupHead { display: flex; align-items: baseline; gap: 8px; }',
  '.qrs-groupTitle { font-size: 13px; font-weight: 600; }',
  '.qrs-groupHint { font-size: 12px; opacity: .65; }',
  '.qrs-list { display: flex; flex-direction: column; gap: 6px; }',
  '.qrs-item { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border: 1px solid rgba(127,127,137,.2); border-radius: 8px; }',
  '.qrs-itemText { flex: 1; min-width: 0; font-size: 13px; overflow-wrap: anywhere; }',
  '.qrs-itemOps { display: flex; gap: 6px; flex: none; }',
  '.qrs-op { font: inherit; font-size: 12px; line-height: 1; padding: 5px 10px; border-radius: 6px; border: 1px solid rgba(127,127,137,.3); background: transparent; color: inherit; cursor: pointer; opacity: .8; }',
  '.qrs-op:hover { opacity: 1; background: rgba(127,127,137,.12); }',
  '.qrs-op-danger:hover { border-color: rgba(229,72,77,.55); color: #e5484d; }',
  '.qrs-op:disabled { opacity: .4; cursor: default; }',
  '.qrs-op:disabled:hover { background: transparent; opacity: .4; }',
  '.qrs-editInput { flex: 1; }',
  '.qrs-emptyRow { font-size: 12px; opacity: .55; padding: 2px 2px; }',
  '.qrs-add { display: flex; gap: 8px; padding-top: 12px; border-top: 1px solid rgba(127,127,137,.18); }',
  '.qrs-input { flex: 1; min-width: 0; font: inherit; font-size: 13px; padding: 8px 10px; border-radius: 8px; border: 1px solid rgba(127,127,137,.35); background: transparent; color: inherit; }',
  '.qrs-input:focus { outline: none; border-color: rgba(127,127,137,.65); }',
  '.qrs-addBtn { font: inherit; font-size: 13px; padding: 8px 14px; border-radius: 8px; border: 1px solid rgba(127,127,137,.35); background: transparent; color: inherit; cursor: pointer; }',
  '.qrs-addBtn:hover:not(:disabled) { background: rgba(127,127,137,.12); }',
  '.qrs-addBtn:disabled { opacity: .45; cursor: default; }',
].join('\n')

function injectStyle() {
  const tagId = ID + '/quick-replies.css'
  if (document.querySelector('style[data-plugin-css="' + tagId + '"]') === null) {
    const tag = document.createElement('style')
    tag.dataset.plugin = ID
    tag.dataset.pluginCss = tagId
    tag.textContent = CSS
    document.head.appendChild(tag)
  }
}

export function apply(ctx) {
  injectStyle()

  try {
    ctx.locale.register(ID, 'zh', ZH)
    ctx.locale.register(ID, 'en', EN)
  } catch (e) {
    console.error(ID + ': locale registration failed: ' + String(e))
  }

  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock',
    id: 'quick-replies',
    order: 30,
    inject: (sessionId) => {
      // 作用域寻址同官方 QueueDock：send 时再从会话作用域取 conversation 服务，
      // 避免注册期闭包捕获过期引用
      return {
        send: (text) => {
          const actx = ctx.sessions.scope(sessionId)
          const conversation = actx === undefined ? undefined : actx.get('conversation')
          if (conversation === undefined) {
            return Promise.reject(new Error(ID + ': conversation service unavailable'))
          }
          return conversation.send(text)
        },
      }
    },
  }, QuickRepliesRow))

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'quick-replies',
    order: 25,
    label: () => {
      try { return ctx.locale.t(ID, 'title') } catch (e) { return '快捷语' }
    },
  }, QuickRepliesSettings))
}
