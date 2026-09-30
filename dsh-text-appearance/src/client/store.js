/**
 * 文字外观 slot store：镜像思考/正文的 HSL（色相/饱和度/明度）+ 字号 + 字体。
 * 三个颜色维度由滑块直接写入（连续，不跳变）；颜色写穿到 theme service。
 */
import { defineStore } from '@deepseek-ai/dsh-client-runtime/client'

/** 声明文字外观行的状态与写入口。 */
export function createTextAppearanceStore() {
  return defineStore({
    init: () => ({
      thinkingHue: 0, thinkingSaturation: 100, thinkingLightness: 50, thinkingSize: '', thinkingFont: '',
      bodyHue: 0, bodySaturation: 0, bodyLightness: 50, bodySize: '', bodyFont: '',
      revision: -1,
    }),
    actions: {
      /**
       * 全量 sync：含 HSL。仅用于初始化（store.revision === -1）与用户从 UI 清空
       * 颜色（sync 时 snapshot.thinkingColor === '' 触发 reset echo）。
       */
      sync: (d, thinkingHue, thinkingSaturation, thinkingLightness, thinkingSize, thinkingFont, bodyHue, bodySaturation, bodyLightness, bodySize, bodyFont, revision) => {
        if (revision <= d.revision) return
        d.thinkingHue = thinkingHue
        d.thinkingSaturation = thinkingSaturation
        d.thinkingLightness = thinkingLightness
        d.thinkingSize = thinkingSize
        d.thinkingFont = thinkingFont
        d.bodyHue = bodyHue
        d.bodySaturation = bodySaturation
        d.bodyLightness = bodyLightness
        d.bodySize = bodySize
        d.bodyFont = bodyFont
        d.revision = revision
      },
      /**
       * Metadata-only sync：只覆盖 font/size/revision，不动 HSL。
       *
       * 用于 server 串行 ack 触发的 theme/change 回调——此时 HSL 已经由 setThinkingHsl
       * / setBodyHsl 在用户拖动时立即写入本地 store，再用 cssToHsl(round-trip) 覆盖
       * 会把 server FIFO 处理中间值回写，产生"跳过去跳回去"。
       */
      syncMetadata: (d, thinkingSize, thinkingFont, bodySize, bodyFont, revision) => {
        if (revision <= d.revision) return
        d.thinkingSize = thinkingSize
        d.thinkingFont = thinkingFont
        d.bodySize = bodySize
        d.bodyFont = bodyFont
        d.revision = revision
      },
      setThinkingHsl: (d, hue, saturation, lightness) => {
        d.thinkingHue = hue
        d.thinkingSaturation = saturation
        d.thinkingLightness = lightness
      },
      setBodyHsl: (d, hue, saturation, lightness) => {
        d.bodyHue = hue
        d.bodySaturation = saturation
        d.bodyLightness = lightness
      },
      setFonts: (d, thinkingFont, bodyFont) => {
        d.thinkingFont = thinkingFont
        d.bodyFont = bodyFont
      },
    },
  })
}

/**
 * 同步元数据（font / size / revision）但保留本地 HSL 不动。
 *
 * 用途：theme/change 事件回调（server 串行 ack 触发的同步）只会覆盖 font/size
 * 和 revision；HSL 由 setThinkingHsl / setBodyHsl 独占控制。
 * 避免 server FIFO 串行 ack 把中间旧值回写到 UI 造成"跳过去跳回去"。
 *
 * 全量 sync（init 用一次）见原 `sync` action。
 */
