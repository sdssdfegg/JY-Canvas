#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Phase 1 重构的搬运工具：按行区间把代码块从巨石文件搬到独立模块。

为什么需要它：纯搬运重构里最危险的一类错误是「手抄笔误」——
它不报错、只悄悄改行为，而且往往几周后才在出图效果上暴露。
按行区间切割可以保证逐字节一致。

用法：
    python scripts/dev/move-block.py <spec.json>

spec.json 格式：
{
  "source": "server/index.js",            # 源文件
  "target": "server/core/xxx.js",         # 目标模块
  "header": "写进目标文件顶部的说明注释",     # 可选
  "imports": ["import path from \"node:path\";", ...],
  "blocks": [{"from": 825, "to": 883}]     # 1-based 闭区间，自动从后往前删
}

行为：
1. 按区间从源文件取出代码块（允许多个区间，按原始顺序拼接）
2. 只对**顶层定义**（行首的 function / async function / const / class）自动加 export
3. 把 header + imports + 代码体写进 target
4. 从源文件删除这些区间
5. 打印搬走了哪些名字，方便下一步对着 ESLint 的 no-undef 补 import
"""
from __future__ import annotations

import io
import json
import os
import re
import sys

DEF_RE = re.compile(r"^(async function|function|const|let|var|class)\s+([A-Za-z_$][\w$]*)")


def main() -> int:
    spec_path = sys.argv[1] if len(sys.argv) > 1 else "tmp/extract-spec.json"
    with io.open(spec_path, encoding="utf-8") as fh:
        spec = json.load(fh)

    src = spec["source"]
    dst = spec["target"]

    with io.open(src, encoding="utf-8", newline="") as fh:
        lines = fh.read().split("\n")

    blocks = sorted(spec["blocks"], key=lambda b: b["from"], reverse=True)
    order = sorted(range(len(blocks)), key=lambda i: blocks[i]["from"])

    pieces = []
    names: list[str] = []
    for i in order:
        b = blocks[i]
        chunk = lines[b["from"] - 1:b["to"]]
        pieces.append("\n".join(chunk))
        for line in chunk:
            m = DEF_RE.match(line)
            if m:
                names.append(m.group(2))

    body_lines = "\n\n".join(pieces).rstrip("\n").split("\n")
    exported: list[str] = []
    rewritten: list[str] = []
    for line in body_lines:
        m = DEF_RE.match(line)
        if m and m.group(2) in names:
            exported.append(m.group(2))
            line = "export " + line
        rewritten.append(line)
    body = "\n".join(rewritten)

    out: list[str] = []
    header = spec.get("header")
    if header:
        out.append(header.rstrip("\n"))
        out.append("")
    imports = spec.get("imports", [])
    for item in imports:
        out.append(item.rstrip("\n"))
    if imports:
        out.append("")
    out.append(body)
    out.append("")

    target_dir = os.path.dirname(dst)
    if target_dir:
        os.makedirs(target_dir, exist_ok=True)
    with io.open(dst, "w", encoding="utf-8", newline="") as fh:
        fh.write("\n".join(out))

    moved = sum(b["to"] - b["from"] + 1 for b in blocks)
    for b in blocks:
        del lines[b["from"] - 1:b["to"]]
    with io.open(src, "w", encoding="utf-8", newline="") as fh:
        fh.write("\n".join(lines))

    print("已搬走 %d 段 / %d 行 -> %s" % (len(blocks), moved, dst))
    print("导出 %d 个名字: %s" % (len(exported), ", ".join(exported)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
