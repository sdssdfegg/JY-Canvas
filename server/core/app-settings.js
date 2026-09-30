// 应用设置与素材保存目录。
//
// 从 server/index.js 原样搬来，**没有任何逻辑改动**。
//
// 这里管三件事：
//   1. app-settings.json 的读写（目前只有 saveDirectory 一个键）
//   2. 保存目录的可用性校验：不存在 / 乱码路径一律回退到默认目录
//   3. 发现设置里的目录不可用时，自动纠正并写回
//
// 两个容易踩的细节，都来自历史故障：
//   - hasDamagedPathText 里的那几个字符串是**目录名乱码**的特征值
//     （Windows 中文路径在某些打包环节会被二次编码再反转回来），
//     一旦匹配说明这个路径已经不是用户真正选的那个，必须回退；
//   - getSaveDirectory 会把纠正后的目录写回 app-settings.json，
//     所以用户下次打开看到的路径是纠正后的，不是他当时填的那个。

import path from "node:path";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { appSettingsFile, dataDir, rootDir } from "./app-paths.js";

export function defaultSaveDirectory() {
  return process.env.SAVE_DIRECTORY || path.join(rootDir, "data", "asset-library");
}

export function hasDamagedPathText(value) {
  return /[\uFFFD]|闈欓煶|缁樼敾|����|\?\?\?/.test(String(value || ""));
}

export async function isExistingDirectory(directory) {
  try {
    return (await stat(directory)).isDirectory();
  } catch {
    return false;
  }
}

export async function normalizeUsableSaveDirectory(directory) {
  const fallback = path.resolve(defaultSaveDirectory());
  const raw = String(directory || "").trim();
  if (!raw || hasDamagedPathText(raw)) return fallback;

  const resolved = path.resolve(raw);
  if (await isExistingDirectory(resolved)) return resolved;

  return fallback;
}

export async function readAppSettings() {
  try {
    const text = await readFile(appSettingsFile, "utf8");
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export async function writeAppSettings(nextSettings) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(appSettingsFile, JSON.stringify(nextSettings, null, 2), "utf8");
}

export async function getSaveDirectory() {
  const settings = await readAppSettings();
  const directory = await normalizeUsableSaveDirectory(settings.saveDirectory);
  await mkdir(directory, { recursive: true });
  if (settings.saveDirectory !== directory) {
    await writeAppSettings({ ...settings, saveDirectory: directory });
  }
  return directory;
}

export async function setSaveDirectory(directory) {
  const resolved = await normalizeUsableSaveDirectory(directory);
  await mkdir(resolved, { recursive: true });
  const current = await readAppSettings();
  await writeAppSettings({ ...current, saveDirectory: resolved });
  return resolved;
}
