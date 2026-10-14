// V56（P3-1）：设置弹窗视图。从 src/main.jsx 的 `{isSettingsOpen && ( ... )}` 块（5125~5264）原样迁入。
// 仅接收 props，不持有任何「弹窗私有」之外的状态；共享状态由 App() 通过 props 下发。
import {
  Eye,
  EyeOff,
  FolderOpen,
  HardDrive,
  KeyRound,
  Loader2,
  Palette,
  PlugZap,
  RefreshCw,
  Save,
  Settings as SettingsIcon,
  Trash2,
  X
} from "lucide-react";
import { formatStorageSize } from "../storage/storage-store.js";
import { themeOptions } from "./settings-state.js";

export function SettingsView({
  settings,
  config,
  updateSetting,
  isSettingsOpen,
  onClose,
  settingsApi
}) {
  if (!isSettingsOpen) return null;
  const {
    isApiKeyVisible,
    setIsApiKeyVisible,
    apiSaveStatus,
    isConnectionTesting,
    connectionStatus,
    connectionState,
    storageUsage,
    storageBusy,
    storageStatus,
    saveApiKey,
    runConnectionTest,
    handleRevealStorage,
    handleCleanStorage,
    refreshStorageUsage
  } = settingsApi;

  return (
    <div className="modalLayer" onMouseDown={onClose}>
      <section className="settingsModal" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <h2>设置</h2>
            <span>API Key 与界面皮肤</span>
          </div>
          <button className="iconButton" type="button" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </header>

        <label className="modalField">
          <span><KeyRound size={15} /> API Key</span>
          <div className="apiKeyRow">
            <input
              type={isApiKeyVisible ? "text" : "password"}
              value={settings.apiKey}
              placeholder={config.hasServerKey ? "服务器已配置" : "sk-..."}
              onChange={(event) => updateSetting("apiKey", event.target.value)}
            />
            <button
              className="iconButton"
              type="button"
              onClick={() => setIsApiKeyVisible((current) => !current)}
              title={isApiKeyVisible ? "隐藏 API Key" : "显示 API Key"}
            >
              {isApiKeyVisible ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
            <button className="smallButton saveKeyButton" type="button" onClick={saveApiKey}>
              <Save size={15} />
              <span>保存</span>
            </button>
          </div>
          {apiSaveStatus && <small className="fieldHint">{apiSaveStatus}</small>}
        </label>

        <div className="skinBlock">
          <span><Palette size={15} /> 皮肤</span>
          <div className="themeGrid">
            {themeOptions.map((theme) => (
              <button
                className={`themeButton ${settings.theme === theme.value ? "selected" : ""}`}
                key={theme.value}
                type="button"
                onClick={() => updateSetting("theme", theme.value)}
              >
                <i>
                  {theme.colors.map((color) => <b key={color} style={{ backgroundColor: color }} />)}
                </i>
                <span>{theme.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="debugBlock">
          <span><SettingsIcon size={15} /> 连接测试</span>
          <p>只向上游请求模型清单探测连通性，<strong>不调用生图、不上传图片、不扣费</strong>，也不会显示或保存你的 API Key。</p>
          <div className="debugActions">
            <button className="smallButton" type="button" onClick={() => void runConnectionTest()} disabled={isConnectionTesting}>
              {isConnectionTesting ? <Loader2 className="spin" size={15} /> : <PlugZap size={15} />}
              <span>{isConnectionTesting ? "测试中…" : "连接测试"}</span>
            </button>
          </div>
          {connectionStatus && (
            <small className={`fieldHint connectionHint ${connectionState}`}>{connectionStatus}</small>
          )}
        </div>

        <div className="debugBlock storageBlock">
          <span><HardDrive size={15} /> 数据与存储</span>
          <p>
            生成的图片、上传的参考图和日志都保存在本机数据目录，<strong>不在安装包内</strong>。
            清理会直接删除磁盘文件，无法撤销。
          </p>
          {storageUsage ? (
            <>
              <div className="storagePathRow">
                <code title={storageUsage.dataDir}>{storageUsage.dataDir}</code>
                <button className="smallButton" type="button" onClick={() => void handleRevealStorage("data")}>
                  <FolderOpen size={15} />
                  <span>打开目录</span>
                </button>
              </div>
              <ul className="storageList">
                {(storageUsage.items || []).map((item) => (
                  <li key={item.key}>
                    <span>{item.label}</span>
                    <em>{item.files} 个 / {formatStorageSize(item.bytes)}</em>
                  </li>
                ))}
                <li>
                  <span>历史记录条数</span>
                  <em>{storageUsage.historyCount} 条</em>
                </li>
              </ul>
            </>
          ) : (
            <small className="fieldHint">正在读取存储用量…</small>
          )}
          <div className="debugActions">
            <button
              className="smallButton"
              type="button"
              disabled={Boolean(storageBusy)}
              onClick={() => void handleCleanStorage(["historyImages"], "历史图片（含历史清单）")}
            >
              <Trash2 size={15} />
              <span>清理历史图片</span>
            </button>
            <button
              className="smallButton"
              type="button"
              disabled={Boolean(storageBusy)}
              onClick={() => void handleCleanStorage(["references"], "参考图缓存")}
            >
              <Trash2 size={15} />
              <span>清理参考图</span>
            </button>
            <button
              className="smallButton"
              type="button"
              disabled={Boolean(storageBusy)}
              onClick={() => void handleCleanStorage(["results", "canvasAssets"], "结果图缓存")}
            >
              <Trash2 size={15} />
              <span>清理结果缓存</span>
            </button>
            <button className="smallButton" type="button" onClick={() => void refreshStorageUsage()}>
              <RefreshCw size={15} />
              <span>刷新</span>
            </button>
          </div>
          {storageStatus && <small className="fieldHint">{storageStatus}</small>}
        </div>
      </section>
    </div>
  );
}
