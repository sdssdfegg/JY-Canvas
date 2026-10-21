// V56（P3-1）：设置弹窗视图。从 src/main.jsx 的 `{isSettingsOpen && ( ... )}` 块（5125~5264）原样迁入。
// 仅接收 props，不持有任何「弹窗私有」之外的状态；共享状态由 App() 通过 props 下发。
// V73：按钮/字段/分区外壳统一走 Button / Field / Toolbar / Panel / ModuleHeader（总纲 §5）。
import { useState, useEffect } from "react";
import {
  Download, Eye, EyeOff, FolderOpen, HardDrive, KeyRound, Palette, PlugZap,
  RefreshCw, Save, Settings as SettingsIcon, Trash2, X
} from "lucide-react";
import { formatStorageSize } from "../storage/storage-store.js";
import { PUBLIC_RELEASE_MODE } from "../../shared/app-defaults.js";
import { downloadReleaseSeed, buildReleaseSeed, syncReleaseSeed } from "../../shared/release-seed.js";
import { fetchSeedSyncStatus } from "../../api/seed.js";
import { themeOptions } from "./settings-state.js";
import { Button } from "../../shared/ui/Button.jsx";
import { Modal } from "../../shared/ui/Modal.jsx";
import { Field } from "../../shared/ui/Field.jsx";
import { Toolbar } from "../../shared/ui/Toolbar.jsx";
import { Panel } from "../../shared/ui/Panel.jsx";
import { ModuleHeader } from "../../shared/ui/ModuleHeader.jsx";

export function SettingsView({
  settings, config, updateSetting, isSettingsOpen, onClose, settingsApi
}) {
  // V121（仅 internal 模式）：封装种子导出反馈（成功/失败都必须可见，不许静默失败）。
  const [seedExportMsg, setSeedExportMsg] = useState("");
  // V123（仅 internal 模式）：封装配置同步反馈 + 新鲜度提示。
  const [seedSyncMsg, setSeedSyncMsg] = useState("");
  const [seedSyncStatus, setSeedSyncStatus] = useState(null); // { exists, syncedAt, seedId, entriesCount }
  const [seedCurrentId, setSeedCurrentId] = useState("");
  // V123：设置弹窗打开时刷新「封装配置」新鲜度（仓库 seed/manifest.json 的 seedId vs 浏览器现算）。
  // 必须放在早期 return 之前（React hooks 规则）：组件在 isSettingsOpen=false 时仍会调用本 hook，
  // 内部按 isSettingsOpen 短路，打开弹窗（依赖变化）时重新拉取状态。
  useEffect(() => {
    if (PUBLIC_RELEASE_MODE || !isSettingsOpen) return;
    let alive = true;
    fetchSeedSyncStatus()
      .then((res) => { if (alive) setSeedSyncStatus(res && res.exists ? res : null); })
      .catch(() => { if (alive) setSeedSyncStatus(null); });
    try {
      setSeedCurrentId(buildReleaseSeed().seedId || "");
    } catch {
      setSeedCurrentId("");
    }
    return () => { alive = false; };
  }, [isSettingsOpen]);
  if (!isSettingsOpen) return null;
  const {
    isApiKeyVisible, setIsApiKeyVisible, apiSaveStatus, isConnectionTesting,
    connectionStatus, connectionState, storageUsage, storageBusy, storageStatus,
    saveApiKey, runConnectionTest, handleRevealStorage, handleCleanStorage, refreshStorageUsage
  } = settingsApi;

  const handleExportSeed = () => {
    setSeedExportMsg("正在导出封装种子…");
    try {
      const manifest = downloadReleaseSeed();
      if (!manifest) {
        setSeedExportMsg("当前没有可导出的提示词模板或页面状态");
        window.alert("当前没有可导出的提示词模板或页面状态");
        return;
      }
      setSeedExportMsg(`已导出 ${manifest.entries.length} 项（提示词模板与页面状态），可随封装分发给客户`);
    } catch (err) {
      const detail = err?.message || String(err);
      setSeedExportMsg(`导出失败：${detail}`);
      window.alert(`导出封装种子失败：${detail}`);
    }
  };

  // 同步中标记（禁用按钮 + 阻止重复点击）。
  const seedSyncing = Boolean(seedSyncMsg) && seedSyncMsg.startsWith("正在");
  const handleSyncSeed = async () => {
    setSeedSyncMsg("正在同步到封装配置…");
    try {
      const res = await syncReleaseSeed();
      if (!res.ok) {
        setSeedSyncMsg(res.message || "同步失败");
        window.alert(res.message || "同步到封装配置失败");
        return;
      }
      setSeedSyncMsg(`已同步 ${res.entriesCount} 项，封装将自动带上（${res.syncedAt}）`);
      setSeedSyncStatus({
        exists: true,
        syncedAt: res.syncedAt,
        seedId: res.seedId,
        entriesCount: res.entriesCount
      });
      setSeedCurrentId(res.seedId || seedCurrentId);
    } catch (err) {
      const detail = err?.message || String(err);
      setSeedSyncMsg(`同步失败：${detail}`);
      window.alert(`同步到封装配置失败：${detail}`);
    }
  };

  const seedFresh = Boolean(seedSyncStatus?.exists) && Boolean(seedCurrentId)
    && seedCurrentId === seedSyncStatus.seedId;
  const formatSyncTime = (iso) => {
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return iso;
      const pad = (n) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch {
      return iso;
    }
  };

  return (
    <Modal layerClassName="modalLayer" panelClassName="settingsModal" onClose={onClose}>
        <header>
          <div>
            <h2>设置</h2>
            <span>API Key 与界面皮肤</span>
          </div>
          <Button size="md" iconOnly aria-label="关闭" onClick={onClose}>
            <X size={18} />
          </Button>
        </header>

        <Field label={<><KeyRound size={15} /> API Key</>} hint={apiSaveStatus}>
          <div className="apiKeyRow">
            <input
              type={isApiKeyVisible ? "text" : "password"}
              value={settings.apiKey}
              placeholder={config.hasServerKey ? "服务器已配置" : "sk-..."}
              onChange={(event) => updateSetting("apiKey", event.target.value)}
            />
            <Button
              size="md"
              iconOnly
              onClick={() => setIsApiKeyVisible((current) => !current)}
              title={isApiKeyVisible ? "隐藏 API Key" : "显示 API Key"}
            >
              {isApiKeyVisible ? <EyeOff size={17} /> : <Eye size={17} />}
            </Button>
            <Button size="md" onClick={saveApiKey}>
              <Save size={15} />
              <span>保存</span>
            </Button>
          </div>
        </Field>

        <Panel>
          <ModuleHeader icon={<Palette size={15} />} title="皮肤" />
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
        </Panel>

        <Panel>
          <ModuleHeader icon={<SettingsIcon size={15} />} title="连接测试" />
          <p>只向上游请求模型清单探测连通性，<strong>不调用生图、不上传图片、不扣费</strong>，也不会显示或保存你的 API Key。</p>
          <Button
            size="sm"
            loading={isConnectionTesting}
            disabled={isConnectionTesting}
            onClick={() => void runConnectionTest()}
          >
            {!isConnectionTesting && <PlugZap size={15} />}
            <span>{isConnectionTesting ? "测试中…" : "连接测试"}</span>
          </Button>
          {connectionStatus && (
            <small className={`ui-field__hint${connectionState === "ok" ? " ui-field__hint--success" : connectionState === "error" ? " ui-field__hint--danger" : ""}`}>
              {connectionStatus}
            </small>
          )}
        </Panel>

        <Panel>
          <ModuleHeader icon={<HardDrive size={15} />} title="数据与存储" />
          <p>
            生成的图片、上传的参考图和日志都保存在本机数据目录，<strong>不在安装包内</strong>。
            清理会直接删除磁盘文件，无法撤销。
          </p>
          {storageUsage ? (
            <>
              <div className="storagePathRow">
                <code title={storageUsage.dataDir}>{storageUsage.dataDir}</code>
                <Button size="sm" onClick={() => void handleRevealStorage("data")}>
                  <FolderOpen size={15} />
                  <span>打开目录</span>
                </Button>
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
            <small className="ui-field__hint">正在读取存储用量…</small>
          )}
          <Toolbar>
            <Button size="sm" disabled={Boolean(storageBusy)} onClick={() => void handleCleanStorage(["historyImages"], "历史图片（含历史清单）")}>
              <Trash2 size={15} /><span>清理历史图片</span>
            </Button>
            <Button size="sm" disabled={Boolean(storageBusy)} onClick={() => void handleCleanStorage(["references"], "参考图缓存")}>
              <Trash2 size={15} /><span>清理参考图</span>
            </Button>
            <Button size="sm" disabled={Boolean(storageBusy)} onClick={() => void handleCleanStorage(["results"], "结果图缓存")}>
              <Trash2 size={15} /><span>清理结果缓存</span>
            </Button>
            <Button size="sm" onClick={() => void refreshStorageUsage()}>
              <RefreshCw size={15} /><span>刷新</span>
            </Button>
          </Toolbar>
          {!PUBLIC_RELEASE_MODE && (
            <>
              <Toolbar>
                <Button size="sm" onClick={() => void handleExportSeed()}>
                  <Download size={15} /><span>导出封装种子</span>
                </Button>
              </Toolbar>
              <p className="ui-field__hint">导出提示词模板与页面状态，随封装分发给客户（不含密钥与生成记录）</p>
              {seedExportMsg && <small className="ui-field__hint">{seedExportMsg}</small>}

              <Toolbar>
                <Button size="sm" onClick={() => void handleSyncSeed()} disabled={seedSyncing}>
                  <RefreshCw size={15} /><span>同步到封装配置</span>
                </Button>
              </Toolbar>
              <p className="ui-field__hint">把当前提示词模板与页面状态一键同步进仓库 seed/manifest.json，封装时自动带上，无需手动搬运种子文件。</p>
              {seedSyncMsg && <small className="ui-field__hint">{seedSyncMsg}</small>}
              {seedSyncStatus?.exists && (
                seedFresh ? (
                  <small className="ui-field__hint ui-field__hint--success">
                    封装配置同步于 {formatSyncTime(seedSyncStatus.syncedAt)} · {seedSyncStatus.entriesCount} 项
                  </small>
                ) : (
                  <small className="ui-field__hint ui-field__hint--warn">
                    浏览器有未同步改动，封装前请先点「同步到封装配置」
                  </small>
                )
              )}
            </>
          )}
          {storageStatus && <small className="ui-field__hint">{storageStatus}</small>}
        </Panel>
    </Modal>
  );
}
