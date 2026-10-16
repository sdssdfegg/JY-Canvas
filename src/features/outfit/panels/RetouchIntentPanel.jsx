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
  patchRetouchIntent,
  // V78（用户要求）：裁剪从结果区归位到「正反」同一行，与正反、4:3 组成三联。
  //   splitHalves 由上层按「正反已开」推导后传入，面板只负责显示与回调。
  splitHalves = false,
  onToggleSplitHalves,
  // V78：原结果区那条 splitNote 状态条并入裁剪钮的 title（它承载保存链路的实时反馈，不能随状态条一起丢）。
  splitNote = ""
}) {
  const frontbackOn = retouchIntent.frontback === "on";
  const splitTitle = frontbackOn
    ? "把生成的结果从中线竖切成左右两张，分别保存；当前已开启，可手动关闭"
    : "先开启「正反」才会启用：把生成的结果从中线竖切成左右两张，分别保存";
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
          className={`retouchFrontbackSwitch ${frontbackOn ? "on" : ""}`}
          aria-pressed={frontbackOn ? "true" : "false"}
          onClick={() => patchRetouchIntent({ frontback: frontbackOn ? "off" : "on" })}
          title="开启后：在提示词最前插入正反平铺俯视固定段，并联动出图比例 4:3、自动开启中线裁剪；再点关闭则移除该段、恢复开启前的比例并一起关闭裁剪"
        >
          <span>正反</span>
          <i><b /></i>
        </button>
        {/* V78：裁剪紧挨正反钮（同一行联动）——单项门：正反关闭时禁用，由「正反」统一带开关。 */}
        <button
          type="button"
          className={`whiteRefineSplitSwitch ${splitHalves ? "on" : ""}`}
          aria-pressed={splitHalves ? "true" : "false"}
          disabled={!frontbackOn}
          onClick={() => onToggleSplitHalves?.()}
          title={splitNote ? `${splitTitle}　｜　${splitNote}` : splitTitle}
        >
          <span>裁剪</span>
          <i><b /></i>
        </button>
      </div>
    </section>
  );
}
