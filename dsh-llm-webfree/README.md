> ⚠️ **DEPRECATED / 已废弃**：此插件经 cordis-plugin-include 注入会触发 loader 链污染（客户端黑屏），已被 [`dsh-deepseek-web-bridge`](../dsh-deepseek-web-bridge) 取代。保留仅供研究，**请勿重新安装到 DSH**。

# dsh-llm-webfree

Thin OpenAI-compatible LLM adapter that points dsh at a user-local
[`ds-free-api`](https://github.com/NIyueeE/ds-free-api) instance
(default port 22217), which in turn wraps the chat.deepseek.com web
channel.

See [README.zh.md](./README.zh.md) for the full Chinese write-up.
