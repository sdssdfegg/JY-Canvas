// src/features/outfit/panels/OutfitIntentPanel.jsx
// V65 (P5-3) 2026-10-15：从 src/outfit-workflow.jsx renderOutfitIntentPanel（3254–3380）+ 其独占助手
//   outfitWearingTextSummary（3383–3395）逐字搬出（该助手仅被本面板 3344 行消费，随件搬迁）。
// 内容：换装设置区（图1～图3下面）——更换部位 / 上装层级 / 穿法（模式 chips + custom 详细设置）+
//   意图编译警告列表。旧的「单件上衣 / 外套+内搭 / 套装」顶层切换和「上装长度 / 下装长度」已删除，
//   长度只作为图2事实被分析出来，不再做成长短按钮（2026-09-26 口径，原样保留）。
// 模式：原函数内引用的 state/handler 全部改为 props（名字与搬出前一致，JSX 一行不动）；
//   模块级常量从 shared/outfit-intent.js 直接 import；助手函数随面板留在组件内（闭包 props）。
//   ⚠️ props 漏项 = 运行期 undefined（vite build 验不出），由 V65 §3.2 负向对照兜底。
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import {
  OUTFIT_KEEP_PART_VALUES,
  OUTFIT_PART_OPTIONS,
  UPPER_LAYER_OPTIONS,
  WEARING_MODE_OPTIONS
} from "../../../shared/outfit-intent.js";

export function OutfitIntentPanel({
  outfitIntent,
  outfitLayer,
  outfitPreview,
  outfitWearingFieldList,
  wearingDetailOpen,
  setWearingDetailOpen,
  toggleOutfitPart,
  patchOutfitIntent,
  updateOutfitWearingValue,
  wearingFieldValue
}) {
  const parts = outfitIntent.parts;
  // 保持列表口径与编译器一致：不含鞋子；选了连衣裙时也不列上装/下装。
  const keepLabels = OUTFIT_KEEP_PART_VALUES
    .filter((part) => !parts.includes(part))
    .filter((part) => !(parts.includes("dress") && (part === "upper" || part === "lower")))
    .map((part) => OUTFIT_PART_OPTIONS.find((item) => item.value === part)?.label || part)
    .join("、");
  // 2026-09-26：删掉「自动识别图2」后，层级一律由用户选，这里只说"会怎么写"。
  const layerHint = `将写作「图2的${outfitLayer.promptLabel}」`;

  // 穿法摘要：只说明"当前会怎么写"，不重复编译器的原句。
  function outfitWearingTextSummary() {
    if (outfitIntent.wearing.mode === "natural") return "按常规自然穿着，不刻意复刻图2穿法细节";
    if (outfitIntent.wearing.mode === "custom") {
      const picked = outfitWearingFieldList
        .map((field) => {
          const option = field.options.find((item) => item.value === wearingFieldValue(field.key));
          return option ? `${field.label}：${option.label}` : "";
        })
        .filter(Boolean);
      return picked.length ? picked.join("｜") : "还没指定任何状态，将只保留部位与图2事实";
    }
    return "跟随图2穿法，不自行改变扣合、衣摆、袖子和领口";
  }

  return (
    <section className="outfitIntentPanel" aria-label="换装设置">
      <header>
        <div>
          <h3>换装设置</h3>
          <span>这里的选择会进入最终提示词；批次开始后再改只影响下一批。</span>
        </div>
        <span className={`outfitIntentCount ${parts.length === 0 ? "warn" : ""}`}>
          {parts.length === 0 ? "未选择更换部位" : `已选 ${parts.length} 个部位`}
        </span>
      </header>

      <div className="outfitIntentRow">
        <span className="outfitIntentRowTitle">更换部位</span>
        <div className="outfitIntentChips">
          {OUTFIT_PART_OPTIONS.map((part) => {
            const active = parts.includes(part.value);
            return (
              <button
                className={active ? "active" : ""}
                key={part.value}
                type="button"
                aria-pressed={active}
                onClick={() => toggleOutfitPart(part.value)}
              >
                {active && <Check size={13} />}
                <span>{part.label}</span>
              </button>
            );
          })}
        </div>
        <small className={parts.length === 0 ? "outfitIntentWarn" : ""}>
          {parts.length === 0 ? "至少选择一个更换部位才能生成" : `未选择的部位保持图1原样：${keepLabels}`}
        </small>
      </div>

      {parts.includes("upper") && (
        <div className="outfitIntentRow">
          <span className="outfitIntentRowTitle">上装层级</span>
          <div className="outfitIntentChips">
            {UPPER_LAYER_OPTIONS.map((option) => {
              const active = outfitIntent.upperLayer === option.value;
              return (
                <button
                  className={active ? "active" : ""}
                  key={option.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => patchOutfitIntent({ upperLayer: option.value })}
                >
                  {active && <Check size={13} />}
                  <span>{option.label}</span>
                </button>
              );
            })}
          </div>
          <small className={outfitLayer.uncertain ? "outfitIntentWarn" : ""}>{layerHint}</small>
        </div>
      )}

      <div className="outfitIntentRow">
        <span className="outfitIntentRowTitle">穿法</span>
        <div className="outfitIntentChips">
          {WEARING_MODE_OPTIONS.map((mode) => {
            const active = outfitIntent.wearing.mode === mode.value;
            return (
              <button
                className={active ? "active" : ""}
                key={mode.value}
                type="button"
                aria-pressed={active}
                onClick={() => patchOutfitIntent({ wearing: { ...outfitIntent.wearing, mode: mode.value } })}
              >
                {active && <Check size={13} />}
                <span>{mode.label}</span>
              </button>
            );
          })}
        </div>
        <div className="outfitIntentInline">
          <small>{outfitWearingTextSummary()}</small>
          {outfitIntent.wearing.mode === "custom" && (
            <button className="imageFactToggle" type="button" onClick={() => setWearingDetailOpen((value) => !value)} aria-expanded={wearingDetailOpen}>
              {wearingDetailOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              <span>{wearingDetailOpen ? "收起详细设置" : "展开详细设置"}</span>
            </button>
          )}
        </div>
      </div>

      {outfitIntent.wearing.mode === "custom" && wearingDetailOpen && (
        <div className="outfitWearingEditor">
          {outfitWearingFieldList.length === 0 && (
            <small>当前部位没有可设置的穿法项目（鞋子不需要衣领和袖子，未选上装/下装时也不会出现对应项目）。</small>
          )}
          {outfitWearingFieldList.map((field) => (
            <label key={field.key}>
              <span>{field.label}</span>
              <select value={wearingFieldValue(field.key)} onChange={(event) => updateOutfitWearingValue(field.key, event.target.value)}>
                <option value="">不指定</option>
                {field.options.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          ))}
        </div>
      )}

      {outfitPreview.warnings.length > 0 && (
        <ul className="outfitIntentWarnings">
          {outfitPreview.warnings.map((warning) => <li key={warning}>{warning}</li>)}
        </ul>
      )}
    </section>
  );
}
