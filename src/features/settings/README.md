# 设置弹窗（feature: settings）

> V56（P3-1）从 `src/main.jsx` 抽出的视图切片。后续 P3-2～P3-6 同构，本目录是它的范本。

## 职责

承载「设置」弹窗的全部 UI 与私有副作用：

- API Key 输入 / 显隐 / 保存（含格式清洗 + 本机持久化）。
- 皮肤（主题）切换。
- 连通性测试（仅探测 `/v1/models`，不生图、不上传、不扣费）。
- 本机存储用量读取 / 打开目录 / 清理（历史图片、参考图、结果缓存）。

## 入口

- `SettingsView.jsx` — 弹窗 JSX + 交互，纯展示组件，自身不持有弹窗私有状态。
- `settings-state.js` — `useSettingsState(deps)` 纯逻辑 hook（零 JSX），持有弹窗私有状态与全部副作用 handler；导出 `themeOptions` 主题常量。
- `README.md` — 本文档。

## 状态归属（关键约定）

| 状态 | 归属 | 理由 |
| --- | --- | --- |
| `storageUsage` / `storageBusy` / `storageStatus` | **本目录**（`useSettingsState`） | 仅弹窗存储区使用 |
| `isApiKeyVisible` / `apiSaveStatus` | **本目录** | Key 显隐 / 保存反馈，弹窗私有 |
| `isConnectionTesting` / `connectionStatus` / `connectionState` | **本目录** | 连接测试私有 |
| `settings` / `config` | **App()**（props 下发） | 全局 KEY 源与路由配置，P3-6 等共享 |
| `setSettings` / `updateSetting` | **App()**（props 下发） | 写回全局 settings |
| `saveDirectory` / `directoryDraft` / `isPickingDirectory` | **App()** | 设置里选、快捷生成里用，跨视图共享 |
| `isSettingsOpen` | **App()**（props 下发） | 由导航/顶栏按钮切换 |
| `isDirectoryModalOpen` | **App()** | 被 `useSaveDirectory` 钩子在 App 层调用打开；目录弹窗（含共享 `directoryDraft`/`isPickingDirectory`）在 `main.jsx` 中独立于本弹窗渲染 |

> ⚠️ **禁止**把 `settings` / `config` / `saveDirectory` 三件套搬进本目录——否则 P3-6 快捷生成读不到全局 KEY。

## 接线方式（main.jsx）

```jsx
import { SettingsView } from "./features/settings/SettingsView.jsx";
import { useSettingsState } from "./features/settings/settings-state.js";

// App() 内（hook 必须常驻调用，保证调用顺序稳定）
const settingsApi = useSettingsState({ settings, setSettings, config, addEvent, isSettingsOpen });

// 渲染
{isSettingsOpen && (
  <SettingsView
    settings={settings}
    config={config}
    updateSetting={updateSetting}
    isSettingsOpen={isSettingsOpen}
    onClose={() => setIsSettingsOpen(false)}
    settingsApi={settingsApi}
  />
)}
```

## 常见改法

- **改主题列表**：编辑 `settings-state.js` 的 `themeOptions`。
- **改连接测试文案 / 状态样式**：`SettingsView.jsx` 的 `connectionHint` 区 + `settings-state.js` 的 `runConnectionTest` 回写 `connectionState`（`idle` / `ok` / `error`）。
- **新增设置项**：若该项状态仅弹窗使用 → 加进 `useSettingsState`；若需跨视图（如快捷生成要用）→ 留在 App() 并随 props 下发。

## 后端配合

- 连通性测试：复用 `src/features/auth/api-key.js` 的 `testApiConnection`（与 `outfit-workflow.jsx` 同一份实现，逐字节一致）。
- 存储用量 / 清理 / 打开目录：复用 `src/api/storage.js`（`getStorageUsage` / `cleanStorageTargets` / `revealStorageDir`）。
- Key 持久化：复用 `src/lib/storage/json-storage.js` 的 `writeJsonStorage` + `src/shared/app-defaults.js` 的 `STORAGE_KEY`。
