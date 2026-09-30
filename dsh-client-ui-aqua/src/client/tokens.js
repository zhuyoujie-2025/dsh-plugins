/**
 * Aqua（水色/青绿）主题：完整换肤色板 + token 覆盖层 + 色板预览数据。
 *
 * 打开开关 = 用 overrideTokens 把整套 --dsw-alias-* / --dsw-specific-* token
 * 覆盖成水色阶（背景/文字/边框/强调/气泡/滚动条全覆盖），浅、深两种模式
 * 各给一套值；关闭 = 撤掉覆盖层，恢复 DeepSeek 默认蓝/灰白。覆盖层强制要求
 * 每个 token 同时给出 light + dark，避免切换明暗主题后水色失效。
 */

// 水色阶：50 最浅、500 主色、950 最深（Tailwind teal 家族，观感偏 aqua）。
const AQUA = {
  50: 'rgb(240, 253, 250)',
  100: 'rgb(204, 251, 241)',
  200: 'rgb(153, 246, 228)',
  300: 'rgb(94, 234, 212)',
  400: 'rgb(45, 212, 191)',
  500: 'rgb(20, 184, 166)',
  600: 'rgb(13, 148, 136)',
  700: 'rgb(15, 118, 110)',
  800: 'rgb(17, 94, 89)',
  900: 'rgb(19, 78, 74)',
  950: 'rgb(4, 47, 46)',
}

// 浅色模式下的背景/文字专用色：明显青绿 tint（一眼能看出"水色"），
// 而不是接近纯白。文字用深青绿保证对比度。
const LIGHT = {
  bgBase: 'rgb(214, 240, 236)',
  bgCard: 'rgb(236, 249, 246)',
  bgLayer2: 'rgb(200, 233, 228)',
  bgLayer3: 'rgb(189, 227, 221)',
  sidebar: 'rgb(204, 236, 231)',
  textPrimary: 'rgb(5, 46, 43)',
}

// 深色模式下的背景/文字专用色。
const DARK = {
  bgBase: 'rgb(4, 47, 46)',
  bgCard: 'rgb(8, 60, 58)',
  bgLayer2: 'rgb(11, 74, 71)',
  bgLayer3: 'rgb(15, 88, 84)',
  sidebar: 'rgb(3, 38, 37)',
  textPrimary: 'rgb(232, 251, 247)',
}

/** 覆盖层来源标识（与包名一致，便于 inspect 定位来源）。 */
export const AQUA_SOURCE = 'dsh-client-ui-aqua'

/** 完整换肤 token 覆盖（每项 { light, dark } 成对）。 */
export const AQUA_TOKENS = {
  // —— 壁纸：开启时盖成 none（露出下方水色纯底），关闭后撤层恢复 ——
  // 默认壁纸来自 :root（url('/wallpaper.jpg')），自定义壁纸来自 ui-theme 的
  // wallpaper 覆盖层；本层 seq 更大，composeActive 里"后注册者赢"，故能盖住两者。
  '--dsh-wallpaper-image': { light: 'none', dark: 'none' },
  // —— 背景 ——
  '--dsw-alias-bg-base': { light: LIGHT.bgBase, dark: DARK.bgBase },
  '--dsw-alias-bg-layer-1': { light: LIGHT.bgCard, dark: DARK.bgCard },
  '--dsw-alias-bg-layer-2': { light: LIGHT.bgLayer2, dark: DARK.bgLayer2 },
  '--dsw-alias-bg-layer-3': { light: LIGHT.bgLayer3, dark: DARK.bgLayer3 },
  '--dsw-alias-bg-overlay': { light: LIGHT.bgLayer2, dark: DARK.bgLayer2 },
  '--dsw-specific-sidebar-fill': { light: LIGHT.sidebar, dark: DARK.sidebar },
  // —— 文字 ——
  '--dsw-alias-label-primary': { light: LIGHT.textPrimary, dark: DARK.textPrimary },
  '--dsw-alias-label-secondary': { light: AQUA[700], dark: AQUA[200] },
  '--dsw-alias-label-tertiary': { light: AQUA[800], dark: AQUA[300] },
  '--dsw-alias-label-caption': { light: AQUA[600], dark: AQUA[400] },
  // —— 边框 ——
  '--dsw-alias-border-l1': { light: 'rgba(20, 184, 166, 0.16)', dark: 'rgba(45, 212, 191, 0.12)' },
  '--dsw-alias-border-l2': { light: 'rgba(20, 184, 166, 0.28)', dark: 'rgba(45, 212, 191, 0.22)' },
  '--dsw-alias-border-l3': { light: 'rgba(20, 184, 166, 0.40)', dark: 'rgba(45, 212, 191, 0.32)' },
  // —— 强调（品牌蓝 → 水色）——
  '--dsw-alias-state-business-primary': { light: AQUA[500], dark: AQUA[400] },
  '--dsw-alias-state-business-tertiary': { light: AQUA[100], dark: AQUA[800] },
  '--dsw-alias-brand-primary-new-colorprimary-new-color': { light: AQUA[600], dark: AQUA[400] },
  '--dsw-alias-button-info-fill': { light: AQUA[500], dark: AQUA[400] },
  '--dsw-alias-button-info-hover': { light: AQUA[400], dark: AQUA[500] },
  // —— 气泡 / 侧栏选中 / 交互底色 ——
  '--dsw-specific-bubble': { light: AQUA[50], dark: AQUA[900] },
  '--dsw-specific-bubble-highlight': { light: AQUA[200], dark: AQUA[800] },
  '--dsw-specific-sidebar-nav-item-active-accent': { light: AQUA[100], dark: AQUA[800] },
  '--dsw-alias-interactive-bg-hover': { light: 'rgba(20, 184, 166, 0.08)', dark: 'rgba(45, 212, 191, 0.10)' },
  '--dsw-alias-interactive-bg-hover-accent': { light: 'rgba(20, 184, 166, 0.16)', dark: 'rgba(45, 212, 191, 0.20)' },
  '--dsw-alias-interactive-bg-active': { light: 'rgba(20, 184, 166, 0.12)', dark: 'rgba(45, 212, 191, 0.16)' },
  // —— 滚动条 / 输入 ——
  '--dsw-alias-scrollbar-bg-l1': { light: AQUA[100], dark: AQUA[800] },
  '--dsw-alias-scrollbar-hover-l1': { light: AQUA[300], dark: AQUA[700] },
  '--dsw-specific-input-major': { light: LIGHT.bgCard, dark: DARK.bgCard },
  '--dsw-specific-selector': { light: LIGHT.bgLayer2, dark: DARK.bgLayer2 },
}

/** 色阶渐变（浅 → 深），顶部色带一眼看清整个水色系。 */
export const AQUA_RAMP = [
  AQUA[50], AQUA[100], AQUA[200], AQUA[300], AQUA[400], AQUA[500],
  AQUA[600], AQUA[700], AQUA[800], AQUA[900], AQUA[950],
]

/** 色板预览数据：分类 + 色项（浅/深两色块并列，一眼看懂类型与明暗）。 */
export const AQUA_SWATCHES = [
  {
    group: '强调色',
    items: [
      { label: '主色', light: AQUA[500], dark: AQUA[400] },
      { label: '深档', light: AQUA[600], dark: AQUA[300] },
      { label: '浅底', light: AQUA[100], dark: AQUA[800] },
    ],
  },
  {
    group: '背景',
    items: [
      { label: '底层', light: LIGHT.bgBase, dark: DARK.bgBase },
      { label: '卡片', light: LIGHT.bgCard, dark: DARK.bgCard },
      { label: '侧栏', light: LIGHT.sidebar, dark: DARK.sidebar },
    ],
  },
  {
    group: '文字',
    items: [
      { label: '主文字', light: LIGHT.textPrimary, dark: DARK.textPrimary },
      { label: '次文字', light: AQUA[700], dark: AQUA[200] },
    ],
  },
  {
    group: '边框',
    items: [
      { label: '边框一', light: 'rgba(20, 184, 166, 0.16)', dark: 'rgba(45, 212, 191, 0.12)' },
      { label: '边框二', light: 'rgba(20, 184, 166, 0.28)', dark: 'rgba(45, 212, 191, 0.22)' },
    ],
  },
  {
    group: '气泡',
    items: [
      { label: '气泡底', light: AQUA[50], dark: AQUA[900] },
      { label: '高亮', light: AQUA[200], dark: AQUA[800] },
    ],
  },
]
