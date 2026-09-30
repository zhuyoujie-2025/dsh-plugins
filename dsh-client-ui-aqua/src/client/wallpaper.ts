/**
 * Wallpaper layer replication, ported from the 3080 custom dsh-client-ui-theme:
 * a ::before layer on the conversation slot rendered through the animated SVG
 * `dsh-wallpaper-flow` filter. The image comes from the `dsh:wallpaper`
 * localStorage data URL when set, else the bundled default.
 */
import { WALLPAPER_DEFAULT } from './wallpaper-default.ts'

export const WALLPAPER_STORAGE_KEY = 'dsh:wallpaper'

// 0.1.7 的 theme token 引擎会接管 --dsh-wallpaper-image（var() 代入背景图在该
// 引擎下不生效），这里直接把 URL 写进 ::before 规则；同时仍写同名 token 保持
// 与定制 ui-theme 的兼容面（其他消费者可读它）。
const WALLPAPER_CSS = (wpUrl) => [
  // aqua 开启时按原设计隐藏壁纸（3080: aqua token 层把 --dsh-wallpaper-image 置 none；
  // 这里用 html[data-dsh-aqua] 属性门控，applyOverrides 里随开关联动）。
  'html:not([data-dsh-aqua]) [data-slot="conversation"]::before, html:not([data-dsh-aqua]) [data-slot="main.conversation"] > *::before { content:"" !important; z-index:0 !important; position:absolute !important; inset:-40px !important; background-image:url("' + wpUrl + '") !important; background-position:50% center !important; background-repeat:no-repeat !important; background-size:cover !important; filter:url("#dsh-wallpaper-flow") !important; pointer-events:none !important; }',
  '[data-slot="conversation"], [data-slot="main.conversation"] > * { position:relative !important; overflow:hidden !important; }',
  '[data-slot="conversation"] > *, [data-slot="main.conversation"] > * > * { position:relative !important; }',
].join('\n')

// 2026-09-08 机主定制（3080 /assets/dsh-custom-theme.css 追加块的非壁纸部分）：
// 品牌鲸鱼与 HARNESS 徽章蓝色化 + 动态欢迎语样式。3080 上该 CSS 无条件加载，
// 这里同样不随 aqua 开关联动。壁纸规则已由上方 WALLPAPER_CSS 承担，不重复。
const CUSTOM_THEME_CSS = [
  '[data-slot="sidebar.brand.mark"] svg path[fill="currentColor"],',
  '[data-slot="sidebar.brand.name"] svg path[fill="currentColor"],',
  '[data-slot="conversation.hero.brand.mark"] svg path[fill="currentColor"] {',
  '  fill: var(--dsw-static-deepseek-450, #4D6BFE) !important;',
  '}',
  '[data-slot="sidebar.brand.name"] svg rect[fill="currentColor"] { fill: var(--dsw-static-deepseek-450, #4D6BFE) !important; }',
  '[data-slot="sidebar.brand.name"] svg path[fill^="var(--dsw-alias-label-primary-inverted)"] { fill: #ffffff !important; }',
  '.dsh-welcome { display: inline-block; white-space: nowrap; vertical-align: bottom; margin-right: 10px; color: var(--dsw-alias-label-primary); font-size: 26px; font-weight: 500; line-height: 32px; }',
  '.dsh-welcome-caret { display: inline-block; vertical-align: -.08em; background: currentColor; border-radius: 1px; width: 2px; height: .95em; margin-left: 2px; animation: dsh-caret-blink 1.1s steps(2,start) infinite; }',
  '.dsh-welcome-rare .dsh-welcome-caret { background: #e0a63e; }',
  '.dsh-welcome-legendary .dsh-welcome-caret { background: #b197fc; animation: none; }',
  '@keyframes dsh-caret-blink { to { visibility: hidden } }',
  '.dsh-welcome-rare { background: linear-gradient(100deg,#f5d97e 0%,#e0a63e 55%,#f9e8b3 100%); color: #0000 !important; -webkit-background-clip: text; background-clip: text; }',
  '.dsh-welcome-legendary { background: linear-gradient(90deg,#ff6b6b,#ffa94d,#ffd43b,#69db7c,#4dabf7,#b197fc,#ff6b6b) 0 0/200%; color: #0000 !important; -webkit-background-clip: text; background-clip: text; animation: dsh-welcome-rainbow 6s linear infinite; }',
  '@keyframes dsh-welcome-rainbow { to { background-position: 200% } }',
  // 0.1.7 菜单底色为半透明 #f8f9fa94，靠 backdrop-blur 兜底，但 _backing 层只在
  // darwin 渲染——Windows 上壁纸会透穿菜单。3080 定制构建的取值是
  // var(--dsw-alias-bg-layer-3)（不透明），恢复同源取值（浅/深色都正确）。
  'body { --dsw-specific-menu: var(--dsw-alias-bg-layer-3) !important; }',
  // 且 0.1.7 菜单 _surface 本体不设 background，绘制完全交给 _backing
  // （darwin 独有）——Windows 下浮层全透明。直接给 surface 不透明底。
  '[class*="_surface_"] { background: var(--dsw-specific-menu); }',
  // 0.1.7 右栏 grid 列宽 0 时，其内部 dock-kit 面板（"空面板"）以固定宽探出列外，
  // 绘成一块不透明色板盖住会话右缘（桌面壳里为黑）。rightbarCol 裁剪溢出 +
  // aria-hidden 的 panel 不显示——展开/收起动画走列宽本身，不受影响。
  '[class*="_rightbarCol"] { overflow: hidden !important; }',
  '[data-sidebar-right-panel][aria-hidden="true"] { visibility: hidden !important; }',
].join('\n')

/**
 * 动态欢迎语（逐字移植自 3080 定制 ui-theme 的 TypewriterWelcome 桥接块）：
 * 找到 hero 标题里文本恰为「探索未至之境」的裸 span，藏起它并在其后插入
 * .dsh-welcome-anchor（正文 + 光标），按 90ms/字打字。80% 常规 / 15% 金色
 * 稀有 / 5% 彩虹传说。首页卸载重挂后 hero 会重建，故每 1.2s 兜底重挂。
 * 返回清理函数：停轮询、移除 anchor、还原原标题 span。
 */
const WELCOME_POOLS = {
  common: ['今天想让我帮你做点什么？', '嗨，有什么想聊的？', '新的一天，想从哪里开始？', '有什么想法，说来听听？', '想让我探索点什么？', '开始吧，告诉我你的目标', '有什么难题，交给我来办', '随便聊聊，或者直接开干？', '需要我做点什么吗？', '我准备好了，随时听候差遣', '想聊什么都可以，我一直都在', '今天想一起解决点什么？', '有什么灵光一现的想法？', '来吧，把你的想法交给我'],
  rare: ['金色传说闪现，你今天运气不错', '恭喜解锁一条金色欢迎语 ✨', '这条金光，只为此刻的你而亮', '稀有掉落：一条自带光环的问候', '我掐指一算，你今天会有好事发生', '运气爆棚！这是一条限量的金色开场'],
  legendary: ['传说级彩蛋！全场唯一的彩虹欢迎语被你抽中了', '万中无一！这条欢迎语自带彩虹，别声张', '天选之人！连欢迎语都在为你发光', '全服通告：你抽中了隐藏的传说欢迎语', '彩虹降临！今天注定是不平凡的一天'],
}

function rollWelcome() {
  const roll = Math.random() * 100
  const tier = roll < 80 ? 'common' : roll < 95 ? 'rare' : 'legendary'
  const pool = WELCOME_POOLS[tier]
  return { text: pool[Math.floor(Math.random() * pool.length)], tier }
}

export function injectWelcome() {
  let typeTimer = null
  const startWelcome = () => {
    if (document.querySelector('.dsh-welcome-anchor')) return
    let span = null
    const candidates = document.querySelectorAll('span')
    for (let i = 0; i < candidates.length; i++) {
      if (candidates[i].childElementCount === 0 && (candidates[i].textContent || '') === '探索未至之境') { span = candidates[i]; break }
    }
    if (!span || !span.parentElement) return
    span.style.display = 'none'
    const pick = rollWelcome()
    const wrap = document.createElement('span')
    wrap.className = 'dsh-welcome-anchor'
    const line = document.createElement('span')
    line.className = 'dsh-welcome' + (pick.tier === 'rare' ? ' dsh-welcome-rare' : pick.tier === 'legendary' ? ' dsh-welcome-legendary' : '')
    const caret = document.createElement('span')
    caret.className = 'dsh-welcome-caret'
    caret.setAttribute('aria-hidden', 'true')
    wrap.appendChild(line)
    wrap.appendChild(caret)
    span.parentElement.insertBefore(wrap, span.nextSibling)
    let shown = 0
    if (typeTimer) clearInterval(typeTimer)
    typeTimer = setInterval(() => {
      shown += 1
      line.textContent = pick.text.slice(0, shown)
      if (shown >= pick.text.length) { clearInterval(typeTimer); typeTimer = null }
    }, 90)
  }
  startWelcome()
  const interval = setInterval(startWelcome, 1200)
  return () => {
    clearInterval(interval)
    if (typeTimer) clearInterval(typeTimer)
    const anchor = document.querySelector('.dsh-welcome-anchor')
    if (anchor) {
      const prev = anchor.previousElementSibling
      if (prev && prev.style.display === 'none') prev.style.display = ''
      anchor.remove()
    }
  }
}

/**
 * text-appearance 桥接（逐字移植自 3080 定制 ui-theme）：把 localStorage 里的
 * thinking/body 字号与颜色投影到 :root CSS 变量；颜色项只在深色主题下生效。
 * 键名与 ThemeRuntime 持久化保持一致。返回清理函数（停轮询 + 移除变量）。
 */
const APPEARANCE_COLOR_KEYS = { '--dsh-thinking-color': 1, '--dsh-body-color': 1 }
const APPEARANCE_KEYS = [
  ['dsh:thinking-color', '--dsh-thinking-color'],
  ['dsh:thinking-size', '--dsh-thinking-size'],
  ['dsh:body-color', '--dsh-body-color'],
  ['dsh:body-size', '--dsh-body-size'],
]

export function injectTextAppearance() {
  const applyAppearance = () => {
    let dark = false
    try { dark = document.body.hasAttribute('data-ds-dark-theme') } catch {}
    for (const [storageKey, cssVar] of APPEARANCE_KEYS) {
      let v = null
      try { v = localStorage.getItem(storageKey) } catch {}
      const apply = typeof v === 'string' && v.length > 0 && (!APPEARANCE_COLOR_KEYS[cssVar] || dark)
      if (apply) document.documentElement.style.setProperty(cssVar, v)
      else document.documentElement.style.removeProperty(cssVar)
    }
  }
  applyAppearance()
  const interval = setInterval(applyAppearance, 1500)
  return () => {
    clearInterval(interval)
    for (const [, cssVar] of APPEARANCE_KEYS) {
      try { document.documentElement.style.removeProperty(cssVar) } catch {}
    }
  }
}

function readStored(key) {
  try { return localStorage.getItem(key) ?? '' } catch { return '' }
}

export function injectWallpaper(pluginId) {
  const stored = readStored(WALLPAPER_STORAGE_KEY)
  const url = stored.startsWith('data:image/') ? stored : WALLPAPER_DEFAULT
  document.documentElement.style.setProperty('--dsh-wallpaper-image', `url("${url}")`)
  if (!document.getElementById('dsh-wallpaper-flow')) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('width', '0')
    svg.setAttribute('height', '0')
    svg.setAttribute('aria-hidden', 'true')
    svg.style.position = 'absolute'
    svg.innerHTML = '<filter id="dsh-wallpaper-flow" x="-20%" y="-20%" width="140%" height="140%"><feTurbulence type="fractalNoise" baseFrequency="0.005 0.008" numOctaves="2" seed="7" result="noise"><animate attributeName="baseFrequency" dur="16s" values="0.005 0.008;0.008 0.005;0.005 0.008" repeatCount="indefinite"></animate></feTurbulence><feDisplacementMap in="SourceGraphic" in2="noise" scale="18" xChannelSelector="R" yChannelSelector="G"></feDisplacementMap></filter>'
    document.body.appendChild(svg)
  }
  const tagId = pluginId + '/wallpaper.css'
  if (document.querySelector('style[data-plugin-css="' + tagId + '"]') === null) {
    const tag = document.createElement('style')
    tag.dataset.plugin = pluginId
    tag.dataset.pluginCss = tagId
    tag.textContent = WALLPAPER_CSS(url) + '\n' + CUSTOM_THEME_CSS
    document.head.appendChild(tag)
  }
}
