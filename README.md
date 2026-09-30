# dsh-plugins

[DeepSeek Harness（DSH）](https://github.com/deepseek-ai) 插件合集 —— 收录 **自建插件** 与部分优秀 **DSH 社区插件**（镜像存档，版权归原作者，更新请以各 Upstream 仓库为准）。

所有插件均可独立安装：

```sh
dsh plugin add <插件目录或 git 仓库地址>
```

> 部分插件依赖具体 DSH 版本的注入点，安装前请看各插件 README 的兼容性说明。

## 自建插件（Original）

| 插件 | 说明 | License |
|---|---|---|
| [dsh-text-appearance](./dsh-text-appearance) | 思考内容与正文分别调节字体 / HSL 颜色 / 字号 | MIT |
| [dsh-deepseek-web-bridge](./dsh-deepseek-web-bridge) | 反代本机 ds-free-api，让 OpenAI 兼容客户端直通 chat.deepseek.com 网页端 | MIT |
| [dsh-llm-webfree](./dsh-llm-webfree) | ⚠️ 已废弃（loader 链冲突），被 web-bridge 取代，保留供研究 | MIT |
| [dsh-client-ui-aqua](./dsh-client-ui-aqua) | Aqua 水色主题整站换肤，设置页带色板预览 | MIT |
| [dsh-composer-bottom-seal](./dsh-composer-bottom-seal) | 收起输入区底部间隙，壁纸不再漏底 | MIT |
| [dsh-computer-use](./dsh-computer-use) | 虚拟光标 Computer Use：AI 以真人方式看屏操作电脑（11 个工具 + 安全护栏） | MIT |
| [dsh-context-menu](./dsh-context-menu) | 补全 Electron 桌面版缺失的右键菜单（粘贴/复制/撤销…） | MIT |
| [dsh-debugger](./dsh-debugger) | 会话错误扫描、健康检查、事件检视、失败轮次上下文重放 | BSD-3 |
| [dsh-welcome-typewriter](./dsh-welcome-typewriter) | 首页欢迎语打字机：随机词库 + 稀有/传说彩蛋档位 | MIT |
| [dsh-permissions](./dsh-permissions) | 四级权限规则引擎 + 可视化编辑器 | MIT |
| [dsh-plugin-tts](./dsh-plugin-tts) | Edge TTS 逐条朗读 + 自动朗读开关 + RVC 变声服务 | MIT |
| [dsh-quick-replies](./dsh-quick-replies) | 输入框上方快捷语 chips，一键发送常用语 | MIT |
| [dsh-token-cost](./dsh-token-cost) | 实时显示本次对话 token 估算费用（DeepSeek 峰谷定价） | MIT |

## 社区收录（Community mirrors）

以下插件来自 DSH 社区各作者，此处为本地镜像存档；bug 反馈与贡献请到对应 Upstream。

| 插件 | 说明 | 作者 / Upstream | License |
|---|---|---|---|
| [dsh-checkpoint-rewind](./dsh-checkpoint-rewind) | 变更前 git-first 快照，`/rewind` 一键回退文件与会话 | [PerryLink/dsh-checkpoint-rewind](https://github.com/PerryLink/dsh-checkpoint-rewind) | Apache-2.0 |
| [dsh-notifier](./dsh-notifier) | 统一通知：27 种渠道 + 远程审批 + Web 管理台 | [THEWOLFWALKER/dsh-notifier](https://github.com/THEWOLFWALKER/dsh-notifier) | MIT |
| [dsh-mobile-gate](./dsh-mobile-gate) | 局域网手机访问网关：首次审批 + 设备令牌 + 限流 | [Bernardxu123/dsh-mobile-gate](https://github.com/Bernardxu123/dsh-mobile-gate) | MIT |
| [dsh-message-rail](./dsh-message-rail) | 左侧消息导航轨道：刻度定位 + 悬停预览 + 点击跳转 | [wx-yss/dsh-message-rail](https://github.com/wx-yss/dsh-message-rail) | MIT |
| [dsh-shortcuts](./dsh-shortcuts) | 全键盘快捷键系统：34 个功能位 + 录制自定义绑定 | [Ricketts-Guo/dsh-shortcuts](https://github.com/Ricketts-Guo/dsh-shortcuts) | MIT |
| [dsh-composer-expand](./dsh-composer-expand) | 输入框一键切换默认高度 / 70vh 书写视图 | [13071301808/dsh-composer-expand](https://github.com/13071301808/dsh-composer-expand) | MIT |
| [dsh-monitor](./dsh-monitor) | 对 NDJSON 文件 / shell 命令布防持久 watcher 唤醒会话 | [AbnerAI/dsh-monitor](https://github.com/AbnerAI/dsh-monitor) | MIT |
| [dsh-usage-stats](./dsh-usage-stats) | GitHub 风格 53 周用量热力图 + Token/余额看板 | [Make0209/dsh-usage-stats](https://github.com/Make0209/dsh-usage-stats) | MIT |
| [dsh-voice-input](./dsh-voice-input) | 浏览器本地语音识别填入输入框，支持自动发送 | [NewDaNew/dsh-voice-input](https://github.com/NewDaNew/dsh-voice-input) | MIT |
| [community/dsh-composer-history](./community/dsh-composer-history) | 终端式输入历史召回 + Ctrl+R 反查 + 片段模板库 | [PerryLink/dsh-composer-history](https://github.com/PerryLink/dsh-composer-history) | Apache-2.0 |
| [community/dsh-file-upload](./community/dsh-file-upload) | 拖拽/粘贴上传附件卡 + MarkItDown 20+ 格式转 Markdown | [HongMing-Huang/dsh-file-upload](https://github.com/HongMing-Huang/dsh-file-upload) | MIT |
| [community/dsh-market](./community/dsh-market) | 内置可视化插件市场：浏览 1250+ 社区插件一键安装 | [dsh-market/dsh-market](https://github.com/dsh-market/dsh-market) | MIT |
| [community/dsh-subagent-monitor](./community/dsh-subagent-monitor) | 浮动面板实时展示子代理运行状态与耗时 | [Mombrane/dsh-subagent-monitor](https://github.com/Mombrane/dsh-subagent-monitor) | MIT |
| [community/dsh-spotlight](./community/dsh-spotlight) | ⌘K 命令面板：模糊搜索命令、会话与设置项 | 见目录内 package.json | MIT |
| [community/dsh-vision-tool](./community/dsh-vision-tool) | `view_image` 视觉兜底：图片转发给任意 OpenAI 兼容 VLM | 见目录内 package.json | BSD-3 |

## 目录结构

```
dsh-plugins/
├── <plugin>/            # 自建与社区插件平铺存放
└── community/<plugin>/  # 社区协作风格提交的插件
```

## 附属脚本

- [ds-tls-relay.js](./ds-tls-relay.js) — 独立运行的 TLS 中继（22219），供 ds-free-api / webfree 通道使用；非 DSH 插件，`node ds-tls-relay.js` 直接启动。

## License

顶层 LICENSE 为合集内自建插件的 MIT 许可。社区收录插件以各自目录内的 LICENSE 及其上游声明为准，版权归各自作者所有。
