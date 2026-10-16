// src/features/outfit/panels/RetouchIntentPanel.jsx
// V65 (P5-3) 2026-10-15：从 src/outfit-workflow.jsx renderRetouchIntentPanel（3400–3440，派发日实测）逐字搬出。
// 内容：精修设置区（位置与换装的换装设置一致：都在提示词区左半边）。
//   2026-09-26（按用户要求）：只留"选择按钮"，把标题/说明/摘要那一段不是按钮的显示全部去掉，
//   左侧因此省下不少高度；当前状态本来就体现在右边「通用白底精修提示词」框里。
// 模式：原函数内引用的 state/handler 全部改为 props（名字与搬出前一致，JSX 一行不动）；
//   模块级常量从 shared/retouch-intent.js 直接 import。
//   ⚠️ props 漏项 = 运行期 undefined（vite build 验不出），由 V65 §3.2 负向对照兜底。
import { Check } from "lucide-react";
import { RETOUCH_FIT_OPTIONS, RETOUCH_HEM_OPTIONS, RETOUCH_SYMMETRY_OPTIONS } from "../../../shared/retouch-intent.js";

export function RetouchIntentPanel({
  retouchIntent,
  patchRetouchIntent
}) {
  const chipGroup = (options, current, onPick) => options.map((option) => {
    const active = current === option.value;
    return (
      <button
        className={active ? "active" : ""}
        key={option.value}
        type="button"
        aria-pressed={active}
        onClick={() => onPick(option.value)}
      >
        {active && <Check size={13} />}
        <span>{option.label}</span>
      </button>
    );
  });
  return (
    <section className="retouchIntentPanel" aria-label="精修设置">
      <div className="retouchIntentRow">
        <span className="retouchIntentRowTitle">对称</span>
        <div className="retouchIntentChips">
          {chipGroup(RETOUCH_SYMMETRY_OPTIONS, retouchIntent.symmetry, (value) => patchRetouchIntent({ symmetry: value }))}
        </div>
      </div>

      <div className="retouchIntentRow">
        <span className="retouchIntentRowTitle">衣摆或裙摆</span>
        <div className="retouchIntentChips">
          {chipGroup(RETOUCH_HEM_OPTIONS, retouchIntent.hemTreatment, (value) => patchRetouchIntent({ hemTreatment: value }))}
        </div>
      </div>

      <div className="retouchIntentRow">
        <span className="retouchIntentRowTitle">版型</span>
        <div className="retouchIntentChips">
          {chipGroup(RETOUCH_FIT_OPTIONS, retouchIntent.fit, (value) => patchRetouchIntent({ fit: value }))}
        </div>
      </div>

      <div className="retouchIntentRow">
        <span className="retouchIntentRowTitle">正反</span>
        <button
          type="button"
          className={`retouchFrontbackSwitch ${retouchIntent.frontback === "on" ? "on" : ""}`}
          aria-pressed={retouchIntent.frontback === "on" ? "true" : "false"}
          onClick={() => patchRetouchIntent({ frontback: retouchIntent.frontback === "on" ? "off" : "on" })}
          title="开启后：在提示词最前插入正反平铺俯视固定段，并联动出图比例 4:3；再点关闭则移除该段并恢复开启前的比例"
        >
          <span>正反</span>
          <i><b /></i>
        </button>
      </div>
    </section>
  );
}
