# dsh-quick-replies

DeepSeek Harness（DSH）快捷语插件：在对话输入框上方显示一排可点击的快捷语
chip，点击即把该短语作为消息发送到当前会话。

## 功能

- **直接显示的快捷语**（默认三条，最多 3 条）：常驻显示在输入框上方，
  在设置里可编辑文字、取消置顶、删除；chip 平分输入框宽度均匀分布，
  长短文字自适应（超长省略号）。
- **「更多」按钮**：向上弹出面板，展开 `更多快捷语` 组；面板空时给出
  去设置添加的提示。
- **设置 → 快捷语**：新增设置页，管理两组短语（直接显示 / 更多），支持
  添加、行内编辑、置顶/取消置顶、删除；新添加的默认进「更多」组；置顶
  组满 3 条时置顶按钮自动禁用。
- **每条快捷语最多 15 个字符**（输入框 maxlength + store 层截断双保险）。
- 点击 chip 直接发送（`conversation.send`，queue 模式）；发送独立于输入框
  草稿，草稿不会被清掉。行尾有「已发送 ✓ / 发送失败 ✗」短提示。

## 数据

浏览器 localStorage，key `dsh.quick-replies.v1`：

```json
{ "pinned": [{ "id": "q...", "text": "继续" }], "extra": [] }
```

## 技术说明

- UI 挂载点：`conversation.input.dock`（输入框卡片上方的独占行，目标条 /
  排队行同款座位），order 30 紧贴输入卡片。
- 设置页挂载点：`settings.section`（order 25）。
- 发送路径：register 的 `inject` thunk 收到 `sessionId`，在
  `ctx.sessions.scope(sessionId)` 上取 `conversation` 服务调用
  `send(text)`（与官方 QueueDock 同款作用域寻址）。
- 样式：`<style data-plugin-css>` 注入，跟随主题文字色的中性描边 pill。

## 安装

```sh
dsh plugin --profile web add <本目录>
```

或手动把本包加入 profile 的 `dsh.profile.bundles`，重启 `dsh web` 后在
「设置 → 快捷语」里管理你的短语。状态保存在浏览器 localStorage，
Web 与 Electron 桌面版均可用。

## 构建

```bash
pnpm install --ignore-scripts
pnpm build   # 产出 lib/index.js 与 lib/client.js（ModuleLoader 包装）
pnpm test    # Node 内置 test runner 的 store 回归测试
```
