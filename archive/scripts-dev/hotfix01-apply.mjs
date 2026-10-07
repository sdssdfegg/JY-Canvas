// HOTFIX-01 补丁：修「应用裁剪」崩溃（8 个未定义 JSX 组件）+ 补 JSX 未定义门禁 + 修防抖输入框光标跳末尾
// 纪律：逐行保留行尾（CRLF），锚点命中数必须为 1，改完查 CRCR=0。
import { readFileSync, writeFileSync } from "node:fs";

const jobs = [
  {
    file: "src/features/crop/quick-crop-panels.jsx",
    from: [
      'import { useEffect, useRef, useState } from "react";',
      'import { cropQuickReferenceViewportFile, quickReferenceOriginalFile } from "../upload/reference-upload.js";',
      'import { ratioValue } from "../local-edit/crop-rect-resize.js";',
      'import { clampCropTransform } from "../../shared/local-edit-geometry.js";'
    ],
    to: [
      'import { useEffect, useRef, useState } from "react";',
      // RF-082 从 main.jsx 抽出本文件时，这两个 import 留在了 main.jsx：
      // 组件搬走了、它引用的图标与弹窗外壳没跟过来 ⇒ 运行到这些界面必抛 ReferenceError。
      // 复原自抽出前的 main.jsx（lucide 的 Folder 是真实图标，不是 FolderOpen）。
      'import { Crop, Folder, Image as ImageIcon, Loader2, RotateCcw, X } from "lucide-react";',
      'import { cropQuickReferenceViewportFile, quickReferenceOriginalFile } from "../upload/reference-upload.js";',
      'import { ratioValue } from "../local-edit/crop-rect-resize.js";',
      'import { clampCropTransform } from "../../shared/local-edit-geometry.js";',
      'import { Modal, ModalHeader } from "../../shared/ui/Modal.jsx";'
    ]
  },
  {
    file: "eslint.config.mjs",
    from: [
      '  "react/jsx-uses-vars": "error"',
      "};"
    ],
    to: [
      '  "react/jsx-uses-vars": "error",',
      "  // —— 它的孪生兄弟，补的是 no-undef 的一个**结构性盲区**：",
      "  // no-undef 只看 Identifier，而 JSX 标签是 JSXIdentifier ⇒ `<Modal />` 这种",
      "  // 「组件压根没 import」它一声不响，vite build 也照过（未定义标识符在打包期",
      "  // 只被当成运行期全局变量）。2026-10-05 实测事故：quick-crop-panels.jsx 里",
      "  // Modal / ModalHeader / Folder / ImageIcon / X / RotateCcw / Loader2 / Crop",
      "  // 共 8 个组件全部未定义，而 `npx eslint .` = 0 errors，带着 8 处必崩的界面发布了。",
      '  "react/jsx-no-undef": "error"',
      "};"
    ]
  },
  {
    file: "src/shared/DebouncedTextarea.jsx",
    from: [
      "  useEffect(() => {",
      '    const next = String(value ?? "");',
      "    latestCommittedRef.current = next;",
      "    setDraft((current) => (current === next ? current : next));",
      "  }, [value]);"
    ],
    to: [
      "  // 外部值回灌。⚠️ 这里必须挡住一个时序陷阱（2026-10-05 用户实测的「光标跳到末尾」）：",
      "  // 提交是防抖的（默认 260ms）：commit() 把文本交给父组件后，父组件要重渲染才把新 value 传回来；",
      "  // 而本项目父组件是 App / OutfitWorkflow 这种几千行的巨物，重渲染可能耗时上百毫秒。",
      "  // 用户在这段窗口里继续打字时 draft 已经领先于 value —— 无条件回灌就会抹掉刚敲的字符、",
      "  // 并把光标甩到末尾（用户看到的就是「打字打到一半突然跳到最后一个位置」）。",
      "  // 判据：value 等于「我们自己最后提交出去的那一份」⇒ 只是父组件的回声，不回灌。",
      "  useEffect(() => {",
      '    const next = String(value ?? "");',
      "    if (next === latestCommittedRef.current) return;",
      "    latestCommittedRef.current = next;",
      "    setDraft((current) => (current === next ? current : next));",
      "  }, [value]);"
    ]
  }
];

let bad = 0;
for (const job of jobs) {
  const buf = readFileSync(job.file);
  if (buf.includes(0)) { console.log("!! NUL in", job.file); bad++; continue; }
  const text = buf.toString("utf8");
  const lines = text.split("\n");
  const crs = lines.map((l) => l.endsWith("\r"));
  const body = lines.map((l) => (l.endsWith("\r") ? l.slice(0, -1) : l));

  const hitIdx = [];
  for (let i = 0; i + job.from.length <= body.length; i++) {
    if (job.from.every((f, k) => body[i + k] === f)) hitIdx.push(i);
  }
  if (hitIdx.length !== 1) {
    console.log("!! 锚点命中数 =", hitIdx.length, "（必须为 1）", job.file);
    bad++;
    continue;
  }
  const at = hitIdx[0];
  const crAt = crs[at];
  const next = [
    ...body.slice(0, at),
    ...job.to,
    ...body.slice(at + job.from.length)
  ];
  const out = next.map((l, i) => {
    const cr = i >= at && i < at + job.to.length ? crAt : crs[i < at ? i : i - (job.to.length - job.from.length)];
    return cr ? l + "\r" : l;
  }).join("\n");

  if (/\r\r\n/.test(out)) { console.log("!! CRCR 出现在", job.file); bad++; continue; }
  writeFileSync(job.file, Buffer.from(out, "utf8"), "utf8");

  const back = readFileSync(job.file).toString("utf8");
  const lineDelta = back.split("\n").length - lines.length;
  console.log(
    "OK".padEnd(4), job.file,
    "| 行 " + lines.length + "→" + back.split("\n").length + " (Δ" + lineDelta + ")",
    "| U+FFFD=" + (back.match(/\uFFFD/g) || []).length,
    "| CRCR=" + (back.match(/\r\r\n/g) || []).length
  );
}
console.log(bad ? "\n>>> 有 " + bad + " 处未应用，先别继续" : "\n>>> 全部应用成功");
process.stdout.write("");
