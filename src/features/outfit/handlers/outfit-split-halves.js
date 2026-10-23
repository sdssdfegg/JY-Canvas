// 模式：沿用 P6-1/P6-2 的 deps 注入薄壳（V134 第三刀：拆分半幅域）。
// 域内自含：splitHalves / splitNote 两状态 + 3 个 handler；外部依赖只注入：
//   retouchIntent（本地派生）/ patchRetouchIntent（useOutfitSettingsIntent 返回）。
// 行为契约（逐字迁移自 outfit-workflow.jsx，V134 验收基准；V78 裁决随迁）：
//   - V78 单向门：裁剪只有开「正反」才算数。派生口径（splitHalvesActive）留组件侧计算，
//     因为 splitHalves 持久化口径是"默认开"（3.0 口径）而 frontback 默认关，二者初值不一致；
//   - 联动开/关（需求 R2/R3）：patchRetouchIntent 的 frontback 变化在本包装层联动 splitHalves；
//     4:3 比例联动仍在 hook 的 patchRetouchIntent 原处（"唯一改动意图的入口"不破坏）；
//   - 位置理由：splitHalves 的 state 原在 outfit-workflow.jsx，useOutfitSettingsIntent 内
//     拿不到 setter，故联动写在包装层而非 hook 里——本模块即该包装层的落点；
//   - splitNote 保留理由：outfit-save-handlers 的 splitWhiteRefineResult 会往这里写实时状态
//     （"正在从中线裁切…" / "已裁切保存到：…" / "裁切失败：…"），属业务实时反馈而非静态说明句。
import { useState } from "react";
import { readSplitHalvesEnabled, writeSplitHalvesEnabled } from "../../../shared/image-split.js";

export function useOutfitSplitHalvesHandlers(ctx) {
  const { retouchIntent, patchRetouchIntent } = ctx;
  const [splitHalves, setSplitHalves] = useState(() => readSplitHalvesEnabled());
  const [splitNote, setSplitNote] = useState("");

  function applySplitHalves(next) {
    setSplitHalves(next);
    writeSplitHalvesEnabled(next);
  }

  function toggleSplitHalves() {
    applySplitHalves(!splitHalves);
  }

  function patchRetouchIntentWithSplit(patch) {
    const nextPatch = typeof patch === "function" ? patch(retouchIntent) : patch;
    if (nextPatch && Object.prototype.hasOwnProperty.call(nextPatch, "frontback")) {
      const frontbackOn = retouchIntent.frontback === "on";
      if (nextPatch.frontback === "on" && !frontbackOn) applySplitHalves(true);
      else if (nextPatch.frontback === "off" && frontbackOn) applySplitHalves(false);
    }
    patchRetouchIntent(patch);
  }

  return {
    splitHalves,
    splitNote,
    setSplitNote,
    toggleSplitHalves,
    patchRetouchIntentWithSplit
  };
}
