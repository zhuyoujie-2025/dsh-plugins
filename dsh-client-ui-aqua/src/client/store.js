/**
 * Aqua 开关 slot store：仅一个布尔 enabled，镜像「水色主题是否开启」。
 * 实际 token 覆盖层的挂载/卸载由 client/index.js 的注入回调负责，
 * 本 store 只负责驱动开关 UI 的重渲染。
 */
import { defineStore } from '@deepseek-ai/dsh-client-runtime/client'

/** 声明 Aqua 开关行的状态与写入口。 */
export function createAquaStore() {
  return defineStore({
    init: () => ({ enabled: false }),
    actions: {
      setEnabled: (d, enabled) => { d.enabled = enabled },
    },
  })
}
