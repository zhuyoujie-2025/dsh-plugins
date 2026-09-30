/**
 * dsh-text-appearance — client half（浏览器半）。
 *
 * 在「设置 → 通用」里注册一行「文字外观」，分别调节思考内容 / 正文的：
 *   - 颜色（色相条）、饱和度（灰↔纯色条）、深浅（黑↔白条）——三条覆盖黑/白/灰 + 彩色 + 深浅
 *   - 字体、大小（字号）
 *
 * 三条滑块直接读写 store 的 HSL 数值（连续不跳变），颜色写穿到 theme 服务；
 * 字体与正文颜色/字号通过 CSS 覆盖自包含。
 */
import { createElement, useRef } from 'react'
import { createTextAppearanceStore } from './store.js'
import { hueGradient, saturationGradient, lightnessGradient, hslToCss } from './color.js'

export const inject = ['slots', 'locale']

const ID = 'dsh-text-appearance'

const THINKING_FONT_TOKEN = '--dsh-thinking-font-family'
const BODY_FONT_TOKEN = '--dsh-body-font-family'
const THINKING_FONT_KEY = 'dsh:thinking-font'
const BODY_FONT_KEY = 'dsh:body-font'
const THINKING_COLOR_VAR = '--dsh-thinking-color'
const THINKING_SIZE_VAR = '--dsh-thinking-size'
const BODY_COLOR_VAR = '--dsh-body-color'
const BODY_SIZE_VAR = '--dsh-body-size'
const THINKING_COLOR_KEY = 'dsh:thinking-color'
const THINKING_SIZE_KEY = 'dsh:thinking-size'
const BODY_COLOR_KEY = 'dsh:body-color'
const BODY_SIZE_KEY = 'dsh:body-size'

/** 默认思考色 #d4af37（金色）对应的精确 HSL（与系统 gold 调色板一致）。 */
const DEFAULT_THINKING_HSL = { hue: 46, saturation: 65, lightness: 52 }
const DEFAULT_BODY_HSL = { hue: 0, saturation: 0, lightness: 50 }
const DEFAULT_THINKING_SIZE = 14
const DEFAULT_BODY_SIZE = 16
const MIN_SIZE = 12
const MAX_SIZE = 28

const FONT_OPTIONS = [
  { value: '', label: '默认' },
  { value: 'system-ui, sans-serif', label: '系统默认' },
  { value: "'Microsoft YaHei', 'PingFang SC', sans-serif", label: '微软雅黑 / 苹方' },
  { value: "'SimSun', serif", label: '宋体' },
  { value: "'SimHei', sans-serif", label: '黑体' },
  { value: "'KaiTi', serif", label: '楷体' },
  { value: "'Georgia', serif", label: 'Georgia（衬线）' },
  { value: "'Consolas', monospace", label: 'Consolas（等宽）' },
]

const ZH = {
  title: '文字外观',
  thinking: '思考内容',
  body: '正文输出',
  color: '颜色',
  saturation: '灰↔纯',
  lightness: '深浅',
  font: '字体',
  size: '大小',
}
const EN = {
  title: 'Text appearance',
  thinking: 'Thinking',
  body: 'Body',
  color: 'Color',
  saturation: 'Sat',
  lightness: 'Shade',
  font: 'Font',
  size: 'Size',
}

const CSS = [
  '.ta-group { display: flex; flex-direction: column; gap: 12px; }',
  '.ta-title { font-size: 13px; font-weight: 600; }',
  '.ta-field { display: flex; flex-direction: column; gap: 7px; padding: 10px 12px; border: 1px solid rgba(127,127,137,.2); border-radius: 8px; }',
  '.ta-fieldLabel { font-size: 13px; font-weight: 600; }',
  '.ta-row { display: flex; align-items: center; gap: 10px; }',
  '.ta-label { flex: none; min-width: 38px; font-size: 12px; opacity: .72; }',
  '.ta-swatch { flex: none; width: 28px; height: 28px; border-radius: 6px; border: 1px solid rgba(127,127,137,.35); box-shadow: inset 0 0 0 1px rgba(255,255,255,.12); }',
  '.ta-track { position: relative; flex: 1 1 auto; height: 16px; border-radius: 999px; cursor: pointer; touch-action: none; }',
  '.ta-thumb { position: absolute; top: 50%; width: 18px; height: 18px; border-radius: 50%; border: 2px solid #fff; box-shadow: 0 0 0 1px rgba(0,0,0,.35), 0 1px 3px rgba(0,0,0,.4); transform: translate(-50%, -50%); background: transparent; pointer-events: none; }',
  '.ta-select { flex: 1 1 auto; min-width: 0; height: 26px; border-radius: 6px; border: 1px solid rgba(127,127,137,.35); background: transparent; color: inherit; font-size: 12px; padding: 0 6px; }',
  '.ta-range { flex: 1 1 auto; min-width: 0; }',
  '.ta-value { flex: none; min-width: 40px; font-size: 12px; text-align: right; font-variant-numeric: tabular-nums; opacity: .8; }',
  // 字体/正文覆盖：自包含，不依赖官方 CSS token 修改（ReasoningRow 根带
  // data-variant="think"；MarkdownText 根是 CSS Modules 的 hash 类名，local 名为 markdown）
  '[data-variant="think"] { color: var(--dsh-thinking-color, inherit) !important; font-size: var(--dsh-thinking-size, inherit) !important; font-family: var(--dsh-thinking-font-family, inherit) !important; }',
  '[class*="_markdown"] { color: var(--dsh-body-color, inherit) !important; font-size: var(--dsh-body-size, inherit) !important; font-family: var(--dsh-body-font-family, inherit) !important; }',
].join('\n')

function injectStyle() {
  const tagId = ID + '/appearance.css'
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
function applyFontToDom(token, value) {
  document.documentElement.style.setProperty(token, value === '' ? 'inherit' : value)
}

/** 通用滑块：background 渐变、value/max 定位、拖动连续回调 onChange(0..max)。 */
function Slider({ background, value, max = 100, onChange }) {
  const trackRef = useRef(null)
  const handleDown = (e) => {
    e.preventDefault()
    const rect = trackRef.current.getBoundingClientRect()
    const commit = (clientX) => {
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      onChange(Math.round(ratio * max))
    }
    commit(e.clientX)
    const onMove = (ev) => commit(ev.clientX)
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }
  return createElement('div', {
    className: 'ta-track',
    ref: trackRef,
    onMouseDown: handleDown,
    style: { background },
  }, createElement('div', {
    className: 'ta-thumb',
    style: { left: (value / max * 100) + '%' },
  }))
}

/** 单个外观字段：三条颜色滑块 + 字体下拉 + 字号滑块，均带标签说明。 */
function Field({ t, label, font, onFont, hue, saturation, lightness, onHsl, size, onSize, defaultSize }) {
  const sizeNum = parseInt(size || '', 10)
  const sizeValue = Number.isFinite(sizeNum) ? sizeNum : defaultSize
  const swatchColor = hslToCss(hue, saturation, lightness)

  return createElement('div', { className: 'ta-field' },
    createElement('div', { className: 'ta-fieldLabel' }, label),
    createElement('div', { className: 'ta-row' },
      createElement('div', { className: 'ta-swatch', style: { background: swatchColor } }),
      createElement('span', { className: 'ta-label' }, t('color')),
      createElement(Slider, { background: hueGradient(), value: hue, max: 360, onChange: (h) => onHsl(h, saturation === 0 ? 100 : saturation, lightness) }),
    ),
    createElement('div', { className: 'ta-row' },
      createElement('span', { className: 'ta-label' }, t('saturation')),
      createElement(Slider, { background: saturationGradient(hue, lightness), value: saturation, onChange: (s) => onHsl(hue, s, lightness) }),
    ),
    createElement('div', { className: 'ta-row' },
      createElement('span', { className: 'ta-label' }, t('lightness')),
      createElement(Slider, { background: lightnessGradient(hue, saturation), value: lightness, onChange: (l) => onHsl(hue, saturation, l) }),
    ),
    createElement('div', { className: 'ta-row' },
      createElement('span', { className: 'ta-label' }, t('font')),
      createElement('select', {
        className: 'ta-select',
        value: font || '',
        onChange: (e) => onFont(e.target.value),
      }, FONT_OPTIONS.map((o) => createElement('option', { key: o.value || 'default', value: o.value }, o.label))),
    ),
    createElement('div', { className: 'ta-row' },
      createElement('span', { className: 'ta-label' }, t('size')),
      createElement('input', {
        type: 'range',
        className: 'ta-range',
        min: MIN_SIZE,
        max: MAX_SIZE,
        step: 1,
        value: sizeValue,
        onChange: (e) => onSize(e.target.value + 'px'),
      }),
      createElement('span', { className: 'ta-value' }, sizeValue + 'px'),
    ),
  )
}

function TextAppearanceRow(props) {
  const {
    t, useStore,
    setThinkingHsl, setThinkingSize, setThinkingFont,
    setBodyHsl, setBodySize, setBodyFont,
  } = props
  const s = useStore((st) => st)

  return createElement('div', { className: 'ta-group' },
    createElement('div', { className: 'ta-title' }, t('title')),
    createElement(Field, {
      t,
      label: t('thinking'),
      font: s.thinkingFont, onFont: setThinkingFont,
      hue: s.thinkingHue, saturation: s.thinkingSaturation, lightness: s.thinkingLightness, onHsl: setThinkingHsl,
      size: s.thinkingSize, onSize: setThinkingSize,
      defaultSize: DEFAULT_THINKING_SIZE,
    }),
    createElement(Field, {
      t,
      label: t('body'),
      font: s.bodyFont, onFont: setBodyFont,
      hue: s.bodyHue, saturation: s.bodySaturation, lightness: s.bodyLightness, onHsl: setBodyHsl,
      size: s.bodySize, onSize: setBodySize,
      defaultSize: DEFAULT_BODY_SIZE,
    }),
  )
}

export function apply(ctx) {
  injectStyle()

  try {
    ctx.locale.register(ID, 'zh', ZH)
    ctx.locale.register(ID, 'en', EN)
  } catch (error) {
    console.error(ID + ': locale registration failed: ' + String(error))
  }

  // 0.1.7 的 theme 服务只剩 getTheme/overrideTokens——旧的
  // setThinkingColor/setThinkingSize/setBodyColor/setBodySize 及快照字段
  // （thinkingColor/bodyColor/thinkingSize/bodySize）都不存在。改为自包含：
  // 值持久化在 localStorage，经 CSS 变量写穿到下方覆盖层
  // （[data-variant="think"] / [class*="_markdown"] 消费），不依赖 theme 快照；
  // store.revision 用本地单调计数。
  const store = createTextAppearanceStore()
  let bound
  let localRev = 0

  const readHsl = (key) => {
    try {
      const v = JSON.parse(localStorage.getItem(key) || 'null')
      if (v && Number.isFinite(v.hue) && Number.isFinite(v.saturation) && Number.isFinite(v.lightness)) return v
    } catch { }
    return null
  }
  const writeHsl = (key, v) => {
    try { localStorage.setItem(key, JSON.stringify(v)) } catch { }
  }
  const setVar = (token, value) => {
    try {
      if (value === '') document.documentElement.style.removeProperty(token)
      else document.documentElement.style.setProperty(token, value)
    } catch { }
  }

  // 字体：启动时把 localStorage 里的选择投影到 document 根 CSS token。
  applyFontToDom(THINKING_FONT_TOKEN, readStored(THINKING_FONT_KEY))
  applyFontToDom(BODY_FONT_TOKEN, readStored(BODY_FONT_KEY))

  /**
   * 把 localStorage 的外观值投影到 CSS 变量，并把滑块位置同步给设置行 store。
   * 未设置的颜色/字号不写变量（应用默认皮肤），滑块显示对应默认值。
   */
  const applyStored = () => {
    const th = readHsl(THINKING_COLOR_KEY)
    const bd = readHsl(BODY_COLOR_KEY)
    const tSize = readStored(THINKING_SIZE_KEY)
    const bSize = readStored(BODY_SIZE_KEY)
    setVar(THINKING_COLOR_VAR, th ? hslToCss(th.hue, th.saturation, th.lightness) : '')
    setVar(THINKING_SIZE_VAR, tSize === '' ? '' : tSize + 'px')
    setVar(BODY_COLOR_VAR, bd ? hslToCss(bd.hue, bd.saturation, bd.lightness) : '')
    setVar(BODY_SIZE_VAR, bSize === '' ? '' : bSize + 'px')
    const thD = th ?? DEFAULT_THINKING_HSL
    const bdD = bd ?? DEFAULT_BODY_HSL
    bound?.sync(
      thD.hue, thD.saturation, thD.lightness,
      tSize, readStored(THINKING_FONT_KEY),
      bdD.hue, bdD.saturation, bdD.lightness,
      bSize, readStored(BODY_FONT_KEY),
      ++localRev,
    )
  }
  applyStored()

  const setFont = (token, key) => (value) => {
    writeStored(key, value)
    applyFontToDom(token, value)
    bound?.setFonts(readStored(THINKING_FONT_KEY), readStored(BODY_FONT_KEY))
  }

  /** 写 HSL：本地 store + CSS 变量 + localStorage（自包含，不经 theme 服务）。 */
  const setHsl = (varToken, storeKey, storeSetter) => (hue, saturation, lightness) => {
    bound?.[storeSetter](hue, saturation, lightness)
    setVar(varToken, hslToCss(hue, saturation, lightness))
    writeHsl(storeKey, { hue, saturation, lightness })
  }
  const setSize = (varToken, storeKey) => (s) => {
    const str = String(s ?? '')
    writeStored(storeKey, str)
    setVar(varToken, str === '' ? '' : str + 'px')
  }

  const injected = (actions) => {
    bound = actions
    applyStored()
    return {
      setThinkingHsl: setHsl(THINKING_COLOR_VAR, THINKING_COLOR_KEY, 'setThinkingHsl'),
      setThinkingSize: setSize(THINKING_SIZE_VAR, THINKING_SIZE_KEY),
      setThinkingFont: setFont(THINKING_FONT_TOKEN, THINKING_FONT_KEY),
      setBodyHsl: setHsl(BODY_COLOR_VAR, BODY_COLOR_KEY, 'setBodyHsl'),
      setBodySize: setSize(BODY_SIZE_VAR, BODY_SIZE_KEY),
      setBodyFont: setFont(BODY_FONT_TOKEN, BODY_FONT_KEY),
    }
  }

  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item',
    id: 'text-appearance',
    order: 12,
    store,
    locale: ID,
    inject: injected,
  }, TextAppearanceRow))
}
