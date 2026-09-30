# dsh-client-ui-aqua

DeepSeek Harness（DSH）水色主题插件：一键把整套界面**整体换肤**成水色（Aqua / 青绿），浅色与深色各给一套配色，并在「设置 → 通用」里带**色板预览**，一眼看清所有颜色与类型。

## 功能

- **整体换肤**：打开开关即覆盖整套 `--dsw-alias-*` / `--dsw-specific-*` token——背景（底层/卡片/侧栏）、文字（主/次/弱）、边框、强调色（品牌蓝→水色）、气泡、交互悬停底色、滚动条、输入区，共 29 个 token 全部换成水色阶。
- **盖掉壁纸**：开启同时把 `--dsh-wallpaper-image` 覆盖成 `none`，隐藏对话栏壁纸（露出水色纯底）；关闭即撤层，壁纸（默认或自定义）完整恢复。
- **浅深两套值**：每个 token 同时提供 `light` / `dark` 两套值，切换明暗主题后水色依旧清晰、对比度足够。
- **色板预览**：设置行内置「水色阶渐变条（浅→深）」+「分类色块（强调色/背景/文字/边框/气泡，浅深并列）」，不开启也能一眼看懂 aqua 主题长什么样。
- **一键开关，关掉即恢复**：开启覆盖默认蓝/灰白，关闭撤掉覆盖层、完整恢复原样；状态持久化到 `localStorage`，刷新/重启不丢；覆盖层随插件卸载自动清理。

## 为什么需要

DSH 内置「外观」行只有浅色 / 深色 / 跟随系统三种，无法换强调色、更无法整体换肤。本插件走官方 `theme` 服务的 `overrideTokens` 扩展点（token 覆盖层），只替换 `--dsw-*` token、不碰 DOM、不替换主题系统，开关即生效、关闭即恢复。

## 安装

```sh
dsh plugin add ./dsh-client-ui-aqua
```

或通过 dsh-super-injector 热装配（免重启）。安装后打开「设置 → 通用」，找到「Aqua 水色主题」，打开开关即可整体换肤；色板预览始终可见。

## 技术要点

- 复用官方 `theme` 服务（`overrideTokens`），覆盖层来源标识与包名一致（`dsh-client-ui-aqua`）。
- 覆盖 token 列表与色板数据见 [`src/client/tokens.js`](src/client/tokens.js)。
- 开关状态通过 `localStorage` 键 `dsh:aqua-theme-enabled` 持久化。

## License

MIT
