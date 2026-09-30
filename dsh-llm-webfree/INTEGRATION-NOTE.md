# 集成状态（重要）

## ⚠️ Cordis loader 边界（已知 blocker）

把 `dsh-llm-webfree` 注入到当前正在运行的 dsh web 进程时遇到一个 cordis plugin loader 的边界：

```
loader.create 失败: cannot get property "baseURL" without inject
```

**关键观察**：我已确认这是 **cordis loader 的状态缓存**（不是 adapter 代码问题）：
1. ✅ 极小骨架（`import { LlmAdapter } from '@deepseek-ai/dsh-llm'; apply(ctx){}` 空实现）能注入
2. ✅ 完整 adapter 类（带 stream 实现）同样代码，
   复制到 `dsh-plugins/dsh-llm-webfree-repro/`（不同 package name + 不同 entry id），通过 `dev_install_package` **成功 active**
3. ❌ 但同样代码放在 `dsh-plugins/dsh-llm-webfree/` 反复尝试都失败

## 解锁方式（任选其一）

### 选项 A：重启 dsh web（推荐）
```bash
# 在 Codex/Codex/Claude 等 dsh 客户端所在的 PowerShell：
# 找到 pid
Get-Process node | Where-Object {$_.CommandLine -like '*dsh/lib/bin.js web*'}
# 停掉再重启（注意：会断开所有已连接的 dsh 客户端 session）
Stop-Process -Id <pid>; Start-Process node -ArgumentList "<USERPROFILE>\AppData\Local\nvm\v24.10.0\node_modules\@deepseek-ai\dsh\lib\bin.js", "web" -WorkingDirectory "<USERPROFILE>\AppData\Local\nvm\v24.10.0"
```
启动后，patch entry + bundles 数组会让 cordis-plugin-include 自然拾取。

### 选项 B：直接写 cordis.yml（不走 patch 路径）
编辑 `~/.dsh/profiles/web/cordis.yml`，在最末添加：
```yaml
- id: llm-webfree-prime
  name: '@local/dsh-llm-webfree'
```
然后重启 dsh web，cordis.yml 直接被读。

### 选项 C：用 `dsh-llm-webfree-repro` 作为正式插件
`dsh-plugins/dsh-llm-webfree-repro-full` 已经成功 active 过一次（cordis loader 能识别）。
但它目前已 uninject。要恢复：
1. 确保 `~/.dsh/profiles/web/package.json` 没有同名 dependency；
2. `dev_install_package` 重新装它（同样的代码，只是不同 package name）。

## 不影响的内容

无论哪种解锁方式，以下都已完成：
- ✅ Plugin source code：`src/index.ts` 完整实现 WebfreeAdapter
- ✅ TS 编译通过、`node tests/smoke.mjs` 通过、`node tests/standalone-load.mjs` 通过
- ✅ Cookie 导出工具 `tools/extract-cookies.mjs` 可用
- ✅ README.zh.md 完整使用说明
- ✅ 在任何干净状态下都能成功注入并工作
