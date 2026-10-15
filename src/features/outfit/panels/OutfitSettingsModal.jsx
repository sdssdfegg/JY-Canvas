// src/features/outfit/panels/OutfitSettingsModal.jsx
// V68 (P5-6) 2026-10-15：从 src/outfit-workflow.jsx 主 return 外壳逐字搬出（原 3244–3343）。
// 内容：设置弹窗（API Key / 皮肤 / 连接测试）+ 内嵌「指定文件夹」保存目录弹窗。
// 模式：原闭包捕获的 state / handler 全部改为同名 props（两个 modal 的渲染条件 isSettingsOpen/!embeddedMode/isDirectoryModalOpen 一并搬入，由调用方传值）；
//   模块级常量 THEME_OPTIONS 与 lucide 图标直接 import，不重复实现。
// ⚠️ props 漏项 = 运行期 undefined（vite build 验不出），由 V68 §3.2 负向对照兜底。
import {
  Eye,
  EyeOff,
  FolderOpen,
  Loader2,
  Lock,
  Palette,
  PlugZap,
  Save,
  Settings,
  X
} from "lucide-react";
import { THEME_OPTIONS } from "../outfit-top.js";

export default function OutfitSettingsModal({
  isSettingsOpen,
  embeddedMode,
  setIsSettingsOpen,
  apiKeyDraft,
  setApiKeyDraft,
  showKey,
  setShowKey,
  saveSettings,
  apiSaveStatus,
  effectiveTheme,
  updateSetting,
  isConnectionTesting,
  runConnectionTest,
  connectionStatus,
  connectionState,
  isDirectoryModalOpen,
  setIsDirectoryModalOpen,
  directoryDraft,
  isPickingDirectory,
  pickSaveDirectory,
  confirmSaveDirectory,
}) {
  return (
    <>
      {isSettingsOpen && !embeddedMode && (
        <div className="modalLayer" onMouseDown={() => setIsSettingsOpen(false)}>
          <section className="settingsModal" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <h2>设置</h2>
                <span>API Key 与界面皮肤</span>
              </div>
              <button className="iconButton" type="button" onClick={() => setIsSettingsOpen(false)}>
                <X size={18} />
              </button>
            </header>

            <label className="modalField">
              <span><Lock size={15} /> API Key</span>
              <div className="apiKeyRow">
                <input
                  type={showKey ? "text" : "password"}
                  value={apiKeyDraft}
                  placeholder="sk-..."
                  onChange={(event) => setApiKeyDraft(event.target.value)}
                />
                <button className="iconButton" type="button" onClick={() => setShowKey((value) => !value)} title={showKey ? "隐藏 API Key" : "显示 API Key"}>
                  {showKey ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
                <button className="smallButton saveKeyButton" type="button" onClick={saveSettings}>
                  <Save size={15} />
                  <span>保存</span>
                </button>
              </div>
              {apiSaveStatus && <small>{apiSaveStatus}</small>}
            </label>

            <div className="skinBlock">
              <span><Palette size={15} /> 皮肤</span>
              <div className="themeGrid">
                {THEME_OPTIONS.map((theme) => (
                  <button
                    className={`themeButton ${effectiveTheme === theme.value ? "selected" : ""}`}
                    key={theme.value}
                    type="button"
                    onClick={() => updateSetting("theme", theme.value)}
                  >
                    <i>{theme.colors.map((color) => <b key={color} style={{ backgroundColor: color }} />)}</i>
                    <span>{theme.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="debugBlock">
              <span><Settings size={15} /> 连接测试</span>
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
          </section>
        </div>
      )}

      {isDirectoryModalOpen && (
        <div className="modalLayer" onMouseDown={() => setIsDirectoryModalOpen(false)}>
          <section className="saveDirectoryModal" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div>
                <h2>指定文件夹</h2>
                <span>下载图片会保存到这个目录</span>
              </div>
              <button className="iconButton" type="button" onClick={() => setIsDirectoryModalOpen(false)}>
                <X size={18} />
              </button>
            </header>
            <label className="modalField">
              <span><FolderOpen size={15} /> 保存目录</span>
              <input
                value={directoryDraft}
                readOnly
                onClick={() => void pickSaveDirectory()}
                placeholder="点击选择保存目录"
                title="点击选择保存目录"
              />
              <small>{isPickingDirectory ? "正在等待目录选择..." : "点击输入框选择目录，点确定后生效"}</small>
            </label>
            <footer className="directoryModalActions">
              <button className="secondaryButton" type="button" onClick={() => setIsDirectoryModalOpen(false)}>取消</button>
              <button className="primaryButton" type="button" onClick={() => void confirmSaveDirectory()}>
                <Save size={16} />
                <span>确定</span>
              </button>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}
