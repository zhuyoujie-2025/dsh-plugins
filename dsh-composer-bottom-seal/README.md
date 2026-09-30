# dsh-composer-bottom-seal

把 DSH 对话页 composer 根节点的底部 8px clearance 收为 0，使状态行贴住视口底边；不改变侧边栏和输入卡片内部间距。

选择器只依赖官方稳定属性：`[data-composer-seat]` 与 `[data-composer-card]`，不依赖 CSS Modules hash。

## 实际包含的三条规则

1. composer 根节点 `margin-bottom: 0`（原本 8px clearance）
2. 底部 seat 高度压缩
3. 输入框激活态（`[data-phase='active'] [data-composer-seat]`）背景设为透明 —— **副作用是激活时壁纸会从输入框下沿透出**，这是为"贴底"视觉做的取舍

## 安装

```sh
dsh plugin --profile web add <本目录>
```

或手动加入 profile 的 bundle 列表后重启 `dsh web`。纯 CSS 注入插件，无需额外配置；卸载即恢复原样。

## 构建与测试

```bash
npm install
npm run build   # tsdown 打包并跑 verify-bundle 校验
npm test
```

