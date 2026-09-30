#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""按名字清理 import（搬运重构配套工具）。

每搬走一块，源文件里就会留下一批「已不再使用」的 import。
ESLint 能给出精确名单，删的动作却是机械而容易出错的
（单行单成员 / 单行多成员 / 多行块三种形态各不相同，且文件是 CRLF）。

用法：
    python scripts/dev/prune-imports.py server/index.js NAME1 NAME2 ...

只删 import 语句里的成员，不动任何其它代码。
成员全部删空时，整条 import 一并移除。
"""
from __future__ import annotations

import io
import re
import sys

SINGLE_RE = re.compile(r'^import \{ (?:[A-Za-z_$][\w$]*, )*([A-Za-z_$][\w$]*)(?:, [A-Za-z_$][\w$]*)* \} from "')
MULTI_RE = re.compile(r'^import \{ (.+) \} from "(.*)";$')


def prune_member_list(body: str, names: set[str]) -> str:
    parts = [p.strip() for p in body.split(",") if p.strip()]
    keep = [p for p in parts if p not in names]
    return ", ".join(keep)


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 1
    target = sys.argv[1]
    names = set(sys.argv[2:])
    if not names:
        print("没有要删的成员名")
        return 1

    with io.open(target, encoding="utf-8", newline="") as fh:
        lines = fh.read().split("\n")
    cr = "\r" if lines and lines[0].endswith("\r") else ""

    removed: list[str] = []
    out: list[str] = []
    i = 0
    while i < len(lines):
        raw = lines[i].rstrip("\r")

        # 形态一：多行块 import {
        if raw == "import {":
            j = i + 1
            members: list[str] = []
            closing = None
            while j < len(lines):
                rj = lines[j].rstrip("\r")
                if rj.startswith('} from "'):
                    closing = rj
                    break
                members.append(lines[j])
                j += 1
            if closing is not None:
                keep = [m for m in members if m.strip().rstrip(",") not in names]
                gone = [m.strip().rstrip(",") for m in members if m.strip().rstrip(",") in names]
                removed.extend(gone)
                if keep:
                    out.append(lines[i])
                    out.extend(keep)
                    if keep[-1].strip().endswith(","):
                        out[-1] = ("  " + keep[-1].strip().rstrip(",")) + (cr if cr else "")
                    out.append(closing + (cr if cr else ""))
                i = j + 1
                continue

        # 形态二/三：单行 import { ... } from "...";
        m = MULTI_RE.match(raw)
        if m:
            body = m.group(1)
            parts = [p.strip() for p in body.split(",") if p.strip()]
            keep = [p for p in parts if p not in names]
            removed.extend([p for p in parts if p in names])
            if keep:
                out.append('import { %s } from "%s";' % (", ".join(keep), m.group(2)) + (cr if cr else ""))
            i += 1
            continue

        out.append(lines[i])
        i += 1

    with io.open(target, "w", encoding="utf-8", newline="") as fh:
        fh.write("\n".join(out))
    print("已移除 %d 个成员: %s" % (len(removed), ", ".join(removed) or "（无）"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
