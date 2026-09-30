# dsh-deepseek-web-bridge — DSH → ds-free-api → chat.deepseek.com 直通

DSH host 插件：在 DSH 主 webserver 上注册 `/v1/models`、`/v1/chat/completions`（SSE 流式）、`/deepseek-webfree/health` 三条路由，反向代理到本机 ds-free-api，让任意 OpenAI 兼容客户端直通 chat.deepseek.com 网页端。

安装：把本目录加入 profile 的 bundle（`dsh.plugin add` 或手动加 `node_modules` symlink + patch.yml），重启 `dsh web` 后生效。上游 Key 通过环境变量 `DSH_DSFREE_UPSTREAM_KEY` 注入，不要硬编码进代码。上游地址可用 `DSH_DSFREE_UPSTREAM` 覆盖。

## 最终状态（2026-08-17 02:30 ET）

| 组件 | 状态 | 进程 / 端口 |
|---|---|---|
| chat.deepseek.com 网页端 | ✅ 已登录（本地账号） | — |
| ds-free-api v0.2.6 | ✅ API Key 鉴权 + 流式 | PID 9048 / 22217 |
| dsh web | ✅ 3080 HTTP 200 | PID 在跑 |
| **dsh-deepseek-web-bridge** | ✅ 3 路由注册 + 流式转发 | dsh host plugin |
| dsh-llm-webfree (bundle) | ❌ **不再进入 dsh**（cordis plugin-include 链路污染） | — |

## 路径（dsh 客户端配置）

在 dsh 客户端 `/settings/models` 添加自定义 OpenAI 兼容端点：

```
Name:       deepseek-webfree
Base URL:   http://127.0.0.1:3080/v1
API Key:    <your-upstream-key>   （= $DSH_DSFREE_UPSTREAM_KEY）
Models:     deepseek-default   (1M ctx / 384K out)
            deepseek-expert    (expert mode)
```

调用栈：
```
dsh 客户端
  → POST http://127.0.0.1:3080/v1/chat/completions
  → dsh webserver (this plugin's apply)
  → fetch http://127.0.0.1:22217/v1/chat/completions
  → ds-free-api (NIyueeE v0.2.6)
  → chat.deepseek.com 网页端 (Android 客户端模拟)
  → 流式 SSE 回写到 dsh 客户端
```

## 为什么 dsh-llm-webfree 失败，本方案 B 成功

两个 plugin 之前都走 `cordis-plugin-include` 加载链路。`dsh-llm-webfree` 导出 `class WebfreeAdapter extends LlmAdapter`，原型上有 8+ 个字段（`baseURL`/`endpointURL`/`apiKey` 等）。cordis 在某些 path 对 plugin exports 做 reflect-get 遍历，命中**未声明**的 prop（因为字段名跟 dsh 客户端 settings UI 用的 `baseURL` 字段同名）→ 触发 `cannot get property "baseURL" without inject` → 整个 plugin loader 链静默失败 → 客户端插件加载失败 → 黑屏。

`dsh-deepseek-web-bridge` **没有 class**，只导出 `apply` 函数 + `const` 字符串。`object.entries(exports)` 遍历出来只有 `apply`/`inject`/`name` —— cordis plugin loader 期待的 4 个字段全部命中，**enum 阶段不再触发 reflect get trap**。模块加载立即成功，apply 立即注册 3 个 webserver 路由。

## 端点（dsh 3080 上）

| 路径 | 方法 | 行为 |
|---|---|---|
| `/v1/models` | GET | 转发到 ds-free-api `/v1/models` |
| `/v1/chat/completions` | POST | 转发到 ds-free-api（SSE 透传） |
| `/deepseek-webfree/health` | GET | 检查 ds-free-api `/health` 连通性 |

## 故障排查

**1. 客户端黑屏 / Failed to load plugins**
- **F5 / Cmd+R** 刷新 dsh 客户端
- 服务端 3080 现在所有 client.js 都 200 OK（包括 typert-registry 等）
- 一次性 race condition，重置后就好

**2. dsh 模型选择器没看到 deepseek-webfree**
- 它确实**不会自动出现**——bridge plugin 是 host-only，没有任何 client UI 注入
- 走 dsh 设置面板**手动** add Custom OpenAI endpoint：
  - Base URL `http://127.0.0.1:3080/v1`
  - API Key `sk-...`
  - Models `deepseek-default` / `deepseek-expert`

**3. 聊天没响应 / "upstream unreachable"**
```bash
curl http://127.0.0.1:3080/deepseek-webfree/health
# 应该返 {"bridge":"ok","upstream_status":200,"upstream_body":"{\"status\":\"ok\"}"}
```
如果不 OK：
- 检查 ds-free-api 进程：`Get-Process -Name ds-free-api`，死了就重启：
  ```powershell
  $ex = "$env:LOCALAPPDATA\Temp\ds-free-api\ds-free-api-v0.2.6-windows-x86_64\ds-free-api.exe"
  $t = "$env:LOCALAPPDATA\Temp\ds-free-api\ds-free-api-v0.2.6-windows-x86_64\config.toml"
  $d = Join-Path $env:USERPROFILE 'Desktop\ds-free-data'
  Start-Process -FilePath $ex -ArgumentList '-c', $t, '--data-dir', $d
  ```
- 检查账号 cookie（手机+密码登录续期）——首次失败的话换账号。

**4. dsh 重启后 webfree-bridge 路径没装上**
- 每次 dsh 重启时 `super-injector` 会跑 `purge-stale-tools`（log 里有这条）
- patch.yml 的 webfree-bridge entry 偶尔被清（实测：出现过一次）
- 修复：把 patch.yml 那条 add 回去（cordis-plugin-include 在 bundle 内部自己读 `dsh.bundle.patch = ./cordis.patch.yml`，会从那里加载）
- 见 `cordis.patch.yml` 当前内容已经是 `bridge 由 package.json 的 bundle 加载；插件自带的 cordis.patch.yml 会插入 webfree-bridge，这里不能重复 insert。` —— 这段话是 super-injector 自己写进去的（理解正确，无需手动 insert）

## 关键文件

```
<Desktop>/dsh-plugins/
├── dsh-deepseek-web-bridge/    ← THIS PLUGIN (active)
│   ├── src/index.js             (3 路由 + 配置)
│   ├── package.json             (name: @local/dsh-deepseek-web-bridge)
│   ├── cordis.patch.yml         (entry: webfree-bridge)
│   └── bridge.log               (运行时日志)
└── dsh-llm-webfree/            ← LEGACY (do NOT re-add to dsh)
    ├── src/index.ts             (full LLM adapter)
    ├── lib/index.js
    └── README.zh.md

~/.dsh/profiles/web/
├── patch.yml                    (含 webfree-bridge 注释, allow bundle patch)
├── package.json                 (bundle list 包含 @local/dsh-deepseek-web-bridge)
└── node_modules/@local/dsh-deepseek-web-bridge → .../dsh-deepseek-web-bridge/
```

## 端到端实测结果

```
$ curl http://127.0.0.1:3080/deepseek-webfree/health
{"bridge":"ok","upstream_status":200,"upstream_body":"{\"status\":\"ok\"}","upstream_url":"http://127.0.0.1:22217"}

$ curl http://127.0.0.1:3080/v1/models -H "Authorization: Bearer sk-..."
{"object":"list","data":[{"id":"deepseek-default",...},{"id":"deepseek-expert",...}]}

$ curl http://127.0.0.1:3080/v1/chat/completions -X POST \
    -H "Authorization: Bearer sk-..." -H "Content-Type: application/json" \
    -d '{"model":"deepseek-default","messages":[{"role":"user","content":"say hi in 3 words"}],"stream":true,"max_tokens":40}'
data: {"id":"chatcmpl-...","choices":[{"index":0,"delta":{"role":"assistant",...}}]}
...
data: {"choices":[{"index":0,"delta":{"content":"Hello, my friend."}}]}
...
data: [DONE]
```

3 秒响应，SSE 完整流式。
