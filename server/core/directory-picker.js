// 保存目录的选择 / 打开。
//
// 从 server/index.js 原样搬来（按行区间机器切割），**没有任何逻辑改动**。
//
// 为什么单独成文件：它只依赖 app-settings 与本机子进程（explorer / powershell），
// 跟路由、跟上传、跟出图逻辑都没有耦合。留在主文件里只会淹没在五千行中间。
//
// 依赖：
//   ./app-settings.js  — getSaveDirectory / setSaveDirectory / normalizeUsableSaveDirectory
//                         （不要在新文件里重新实现，统一走 app-settings）

import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { getSaveDirectory, normalizeUsableSaveDirectory, setSaveDirectory } from "./app-settings.js";

async function openDirectory(directory) {
  const resolved = await setSaveDirectory(directory || await getSaveDirectory());
  const child = spawn("explorer.exe", [resolved], {
    detached: true,
    stdio: "ignore",
    windowsHide: false
  });
  child.unref();
  return resolved;
}

async function pickDirectory(initialDirectory) {
  const normalizedInitialDirectory = await normalizeUsableSaveDirectory(initialDirectory);
  await mkdir(normalizedInitialDirectory, { recursive: true });
  return new Promise((resolve, reject) => {
    const script = [
      "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
      "Add-Type -AssemblyName System.Windows.Forms | Out-Null",
      "Add-Type -AssemblyName System.Drawing | Out-Null",
      "$owner = New-Object System.Windows.Forms.Form",
      "$owner.Text = 'Jingyin Directory Picker'",
      "$owner.ShowInTaskbar = $false",
      "$owner.StartPosition = 'Manual'",
      "$owner.Size = New-Object System.Drawing.Size(1, 1)",
      "$owner.Location = New-Object System.Drawing.Point(-32000, -32000)",
      "$owner.TopMost = $true",
      "$owner.Opacity = 0",
      "$null = $owner.Show()",
      "$owner.Activate()",
      "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog",
      "$dialog.Description = 'Select save directory'",
      "$dialog.ShowNewFolderButton = $true",
      "$dialog.RootFolder = [System.Environment+SpecialFolder]::MyComputer",
      "$initial = $env:JY_PICK_INITIAL",
      "if ($initial -and (Test-Path -LiteralPath $initial)) { $dialog.SelectedPath = $initial }",
      "try { $result = $dialog.ShowDialog($owner); if ($result -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $dialog.SelectedPath } } finally { $owner.Close(); $owner.Dispose(); $dialog.Dispose() }"
    ].join("; ");

    const child = spawn("powershell.exe", [
      "-NoProfile",
      "-STA",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      script
    ], {
      env: { ...process.env, JY_PICK_INITIAL: normalizedInitialDirectory },
      windowsHide: true
    });

    let stdout = "";
    let stderr = "";
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `目录选择器退出 ${code}`));
        return;
      }
      const directory = stdout.trim();
      resolve(directory ? path.resolve(directory) : "");
    });
  });
}

export { openDirectory, pickDirectory };
