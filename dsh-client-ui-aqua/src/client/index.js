/**
 * dsh-client-ui-aqua — client half（浏览器半）。
 *
 * 在「设置 → 通用」注册「Aqua 水色主题」行：一个开关 + 一块色板预览。
 * 开关开启 = 通过官方 `theme.overrideTokens` 把整套 token 覆盖成水色
 * （背景/文字/边框/强调/气泡全覆盖，见 tokens.js），关闭 = 撤掉覆盖层恢复
 * 默认蓝。色板始终展示 aqua 的全部颜色（色阶条 + 分类色块），一眼看懂。
 * 开关状态持久化到 localStorage；覆盖层随插件卸载一并清理。
 */
import { createElement } from 'react'
import { createAquaStore } from './store.js'
import { AQUA_SOURCE, AQUA_TOKENS, AQUA_RAMP, AQUA_SWATCHES } from './tokens.js'
import { injectWallpaper, injectWelcome, injectTextAppearance } from './wallpaper.ts'

export const inject = ['slots', 'locale', 'theme']

const ID = 'dsh-client-ui-aqua'
const STORAGE_KEY = 'dsh:aqua-theme-enabled'
const USER_TOUCHED_KEY = 'dsh:aqua-theme-user-set'

const ZH = {
  title: 'Aqua 水色主题',
  on: '已开启 · 水色换肤并隐藏壁纸',
  off: '已关闭 · 恢复默认蓝与壁纸',
  ramp: '水色阶（浅 → 深）',
  legendLight: '浅',
  legendDark: '深',
}
const EN = {
  title: 'Aqua theme',
  on: 'On · aqua skin, wallpaper hidden',
  off: 'Off · default blue, wallpaper restored',
  ramp: 'Aqua scale (light → dark)',
  legendLight: 'L',
  legendDark: 'D',
}

const CSS = [
  '.aqua-group { display: flex; flex-direction: column; gap: 10px; }',
  '.aqua-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 12px; border: 1px solid rgba(127,127,137,.2); border-radius: 8px; }',
  '.aqua-text { display: flex; flex-direction: column; gap: 3px; min-width: 0; }',
  '.aqua-label { font-size: 13px; font-weight: 600; }',
  '.aqua-hint { font-size: 12px; opacity: .72; }',
  '.aqua-switch { position: relative; flex: none; width: 40px; height: 22px; border-radius: 999px; border: none; cursor: pointer; padding: 0; background: rgba(127,127,137,.35); transition: background .15s ease; }',
  '.aqua-switch[data-on="true"] { background: rgb(20, 184, 166); }',
  '.aqua-knob { position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.3); transition: left .15s ease; }',
  '.aqua-switch[data-on="true"] .aqua-knob { left: 21px; }',
  // —— 色板预览 ——
  '.aqua-palette { display: flex; flex-direction: column; gap: 10px; padding: 10px 12px; border: 1px solid rgba(127,127,137,.2); border-radius: 8px; }',
  '.aqua-rampLabel { font-size: 12px; font-weight: 600; opacity: .8; }',
  '.aqua-ramp { height: 14px; border-radius: 7px; box-shadow: inset 0 0 0 1px rgba(127,127,137,.25); }',
  '.aqua-legend { display: flex; justify-content: space-between; font-size: 11px; opacity: .6; margin-top: 2px; }',
  '.aqua-cats { display: flex; flex-direction: column; gap: 8px; }',
  '.aqua-cat { display: flex; flex-direction: column; gap: 4px; }',
  '.aqua-catLabel { font-size: 12px; font-weight: 600; opacity: .8; }',
  '.aqua-catItems { display: flex; flex-wrap: wrap; gap: 8px; }',
  '.aqua-swatch { display: flex; flex-direction: column; align-items: center; gap: 2px; }',
  '.aqua-chips { display: flex; gap: 2px; }',
  '.aqua-chip { width: 22px; height: 22px; border-radius: 6px; box-shadow: inset 0 0 0 1px rgba(127,127,137,.35); }',
  '.aqua-swatchLabel { font-size: 11px; opacity: .72; max-width: 60px; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
].join('\n')

function injectStyle() {
  const tagId = ID + '/aqua.css'
  if (document.querySelector('style[data-plugin-css="' + tagId + '"]') === null) {
    const tag = document.createElement('style')
    tag.dataset.plugin = ID
    tag.dataset.pluginCss = tagId
    tag.textContent = CSS
    document.head.appendChild(tag)
  }
}

function readStored(key) {
  try { return localStorage.getItem(key) ?? '' } catch { return '' }
}
function writeStored(key, value) {
  try {
    if (value === '') localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch { /* private mode */ }
}

/** 单个色项：浅/深两个色块并列 + 中文名。 */
function Swatch({ item }) {
  return createElement('div', { className: 'aqua-swatch' },
    createElement('div', { className: 'aqua-chips' },
      createElement('span', { className: 'aqua-chip', style: { background: item.light } }),
      createElement('span', { className: 'aqua-chip', style: { background: item.dark } }),
    ),
    createElement('div', { className: 'aqua-swatchLabel' }, item.label),
  )
}

/** 主题行组件：开关 + 色阶条 + 分类色板。 */
function AquaRow({ t, useStore, setEnabled }) {
  const enabled = useStore((s) => s.enabled)
  const rampGradient = 'linear-gradient(to right, ' + AQUA_RAMP.join(', ') + ')'

  return createElement('div', { className: 'aqua-group' },
    createElement('div', { className: 'aqua-row' },
      createElement('div', { className: 'aqua-text' },
        createElement('div', { className: 'aqua-label' }, t('title')),
        createElement('div', { className: 'aqua-hint' }, enabled ? t('on') : t('off')),
      ),
      createElement('button', {
        type: 'button',
        className: 'aqua-switch',
        'data-on': String(enabled),
        'aria-pressed': enabled,
        onClick: () => { setEnabled(!enabled) },
      }, createElement('span', { className: 'aqua-knob' })),
    ),
    createElement('div', { className: 'aqua-palette' },
      createElement('div', { className: 'aqua-rampLabel' }, t('ramp')),
      createElement('div', { className: 'aqua-ramp', style: { background: rampGradient } }),
      createElement('div', { className: 'aqua-legend' },
        createElement('span', null, t('legendLight')),
        createElement('span', null, t('legendDark')),
      ),
      createElement('div', { className: 'aqua-cats' },
        AQUA_SWATCHES.map((cat) => createElement('div', { className: 'aqua-cat', key: cat.group },
          createElement('div', { className: 'aqua-catLabel' }, cat.group),
          createElement('div', { className: 'aqua-catItems' },
            cat.items.map((item) => createElement(Swatch, { item, key: item.label })),
          ),
        )),
      ),
    ),
  )
}

export function apply(ctx) {
  injectStyle()
  injectWallpaper(ID)
  const disposeWelcome = injectWelcome()
  const disposeAppearance = injectTextAppearance()

  try {
    ctx.locale.register(ID, 'zh', ZH)
    ctx.locale.register(ID, 'en', EN)
  } catch (error) {
    console.error(ID + ': locale registration failed: ' + String(error))
  }

  const theme = ctx.theme
  const store = createAquaStore()
  let bound
  let disposer

  /** 挂载/卸载水色覆盖层（幂等，避免重复叠加）。 */
  const applyOverrides = (enabled) => {
    document.documentElement.toggleAttribute('data-dsh-aqua', enabled)
    if (enabled) {
      if (disposer === undefined) {
        try {
          disposer = theme.overrideTokens(AQUA_SOURCE, AQUA_TOKENS)
        } catch (error) {
          console.error(ID + ': overrideTokens failed: ' + String(error))
        }
      }
    } else if (disposer !== undefined) {
      disposer()
      disposer = undefined
    }
  }

  // 插件被卸载时，撤掉自己挂上的覆盖层（不留给 theme 服务的生命周期）。
  ctx.effect(() => () => {
    document.documentElement.removeAttribute('data-dsh-aqua')
    disposeWelcome?.()
    disposeAppearance?.()
    if (disposer !== undefined) { disposer(); disposer = undefined }
  }, ID + ': aqua override cleanup')

  // 3080 上 aqua 为关闭态（无此存储键）。本插件早期迁移曾默认写入 '1'；
  // 清理非用户显式写入的 '1'——只有开关切换（会同时写 USER_TOUCHED_KEY）才生效。
  if (readStored(STORAGE_KEY) === '1' && readStored(USER_TOUCHED_KEY) !== '1') writeStored(STORAGE_KEY, '')
  const initialEnabled = readStored(STORAGE_KEY) === '1'
  applyOverrides(initialEnabled)

  const injected = (actions) => {
    bound = actions
    bound.setEnabled(readStored(STORAGE_KEY) === '1')
    return {
      setEnabled: (enabled) => {
        bound?.setEnabled(enabled)
        writeStored(STORAGE_KEY, enabled ? '1' : '0')
        writeStored(USER_TOUCHED_KEY, '1')
        applyOverrides(enabled)
      },
    }
  }

  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item',
    id: 'aqua-theme',
    order: 13,
    store,
    locale: ID,
    inject: injected,
  }, AquaRow))
}
