/**
 * DSH 计费估算：token 用量 → 预估费用（人民币）。
 *
 * 价格来源（权威）：
 *  - SCNet（超算互联网）控制台模型列表 API（acx/llm/api/console/model），2026-08-19 抓取。
 *  - DeepSeek 官方（api-docs.deepseek.com）峰谷定价。
 *
 * 计费口径（可验算，与官网一致）：
 *   费用 = 未命中输入(miss) × miss 价 + 缓存命中 × hit 价 + 输出 × output 价
 * 显示的「本轮 tokens」数字（输入/缓存/输出）可直接代入此公式得到官网价格。
 */

/** 价格表（元 / 百万 token），key 为模型 id（小写）。offPeak 与 peak 相同时为固定价。 */
const PRICING = {
  // ===== DeepSeek 官方 =====
  // 注：裸 `deepseek-v4-pro` / `deepseek-v4-flash` 键与下方 SCNet 段重复——
  // JS 对象后写覆盖，原先静默生效的一直是 SCNet 平价；保留后者（当前实价），
  // 不再让两个键抢同一个模型 id。
  // ===== SCNet（超算互联网）权威价格 =====
  // DeepSeek 系（SCNet 平台）
  'deepseek-v4-pro-0813': { offPeak: { cacheHit: 0.9, miss: 9, output: 27 }, peak: { cacheHit: 0.9, miss: 9, output: 27 } },
  'deepseek-v4-flash-0731': { offPeak: { cacheHit: 0.3, miss: 3, output: 9 }, peak: { cacheHit: 0.3, miss: 3, output: 9 } },
  'deepseek-v4-flash': { offPeak: { cacheHit: 0.2, miss: 1, output: 2 }, peak: { cacheHit: 0.2, miss: 1, output: 2 } }, // SCNet 预览版
  'deepseek-v4-pro': { offPeak: { cacheHit: 1, miss: 12, output: 24 }, peak: { cacheHit: 1, miss: 12, output: 24 } }, // SCNet 预览版
  // GLM 系（智谱）
  'glm-5.3': { offPeak: { cacheHit: 2, miss: 8, output: 28 }, peak: { cacheHit: 2, miss: 8, output: 28 } },
  'glm-5.2': { offPeak: { cacheHit: 2, miss: 8, output: 28 }, peak: { cacheHit: 2, miss: 8, output: 28 } },
  'glm-5.1': { offPeak: { cacheHit: 2, miss: 8, output: 28 }, peak: { cacheHit: 2, miss: 8, output: 28 } },
  'glm-5': { offPeak: { cacheHit: 1.5, miss: 6, output: 22 }, peak: { cacheHit: 1.5, miss: 6, output: 22 } },
  'glm-5.2-base': { offPeak: { cacheHit: 1, miss: 4, output: 14 }, peak: { cacheHit: 1, miss: 4, output: 14 } },
  'glm-5.1-base': { offPeak: { cacheHit: 1, miss: 4, output: 14 }, peak: { cacheHit: 1, miss: 4, output: 14 } },
  'glm-5-base': { offPeak: { cacheHit: 0.75, miss: 3, output: 11 }, peak: { cacheHit: 0.75, miss: 3, output: 11 } },
  // Kimi 系（月之暗面）
  'kimi-k3': { offPeak: { cacheHit: 2, miss: 20, output: 100 }, peak: { cacheHit: 2, miss: 20, output: 100 } },
  'kimi-k2.7-code': { offPeak: { cacheHit: 1.3, miss: 6.5, output: 27 }, peak: { cacheHit: 1.3, miss: 6.5, output: 27 } },
  'kimi-k2.6': { offPeak: { cacheHit: 1.3, miss: 6.5, output: 27 }, peak: { cacheHit: 1.3, miss: 6.5, output: 27 } },
  'kimi-k2.5': { offPeak: { cacheHit: 0.7, miss: 4, output: 21 }, peak: { cacheHit: 0.7, miss: 4, output: 21 } },
  'kimi-k2.7-base': { offPeak: { cacheHit: 0.65, miss: 3.25, output: 13.5 }, peak: { cacheHit: 0.65, miss: 3.25, output: 13.5 } },
  // Qwen 系（千问）
  'qwen3.8-max': { offPeak: { cacheHit: 1.5, miss: 12, output: 36 }, peak: { cacheHit: 1.5, miss: 12, output: 36 } },
  'qwen3.7-max': { offPeak: { cacheHit: 2.4, miss: 12, output: 36 }, peak: { cacheHit: 2.4, miss: 12, output: 36 } },
  'qwen3.7-plus': { offPeak: { cacheHit: 1.2, miss: 6, output: 24 }, peak: { cacheHit: 1.2, miss: 6, output: 24 } },
  'qwen3.6-max': { offPeak: { cacheHit: 15, miss: 15, output: 90 }, peak: { cacheHit: 15, miss: 15, output: 90 } },
  'qwen3.6-plus': { offPeak: { cacheHit: 8, miss: 8, output: 48 }, peak: { cacheHit: 8, miss: 8, output: 48 } },
  'qwen3.6-flash': { offPeak: { cacheHit: 4.8, miss: 4.8, output: 28.8 }, peak: { cacheHit: 4.8, miss: 4.8, output: 28.8 } },
  'qwen3.5-122b-a10b': { offPeak: { cacheHit: 0.8, miss: 0.8, output: 6.4 }, peak: { cacheHit: 0.8, miss: 0.8, output: 6.4 } },
  'qwen3.6-27b': { offPeak: { cacheHit: 3, miss: 3, output: 18 }, peak: { cacheHit: 3, miss: 3, output: 18 } },
  'qwen3-235b-a22b': { offPeak: { cacheHit: null, miss: 1, output: 4 }, peak: { cacheHit: null, miss: 1, output: 4 } },
  'qwen3-30b-a3b': { offPeak: { cacheHit: null, miss: 0.375, output: 1.5 }, peak: { cacheHit: null, miss: 0.375, output: 1.5 } },
  // MiniMax 系
  'minimax-m3': { offPeak: { cacheHit: 0.84, miss: 4.2, output: 16.8 }, peak: { cacheHit: 0.84, miss: 4.2, output: 16.8 } },
  'minimax-m2.7': { offPeak: { cacheHit: 0.42, miss: 2.1, output: 8.4 }, peak: { cacheHit: 0.42, miss: 2.1, output: 8.4 } },
  'minimax-m2.5': { offPeak: { cacheHit: 0.21, miss: 2.1, output: 8.4 }, peak: { cacheHit: 0.21, miss: 2.1, output: 8.4 } },
  // MiMo 系（小米）
  'mimo-v2.5-pro': { offPeak: { cacheHit: 1.4, miss: 7, output: 21 }, peak: { cacheHit: 1.4, miss: 7, output: 21 } },
}

/** 默认计费模型（无匹配价格时回退）。 */
const DEFAULT_MODEL = 'deepseek-v4-pro'

/** 北京时间（UTC+8）当前是否处于高峰时段。 */
export function isPeakHour(now = Date.now()) {
  const h = new Date(now + 8 * 3600000).getUTCHours()
  return (h >= 9 && h < 12) || (h >= 14 && h < 18)
}

/** 安全取值：非负有限数，否则 0。 */
function num(v) {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0
}

/** 按模型 id 解析价格档：精确匹配 → 「模型 id 以表内 key 为前缀」最长者
 *  （deepseek-v4-flash-vision-exp → deepseek-v4-flash）→ 回退默认档。
 *  未知模型仍按 deepseek-v4-pro 估（近似而非报错），文档化兜底。 */
export function tierOf(modelId) {
  const id = String(modelId ?? '').toLowerCase()
  const key = PRICING[id] !== undefined ? id
    : Object.keys(PRICING).filter((k) => id.startsWith(k)).sort((a, b) => b.length - a.length)[0] ?? DEFAULT_MODEL
  const model = PRICING[key] ?? PRICING[DEFAULT_MODEL]
  const tier = isPeakHour() ? model.peak : model.offPeak
  return {
    miss: num(tier.miss),
    cacheHit: num(tier.cacheHit),
    output: num(tier.output),
  }
}

/**
 * 估算累计费用（元）。usage 支持 tokenUsage 投影。
 * @param usage - token 用量（uncachedInputTokens / cacheReadTokens / cacheWriteTokens / outputTokens）。
 * @param modelId - 当前模型 id（用于选价；缺省用默认）。
 * @returns 预估费用（非负元）。
 */
export function estimateCost(usage, modelId) {
  if (usage === undefined || usage === null) return 0
  const tier = tierOf(modelId)
  const uncached = (num(usage.uncachedInputTokens) + num(usage.cacheWriteTokens)) / 1e6
  const cached = num(usage.cacheReadTokens) / 1e6
  const output = num(usage.outputTokens) / 1e6
  return uncached * tier.miss + cached * tier.cacheHit + output * tier.output
}

/**
 * 由单步/本轮 usage 估算费用（元）。
 * @param usage - 形如 { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens }。
 * @param modelId - 当前模型 id。
 * @returns 预估费用（非负元）。
 */
export function estimateTurnCost(usage, modelId) {
  if (usage === undefined || usage === null) return 0
  const tier = tierOf(modelId)
  const input = (num(usage.inputTokens) + num(usage.cacheWriteTokens)) / 1e6
  const cached = num(usage.cacheReadTokens) / 1e6
  const output = num(usage.outputTokens) / 1e6
  return input * tier.miss + cached * tier.cacheHit + output * tier.output
}

/**
 * 格式化费用：小于 0.01 元保留 4 位小数，否则保留 2 位。
 * @param yuan - 费用（元）。
 * @returns 显示字符串（带 ¥ 前缀）。
 */
export function formatCost(yuan) {
  if (!(yuan > 0)) return '¥0'
  if (yuan < 0.01) return '¥' + yuan.toFixed(4)
  return '¥' + yuan.toFixed(2)
}
