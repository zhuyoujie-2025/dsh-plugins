# dsh-token-cost

DeepSeek Harness（DSH）费用预估插件：在**对话输入区上方**实时显示本次对话的 token 消耗**预估费用**（人民币），随对话推进自动更新。

## 功能

- **实时预估费用**：读取框架 session projection `tokenUsage`（本次对话累计的输入/输出/缓存命中 token），按 DeepSeek 官方定价折算成人民币，显示在 composer 统计行旁（`conversation.composer.dock`）。
- **峰谷定价**：内置 2026-08-17 起生效的峰谷价——高峰时段（北京时间 9:00-12:00、14:00-18:00）自动用高峰价并显示「高峰」标记，其余时段用空闲价。
- **零依赖、纯客户端**：token 用量来自框架已内置的 `tokenUsage` projection，不写会话日志、不污染模型输入、不需要 API Key。

## 计费口径

费用 = 缓存未命中输入 × miss 价 + 缓存命中输入 × hit 价 + 输出 × output 价（元 / 百万 token）。

内置价格表（`src/client/cost.js`，改价格改这里即可）：

| 模型 | 时段 | 缓存命中 | 缓存未命中 | 输出 |
|---|---|---|---|---|
| deepseek-v4-pro | 空闲 | 0.15 | 4.5 | 13.5 |
| deepseek-v4-pro | 高峰 | 0.30 | 9.0 | 27.0 |
| deepseek-v4-flash | 空闲 | 0.05 | 1.5 | 4.5 |
| deepseek-v4-flash | 高峰 | 0.10 | 3.0 | 9.0 |

> 价格来源：[DeepSeek API Docs — 模型 & 价格](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/)。DeepSeek 官方会不定期调价，请以官方页面为准。

## 安装

```sh
dsh plugin add ./dsh-token-cost
```

或通过 dsh-super-injector 热装配（免重启）。安装后刷新页面，进入任意会话即可在输入区上方看到「预估费用 ¥…」。

## 为什么需要

DSH 框架自带的 `StatsLine` 已经显示本次对话的 token 数（输入/输出、缓存命中率），但**没有折算成费用**。本插件补上这一环——直接复用框架的 `tokenUsage` projection，不重复造轮子。

## License

MIT
