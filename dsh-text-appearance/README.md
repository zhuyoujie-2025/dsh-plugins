# dsh-text-appearance

DeepSeek Harness（DSH）文字外观插件：在「设置 → 通用」里分别调节「思考内容」与「正文输出」的**字体、颜色、字号**。

## 功能

- **字体**：默认 / 系统 / 微软雅黑 / 苹方 / 宋体 / 黑体 / 楷体 / Georgia 衬线 / Consolas 等宽
- **颜色**：三条滑块（完整 HSL）——色相条选颜色、饱和度条选灰↔纯色、明度条选黑↔白深浅；覆盖黑/白/灰 + 彩色 + 深浅，拖动连续顺滑不跳变，左侧色块实时预览
- **大小**：12–28px 字号滑块

## 特性

- **自包含**：字体与正文颜色/字号通过 CSS 覆盖实现（`[data-variant="think"]` 定位思考内容、`[class*="_markdown"]` 定位正文），不依赖任何官方代码修改
- 颜色/字号复用官方 `theme` 服务（`--dsh-thinking-*` / `--dsh-body-*` token）
- 设置持久化到 `localStorage`，浏览器与 Electron 桌面版均生效

## 安装

```sh
dsh plugin add <本目录或 git 仓库地址>
```

或手动：把本包加入 profile 的 `dsh.profile.bundles`，构建 `lib/` 后重启 `dsh web`。

## 构建

```sh
npm install
npm run build   # tsdown → lib/index.js + lib/client.js
```

## 说明

本插件替代内置的「文字外观」设置（原生颜色选择器版本）。若你的环境同时显示旧版「文字外观」，可移除 `ui-theme` 插件里的 `ThinkingColorRow` 注册。
