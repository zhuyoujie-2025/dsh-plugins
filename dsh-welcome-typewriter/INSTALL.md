# 接入说明

`dsh-welcome-typewriter` 是标准 DSH bundle 插件（host 桩 + client 半）。以下三种接入方式任选其一。

## 方式 A：profile 声明式安装（推荐，可复现）

在目标实例 profile 的 `package.json` 加依赖与 bundle：

```jsonc
{
  "dependencies": {
    "dsh-welcome-typewriter": "link:C:/绝对路径/dsh-welcome-typewriter"
    // 或 npm 包名 / file: 路径 / workspace 协议
  },
  "dsh": {
    "profile": {
      "bundles": ["dsh-welcome-typewriter"]
    }
  }
}
```

然后 `pnpm install`（或对应包管理器）刷新依赖，重启内核。插件自带 `cordis.patch.yml`，会往 roster 插一行 `id: welcome-typewriter`——`dsh --profile <名> --dump-config` 里能看到它即接入成功。

## 方式 B：官方 CLI

```sh
dsh plugin --profile web add file:C:/绝对路径/dsh-welcome-typewriter
```

CLI 会自动完成依赖登记 + bundle 挂载，重启内核生效。

## 方式 C：super-injector 热装配（免重启）

已装 `@dsh-external/dsh-super-injector` 的实例可直接热注入本目录，欢迎语立即出现在首页；卸载时 anchor 与样式自动清理。

## 验证

1. 打开 DSH 首页（新会话入口页）。
2. hero 区应显示一条逐字打出的问候语 + 闪烁光标，而不是静态「探索未至之境」。
3. 多刷新/重进几次，约有 1/5 概率见到金色或彩虹彩蛋文案。

## 卸载

从 `dsh.profile.bundles`（或 CLI remove）摘掉 `dsh-welcome-typewriter`，重启内核；`ctx.effect` 清理函数会还原被隐藏的标题 span，不留 DOM 残留。

## 注意事项

- **共存**：若同实例还有其他插件也接管 hero 欢迎语（同样挂 `.dsh-welcome-anchor`），先加载者生效，不会叠字——同一时间只会有一个欢迎语实例。
- **内核版本**：`0.1.7` 系实测通过；理论上 `0.1.x` 皆可（只依赖 DOM 与 `ctx.effect`）。官方改版 hero 文案会导致不触发，届时改 `injectWelcome` 里的定位文本即可。
