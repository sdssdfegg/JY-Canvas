// V56（P3-1）：设置弹窗的纯逻辑 / hook（零 JSX）。
// 从 src/main.jsx 抽出：存储用量 / 连接测试 / Key 显隐与保存 这几组「仅弹窗私有」的状态与副作用。
// 共享状态（settings / config / saveDirectory 三件套 / isSettingsOpen / isDirectoryModalOpen）仍由 App() 持有并下发，
// 不在此处定义——否则 P3-6 快捷生成等其它视图读不到全局 KEY 与保存目录。
import { useEffect, useState } from "react";
import { cleanStorageTargets, getStorageUsage, revealStorageDir } from "../../api/storage.js";
import { formatConnectionResult, testConnection } from "../../api/connection.js";
import { normalizeApiKeyInput, testApiConnection } from "../auth/api-key.js";
import { formatStorageSize } from "../storage/storage-store.js";
import { writeJsonStorage } from "../../lib/storage/json-storage.js";
import { STORAGE_KEY } from "../../shared/app-defaults.js";

export const themeOptions = [
  { value: "dark", label: "暗夜", colors: ["#080910", "#151522", "#10cfc4"] },
  { value: "jade", label: "柔粉", colors: ["#fff2f7", "#fffafd", "#ec6f9e"] },
  { value: "graphite", label: "米杏", colors: ["#f3e6d4", "#fff8ec", "#c98652"] },
  { value: "mist", label: "浅雾", colors: ["#f5f7fa", "#ffffff", "#0d7a76"] }
];

// deps 来自 App() 的共享状态 / 回调：
//   settings        —— 全局 KEY 源（saveApiKey / runConnectionTest 读取最新值）
//   setSettings     —— 写回全局 settings
//   config          —— 全局 config（hasServerKey / routing / models）
//   addEvent        —— App() 的事件流水回调
//   isSettingsOpen  —— 控制「打开弹窗即拉取存储用量」的副作用
export function useSettingsState({ settings, setSettings, config, addEvent, isSettingsOpen }) {
  const [storageUsage, setStorageUsage] = useState(null);
  const [storageBusy, setStorageBusy] = useState("");
  const [storageStatus, setStorageStatus] = useState("");
  const [isApiKeyVisible, setIsApiKeyVisible] = useState(false);
  const [apiSaveStatus, setApiSaveStatus] = useState("");
  // 2026-09-25：设置里原有的「开发诊断」区域（含传参自检按钮）已整体替换为「连接测试」。
  const [isConnectionTesting, setIsConnectionTesting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState("");
  const [connectionState, setConnectionState] = useState("idle");

  const refreshStorageUsage = async () => {
    try {
      const data = await getStorageUsage();
      if (data?.ok) setStorageUsage(data);
    } catch (error) {
      setStorageStatus(`读取存储用量失败：${error?.message || error}`);
    }
  };

  useEffect(() => {
    if (!isSettingsOpen) return;
    setStorageStatus("");
    void refreshStorageUsage();
  }, [isSettingsOpen]);

  const handleRevealStorage = async (target) => {
    try {
      const data = await revealStorageDir(target);
      setStorageStatus(data?.ok ? `已打开：${data.path}` : `打开失败：${data?.error || "未知错误"}`);
    } catch (error) {
      setStorageStatus(`打开失败：${error?.message || error}`);
    }
  };

  const handleCleanStorage = async (targets, label) => {
    const confirmed = window.confirm(`确定清理${label}吗？\n\n这会直接删除磁盘上的文件，无法撤销。`);
    if (!confirmed) return;
    setStorageBusy(targets.join(","));
    setStorageStatus(`正在清理${label}…`);
    try {
      const data = await cleanStorageTargets(targets);
      if (data?.ok) {
        setStorageUsage(data);
        const removed = (data.report || []).reduce((sum, item) => sum + (item.removedFiles || 0), 0);
        const freed = (data.report || []).reduce((sum, item) => sum + (item.freedBytes || 0), 0);
        setStorageStatus(`${label}完成：删除 ${removed} 个文件，释放 ${formatStorageSize(freed)}`);
      } else {
        setStorageStatus(`清理失败：${data?.error || "未知错误"}`);
      }
    } catch (error) {
      setStorageStatus(`清理失败：${error?.message || error}`);
    } finally {
      setStorageBusy("");
    }
  };

  const saveApiKey = () => {
    const cleanedKey = normalizeApiKeyInput(settings.apiKey);
    const nextSettings = { ...settings, apiKey: cleanedKey };
    setSettings(nextSettings);
    writeJsonStorage(STORAGE_KEY, nextSettings);
    setApiSaveStatus(cleanedKey ? `已清理格式并保存（长度 ${cleanedKey.length}）` : "已清空本机 Key");
    addEvent("设置", "API Key 已保存");
    window.setTimeout(() => setApiSaveStatus(""), 1800);
  };

  // 连通性测试的实现在 src/features/auth/api-key.js（两侧同一份，23 行逐字节一致）。
  // 这里只保留闭包绑定壳：每次 render 重建，捕获最新的 settings / config 与各 setter。
  const runConnectionTest = () => testApiConnection({
    setIsConnectionTesting,
    setConnectionState,
    setConnectionStatus,
    settings,
    config,
    testConnection,
    formatConnectionResult,
    addEvent
  });

  return {
    storageUsage,
    storageBusy,
    storageStatus,
    isApiKeyVisible,
    setIsApiKeyVisible,
    apiSaveStatus,
    isConnectionTesting,
    connectionStatus,
    connectionState,
    refreshStorageUsage,
    handleRevealStorage,
    handleCleanStorage,
    saveApiKey,
    runConnectionTest
  };
}
