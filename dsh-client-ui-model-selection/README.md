# dsh-client-ui-model-selection (drag-order repack)

DeepSeek Harness（DSH）**模型选择器增强版**：在上游核心包 `@deepseek-ai/dsh-client-ui-model-selection@0.1.7-rc.2` 的基础上，补齐「排列方式 + 可视化拖拽排序 + 持久化」。

上游原版只提供 `/model` 弹窗与输入框模型菜单，设置页只有一个排列下拉框。本版本在设置页下方渲染**完整可用模型目录**，支持拖拽自由排序，顺序持久化并对所有选择面生效。

## 功能

- **排列方式**：按厂商分组 / 按提供商分组 / 按名称平铺，改动立即生效
- **可用模型目录**：设置页实时渲染全部模型分组与模型行（厂商、模型名、提供商后缀、组内计数）
- **模型行拖拽**：同组内拖动改变模型顺序
- **分组头拖拽**：整组拖动改变组的先后顺序
- **持久化**：`order` / `groupOrder` 写入 `cordis.patch.yml`（volatile 配置字段），重启后保留
- **全选择面生效**：`/model` 弹窗与输入框模型菜单共享同一排序
- **恢复默认排序**：一键回到厂商规则默认顺序
- 目录数据来自运行时 `modelDirectories.catalog`——**你配了哪些提供商，拖的就是哪些模型**，无任何硬编码模型清单

## 安装（替换内置包）

本包与上游同名同 ID，安装方式是**覆盖已安装的核心包**。找到你的 DSH 运行时装载目录下的包，用本仓库的 `lib/` 与 `package.json` 整体替换同名目录，然后重启 DSH：

```text
# 桌面版（Tauri）
%APPDATA%\dsh-tauri\dependencies\dsh\node_modules\@deepseek-ai\dsh-client-ui-model-selection\

# 全局 npm 安装版
<npm root -g>\@deepseek-ai\dsh\node_modules\@deepseek-ai\dsh-client-ui-model-selection\
（若该处不存在，检查 <npm root -g>\@deepseek-ai\dsh-client-ui-model-selection\）
```

替换前先备份原目录（例如改名为 `dsh-client-ui-model-selection.bak`），回滚 = 把备份改回来。

> 提示：如果你的 DSH 支持 profile 级 `node_modules` 优先解析，也可以把本包装进 `<DSH_HOME>/profiles/<profile>/node_modules/@deepseek-ai/`，无需动全局文件。

## 使用

设置 → **模型选择器**：

1. 「排列方式」选分组策略；
2. 「可用模型」下拖动 ⠿ 握把调序（行=模型，组头=整组）；
3. 「恢复默认排序」还原。

改动即时生效并自动落盘。

## 配置字段（cordis.patch.yml）

| 字段 | 含义 |
|---|---|
| `arrangement` | `manufacturer` / `provider` / `name` |
| `order` | 扁平模型名顺序表（跨组拼接，按组序排列） |
| `groupOrder` | 分组键顺序表（按当前 arrangement 的组键） |

## 已知边界

- `order` 按**显示名**匹配：两个显示名完全相同的模型共享排序位
- `groupOrder` 按**当前排列模式的组键**记录：换排列方式后旧组序自动失效（静默回退默认），模型级 `order` 跨模式仍生效
- 排序后新接入的模型排在所属组末尾，拖动或「恢复默认排序」可调整
- 本包为**预构建产物**（`lib/`），未附带对应 `src/`；基于上游 0.1.7-rc.2 改造，其他版本请先小范围验证

## 兼容性

在 DSH Web `0.1.7-rc.2`（桌面版内核）实测通过：24 组 / 98 模型渲染、拖拽重排、重启持久化、console 无报错。

## License

MIT（沿用上游 LICENSE）。

---

## English

A repack of the upstream `@deepseek-ai/dsh-client-ui-model-selection@0.1.7-rc.2` core package with a **live model catalog + drag-to-reorder + persisted ordering** added to its settings page. Model rows reorder inside their group, group heads reorder whole groups, and the saved `order`/`groupOrder` config applies to both the `/model` popup and the composer model menu.

Install = replace the installed package directory (see paths above) and restart DSH. The catalog is fully data-driven from your configured providers — nothing is hardcoded. Tested on DSH Web 0.1.7-rc.2.
