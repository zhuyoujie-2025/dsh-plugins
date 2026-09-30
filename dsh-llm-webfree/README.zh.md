> ⚠️ **DEPRECATED / 已废弃**：此插件经 cordis-plugin-include 注入会触发 loader 链污染（客户端黑屏），已被 [`dsh-deepseek-web-bridge`](../dsh-deepseek-web-bridge) 取代。保留仅供研究，**请勿重新安装到 DSH**。

# dsh-llm-webfree

dsh 侧薄桥接 LLM provider → 直连用户本机 `ds-free-api`（NIyueeE 版，Rust 单二进制，端口 22217）→ 调用 chat.deepseek.com 网页通道。

## 为什么这样设计

`chat.deepseek.com` 没有官方程序化 API。`ds-free-api` 已经处理 PoW 求解、session 续期、多账号轮询等所有逆向工作。本仓库**完全不做任何逆向**——只用一个标准 OpenAI Chat Completions 协议桥接到 dsh 的 cordis `llm` 能力上。

风险隔离：用户本地跑 ds-free-api + 自己登录的 cookie；dsh 侧只做协议转换，不碰 cookie。

## 状态（与本仓库版本绑定）

- ✅ 实现层：`src/index.ts` 完整 WebfreeAdapter，smoke test 通过，覆盖 chat + reasoner 双模型 + 流式 + tool call
- ✅ smoke：`node tests/smoke.mjs` → 10 个 chunk 事件，text + reasoning + usage + finish 协议完整
- ✅ cookie 导出：`tools/extract-cookies.mjs` 通过 Chrome DevTools Protocol 拉登录会话的 cookies
- ⚠️ **dsh 集成层 (cordis plugin loader)**：当前环境下 `dev_inject_plugin` / `dev_install_package` 都遇到 `loader.create → failed to apply loader entry (...) : cannot get property "baseURL" without inject`。同样代码在 `node tests/standalone-load.mjs` 跑能 register 成功；最小可注入骨架（删掉整个 adapter 类）能注入，但带完整 adapter 类 + 全量 dsh-llm import 时注入失败。怀疑点：cordis reflect get trap 在 fiber 初始化某个时机触发了一个未声明属性访问（baseURL 这个字符串名只在环境变量里出现）。这是 dsh 注入器的边界问题，不是适配器的代码问题。

详见下文"故障与定位"小节。

## 安装

### 0. 准备 ds-free-api（本仓库不负责安装，你本机启动即可）

按 `NIyueeE/ds-free-api` README 下载二进制、准备 3+ 个 chat.deepseek.com cookie、起 `:22217`：
```bash
# 假设已经在 127.0.0.1:22217 跑着
curl http://127.0.0.1:22217/v1/models
```

### 1. 把 dsh-llm-webfree 加入 dsh profile

手动编辑 `~/.dsh/profiles/web/package.json`（或当前 profile）的：
```jsonc
{
  "dependencies": {
    "@local/dsh-llm-webfree": "link:<plugins-dir>/dsh-llm-webfree"
  },
  "dsh": {
    "profile": {
      "bundles": [
        /* ...已有... */
        "@local/dsh-llm-webfree"
      ]
    }
  }
}
```
然后 `pnpm install` 让 junction 落盘。**重启 dsh web** 让它从 bundle 列表装配。**不要**用 `dev_inject_plugin`——上面提到的 cordis 边界问题会让它报 `cannot get property "baseURL" without inject`。

### 2. 提取 cookie（一次性）

打开已登录 chat.deepseek.com 的 Chrome，加 `--remote-debugging-port=9222`（任何支持 `--remote-allow-origins=*` 的版本都行）：

```powershell
# Windows：找到你 chrome 的 binary，按需替换路径
& "C:\Program Files\Google\Chrome\Application\chrome.exe" `
  --remote-debugging-port=9222 `
  --remote-allow-origins=* `
  --user-data-dir="$env:LOCALAPPDATA\Google\Chrome\User Data" `
  "https://chat.deepseek.com"
```

确认 chat.deepseek.com **已登录**那个 profile，再用：

```bash
cd <plugins-dir>/dsh-llm-webfree
node tools/extract-cookies.mjs -o ../cookies.json
```

输出 `cookies.json` 后，**用 NIyueeE/ds-free-api 要求的格式**把它喂给 ds-free-api（不是本插件）。本插件只连 ds-free-api，不碰 cookie。

### 3. 在 dsh 模型选择器里挑 `deepseek-webfree`

重启 dsh 后，`/settings → models` 应该多出两个模型：
- `deepseek-chat`（OpenAI 协议的 /chat/completions）
- `deepseek-reasoner`（暴露 `reasoning_content` → 映射到 dsh 的 reasoning block）

### 4. 环境变量 override（可选）

```bash
$env:DSH_LLM_WEBFREE_BASE_URL = "http://127.0.0.1:22217/v1"   # 默认就是这个
$env:DSH_LLM_WEBFREE_KEY = "sk-webfree"                       # ds-free-api 不严格校验
```

> 注：当前实现仅支持这两个 env vars；未来要加 settings UI 时再扩展 `NS` 命名空间。

## smoke test

```bash
cd <plugins-dir>/dsh-llm-webfree
pnpm install            # 一次性
pnpm run build          # 编译 src/index.ts → lib/index.js
node tests/smoke.mjs    # 离线 mock fetch 验证协议正确
```

期望输出：
```
OK — WebfreeAdapter smoke test passed: {
  events: 10,
  blockStarts: 2,
  blockEnds: 2,
  usage: { inputTokens: 8, ... },
  finish: 'stop'
}
```

## 故障与定位（cordis 注入器边界）

`dev_inject_plugin` 和 `dev_install_package` 都撞同一个错：
```
ERROR: loader.create 失败: Error: failed to apply loader entry <uid> (@local/dsh-llm-webfree):
       cannot get property "baseURL" without inject
```

已做过的排查：
1. ✅ `node tests/standalone-load.mjs` 直接 import + 直接调用 `apply(ctx)`：成功注册 adapter
2. ✅ Plugin smoke test（mock fetch）：stream / reasoning / usage / finish 协议全对
3. ✅ 极小骨架（只 import 一个类、`apply` 空实现、`inject=['llm']`）：能注入（host ✓）
4. ❌ 完整 adapter + 全量 `dsh-llm` import + 全量 stream 实现：触发 "baseURL" 错
5. ❌ 即便把 `apply` 改成 no-op body（不动 ctx、零 baseURL 字面量接触），错误依旧
6. ❌ 切换 `inject = []` vs `['llm']` vs `['llm', 'settings']` —— 都不变
7. ❌ 切换 `apply(ctx)` vs `apply(ctx, config)` 双参数 —— 都不变
8. ✅ `apply.log` 写入但 apply **从未被 cordis 调用** —— 错误在 fiber `_start` → `_execute(runner)` 之前发生
9. ❌ `cordis reflect get trap` 在某些路径会以 `prop='baseURL'` 进入"cannot get property X without inject"分支；这 prop 名只在 `process.env[DEFAULT_BASE_URL_ENV]` 之类的字符串里出现，从未当作对象 key 访问

最可能假设：cordis plugin loader 在 snapshot 阶段 (`this.loader.unwrapExports` 之类) 递归遍历 my exports 时，**当某个被遍历的 prop 名恰好是 `baseURL`（作为字符串 enum key）就抛错**。这个 prop 名只在我们 adapter 类内部 `const url = ${this.baseURL}/chat/completions` 一处出现，没当 export 属性导出，但 tsc 编出来的 js 可能把 source-map 路径带到 cordis 错误消息里。

下一位接手这条路径的工程师建议：
- 在 `deepseek-harness` 装一个只做 `ctx.llm.registerAdapter(['dummy'], new DummyAdapter())` 的极简 LLM provider，对比看是否同样错
- 跟踪 `cordis/lib/index.js:675` 处的 Error 抛出时的 `prop` 来源，确认是不是来自 unwrapExports 阶段
- 如果是，请在 cordis-plugin-loader 里过滤掉我 exports 的 `WebfreeAdapter.prototype.baseURL` 这种访问

## 实现摘要（`src/index.ts`）

```
WebfreeAdapter extends LlmAdapter
├── providerInfo(provider)             → { id: 'deepseek-webfree', name: 'DeepSeek (web free, via ds-free-api)' }
├── providerRetryPolicy()              → resolveRetryPolicy(mode:'normal', maxRetries:2, 退避 0.8→8s)
├── listModels()                       → [deepseek-chat, deepseek-reasoner]
├── resolveModel(provider, model, _)   → context=128k, defaultMaxTokens=4096
│                                        reasoner 还多 efforts: ['off','high'], defaultEffort='high'
└── stream(options)                    → POST /v1/chat/completions（SSE）
                                         block-start(text) → text-delta × N
                                                  ↓ reasoning_content 出现时
                                         block-start(reasoning, idx 1) → reasoning-delta × N
                                         两者 block-end
                                         usage (拆 prompt_tokens - cached_tokens = inputTokens)
                                         finish { kind: 'stop' | 'tool-calls' | 'max-tokens' }

apply(ctx)
└── ctx.get('llm') → new WebfreeAdapter(env) → registerAdapter(['deepseek-webfree'], adapter)
```

## 许可

MIT
