# dsh-welcome-typewriter

DeepSeek Harness（DSH）首页**打字机欢迎语**插件：进入首页时，把 hero 区默认标题「探索未至之境」替换为一条**逐字打出**的随机问候语，并带闪烁光标。

## 效果

- **逐字打字**：90ms/字，右侧跟随闪烁光标。
- **三档彩蛋池**：
  - 常规（80%）：14 条日常问候语，普通前景色。
  - 金色稀有（15%）：6 条金色渐变文字 + 金色光标。
  - 彩虹传说（5%）：5 条彩虹流动渐变文字 + 紫色光标（停止闪烁，全场焦点）。
- **自动回挂**：首页 hero 会随路由卸载重建，插件每 1.2s 兜底检查一次，回到首页立刻重新打字。
- **零配置**：装上即用，无设置项；卸载/热重载自动还原原标题，不残留 DOM。

## 安装

```sh
dsh plugin add ./dsh-welcome-typewriter
```

其余接入方式（profile 声明式挂载、super-injector 热装配）见 [INSTALL.md](INSTALL.md)。

## 词库自定义

欢迎语在 `src/client/index.js` 顶部的 `WELCOME_POOLS` 里，分 `common` / `rare` / `legendary` 三档，直接增删字符串即可，改完重载插件生效。出货概率在 `rollWelcome()` 里（默认 80/15/5）。

## 技术要点

- 纯浏览器半（client half），无内核侧逻辑；host 入口为最小 `apply()` 桩。
- 生命周期收进 `ctx.effect`：卸载即停轮询、移除 anchor、还原标题 span、摘掉样式标签。
- 不改主题 token、不动官方 DOM 结构——只在原「探索未至之境」span 旁插入替换节点。
- `src/` 为可读 ESM 源，`lib/` 为运行时产物（DSH client 装载器包装格式），两者等价、无需构建。

## 兼容

- 已在官方桌面端内核 `0.1.7-rc.2`（Desktop 0.19.x）实测运行。
- 理论上 `0.1.x` 系皆可（只依赖 DOM 与 `ctx.effect`）；若官方改版 hero 文案导致不触发，检查 `injectWelcome` 里定位用的标题文本「探索未至之境」是否仍是默认值。

## License

MIT
