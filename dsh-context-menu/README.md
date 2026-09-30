# dsh-context-menu

DeepSeek Harness 文本框右键菜单插件：在输入框（`textarea` / 文本 `input` / `contenteditable` / `role=textbox`）上点击鼠标右键，弹出「粘贴 / 剪切 / 复制 / 全选 / 撤销 / 重做」菜单。

浏览器（Web GUI）与 Electron 桌面版均生效，解决桌面版默认无原生右键菜单的问题。

## 安装

将本包加入 profile 的 `dsh.profile.bundles`（或使用注入器安装到 web profile），构建出 `lib/` 后重启 `dsh web` 即可，默认启用。

## 实现

- 纯 client 端 DOM 实现，不依赖任何 harness 服务。
- `capture` 阶段监听全局 `contextmenu`，先于 apps/web 的右键抑制脚本执行；仅当目标落在可编辑元素内时拦截并显示自定义菜单，其余区域行为不变。
- 粘贴走 `navigator.clipboard.readText()` + `execCommand('insertText')`，React 受控组件可正确感知。
- 卸载时移除监听、菜单与注入的 `<style>` 标签。

## 构建

```sh
npm install
npm run build   # tsdown → lib/index.js + lib/client.js
```
