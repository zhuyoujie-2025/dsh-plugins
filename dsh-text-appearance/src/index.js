/**
 * dsh-text-appearance — host half.
 *
 * 浏览器半拥有全部 UI（文字外观设置行：字体/颜色/字号）。这里无需注册
 * 任何命令/服务/会话钩子，但 bundle 清单要求 lib/index.js 存在，故此文件
 * 是一个最小 apply() 桩。
 */
export function apply() {
  // no-op: 客户端半自包含。
}
