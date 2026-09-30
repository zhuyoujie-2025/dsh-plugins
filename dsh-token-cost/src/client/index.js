/**
 * dsh-token-cost — client half（浏览器半）。
 *
 * 在对话输入区上方（`conversation.composer.dock`，与框架自带的 StatsLine
 * 统计行并列）注册一行「预估费用」：读取 session projection `tokenUsage`
 * （本次对话累计 token，框架 token-meter 提供），按 DeepSeek 峰谷定价估算
 * 人民币费用，实时随对话更新。纯展示，不写会话日志、不污染模型输入。
 */
import { createElement } from 'react'
import { estimateCost, formatCost, isPeakHour } from './cost.js'

export const inject = ['slots', 'locale']

const ID = 'dsh-token-cost'

const ZH = {
  cost: '预估费用',
  peak: '高峰',
}
const EN = {
  cost: 'Est. cost',
  peak: 'peak',
}

const CSS = [
  '.tcost-line { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; line-height: 1; white-space: nowrap; }',
  '.tcost-label { opacity: .72; }',
  '.tcost-value { font-variant-numeric: tabular-nums; font-weight: 600; }',
  '.tcost-peak { opacity: .6; font-size: 11px; }',
].join('\n')

function injectStyle() {
  const tagId = ID + '/cost.css'
  if (document.querySelector('style[data-plugin-css="' + tagId + '"]') === null) {
    const tag = document.createElement('style')
    tag.dataset.plugin = ID
    tag.dataset.pluginCss = tagId
    tag.textContent = CSS
    document.head.appendChild(tag)
  }
}

/** 费用行组件：读 tokenUsage projection，展示预估费用（无数据时返回 null）。 */
function CostLine({ useProjection, t }) {
  const usage = useProjection('tokenUsage')
  const selection = useProjection('modelSelection')
  if (usage === undefined || usage === null) return null
  // 当前生效模型：pending/next 选择优先于 lastUsed（投影形状见
  // dsh-api-session-controller 的 modelSelectionProjectionSchema）。
  const modelId = selection?.next?.model ?? selection?.pending?.model ?? selection?.lastUsed?.model
  const cost = estimateCost(usage, modelId)
  if (!(cost > 0)) return null
  return createElement('div', { className: 'tcost-line' },
    createElement('span', { className: 'tcost-label' }, t('cost')),
    createElement('span', { className: 'tcost-value' }, formatCost(cost)),
    isPeakHour() ? createElement('span', { className: 'tcost-peak' }, '· ' + t('peak')) : null,
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

  ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
    name: 'conversation.composer.dock',
    id: 'token-cost',
    order: 1,
    locale: ID,
  }, CostLine))
}
