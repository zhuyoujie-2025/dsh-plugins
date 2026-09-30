/**
 * 颜色工具：完整 HSL 模型（色相 hue + 饱和度 saturation + 明度 lightness）。
 * - 色相条选颜色（红橙黄绿青蓝紫连续）
 * - 饱和度条选灰 ↔ 纯色（0% 灰、100% 纯色）
 * - 明度条选深浅（0% 黑、50% 纯色、100% 白）
 * 三条组合覆盖黑/白/灰 + 彩色 + 深浅；所有转换连续，无离散跳变。
 */

/** 色相条背景渐变：永远纯色彩虹（红橙黄绿青蓝紫），一眼看到所有颜色。 */
export function hueGradient() {
  return 'linear-gradient(to right, hsl(0,100%,50%), hsl(60,100%,50%), hsl(120,100%,50%), hsl(180,100%,50%), hsl(240,100%,50%), hsl(300,100%,50%), hsl(360,100%,50%))'
}

/** 饱和度条背景渐变（灰 → 纯色，按当前色相/明度）。 */
export function saturationGradient(hue, lightness) {
  const h = clampHueForCss(hue)
  const l = clamp(lightness)
  return `linear-gradient(to right, hsl(${h},0%,${l}%), hsl(${h},100%,${l}%))`
}

/** 明度条背景渐变（黑 → 纯色 → 白，按当前色相/饱和度）。 */
export function lightnessGradient(hue, saturation) {
  const h = clampHueForCss(hue)
  const s = clamp(saturation)
  return `linear-gradient(to right, hsl(${h},${s}%,0%), hsl(${h},${s}%,50%), hsl(${h},${s}%,100%))`
}

/**
 * hue + saturation + lightness → CSS 颜色。
 *
 * CSS 的 hsl() 接受任意实数 hue（360 与 0 等价，720 与 0 等价）；
 * 我们不在生成侧做归一化——保留用户拖到的精确 hue（包括 360），
 * 解析侧 cssToHsl 会自己 round 到 [0,360) 整数。
 */
export function hslToCss(hue, saturation, lightness) {
  return `hsl(${roundHue(hue)}, ${clamp(saturation)}%, ${clamp(lightness)}%)`
}

/** CSS 颜色 → { hue, saturation, lightness }，解析失败回退默认灰。 */
export function cssToHsl(color) {
  const rgb = parseRgb(color)
  if (rgb === null) return { hue: 0, saturation: 0, lightness: 50 }
  return rgbToHsl(rgb[0], rgb[1], rgb[2])
}

function normHue(hue) {
  return ((Math.round(hue) % 360) + 360) % 360
}
/** 生成 CSS 时只要"非负整数"，不强制归一化到 [0,360)——避免 hue=360 被写成 0 导致 thumb 跳到最左。 */
function roundHue(hue) {
  return Math.max(0, Math.round(hue))
}
function clampHueForCss(hue) {
  return Math.max(0, Math.round(hue))
}
function clamp(v) {
  return Math.max(0, Math.min(100, Math.round(v)))
}

function rgbToHsl(r, g, b) {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  const d = max - min
  let h = 0
  let s = 0
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1))
    if (max === rn) h = ((gn - bn) / d) % 6
    else if (max === gn) h = (bn - rn) / d + 2
    else h = (rn - gn) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return { hue: Math.round(h), saturation: Math.round(s * 100), lightness: Math.round(l * 100) }
}

/** 解析 #rrggbb / rgb() / hsl() 为 RGB 三元组（0-255），失败返回 null。 */
function parseRgb(color) {
  if (typeof color !== 'string') return null
  const c = color.trim()
  const hex = /^#?([0-9a-f]{6})$/i.exec(c)
  if (hex) {
    return [
      parseInt(hex[1].slice(0, 2), 16),
      parseInt(hex[1].slice(2, 4), 16),
      parseInt(hex[1].slice(4, 6), 16),
    ]
  }
  const rgb = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(c)
  if (rgb) {
    return [+rgb[1], +rgb[2], +rgb[3]]
  }
  const hsl = /hsla?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)%\s*,\s*(\d+(?:\.\d+)?)%/i.exec(c)
  if (hsl) {
    return hslToRgb(+hsl[1], +hsl[2] / 100, +hsl[3] / 100)
  }
  return null
}

function hslToRgb(h, s, l) {
  const hue = ((h % 360) + 360) % 360 / 360
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const f = (t) => {
    let v = t
    if (v < 0) v += 1
    if (v > 1) v -= 1
    if (v < 1 / 6) return p + (q - p) * 6 * v
    if (v < 1 / 2) return q
    if (v < 2 / 3) return p + (q - p) * (2 / 3 - v) * 6
    return p
  }
  return [
    Math.round(f(hue + 1 / 3) * 255),
    Math.round(f(hue) * 255),
    Math.round(f(hue - 1 / 3) * 255),
  ]
}
