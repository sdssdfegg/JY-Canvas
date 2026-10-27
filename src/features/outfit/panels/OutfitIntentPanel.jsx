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
  OUTFIT_PART_OPTIONS,
  UPPER_LAYER_OPTIONS,
  WEARING_MODE_OPTIONS
} from "../../../shared/outfit-intent.js";
import { ModuleHeader } from "../../../shared/ui/ModuleHeader";

// 掩膜约束档位（P1-8.1）：与后端 MASK_MODE_CLAUSE 的 key 保持一致（none / garment / body）。
const OUTFIT_MASK_MODE_OPTIONS = [
  { value: "none", label: "关闭" },
  { value: "garment", label: "服装区" },
  { value: "body", label: "人体区" }
];

export function OutfitIntentPanel({
  outfitIntent,
  /* V77 Park：层级说明句停用，但父级仍按原名传入 —— 别名 _ 前缀（eslint 允许的未使用参数命名），
     恢复 = 去掉 _ 前缀并还原「将写作「图2的…」」说明句。 */
  outfitLayer: _outfitLayer,
  outfitPreview,
  outfitWearingFieldList,
  wearingDetailOpen,
  setWearingDetailOpen,
  toggleOutfitPart,
  patchOutfitIntent,
  updateOutfitWearingValue,
  wearingFieldValue,
  // P1-8.1：掩膜约束档位（none / garment / body），由父级 settings.maskMode 驱动。
  maskMode,
  onMaskModeChange
}) {
  const parts = outfitIntent.parts;
  // V77（§3.5 已确认删）：keepLabels / layerHint / outfitWearingTextSummary 三个纯说明性文案及其
  // 派生计算随「未选择部位保持图1原样：…」「将写作「图2的…」」、穿法摘要句一起停用（纯 UI 文案，无数据流）。

  return (
    <section className="outfitIntentPanel" aria-label="换装设置">
      <ModuleHeader
        title="换装设置"
        action={<span className={`outfitIntentCount ${parts.length === 0 ? "warn" : ""}`}>
          {parts.length === 0 ? "未选择更换部位" : `已选 ${parts.length} 个部位`}
        </span>}
      />

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
        {parts.length === 0 && (
          <small className="outfitIntentWarn">至少选择一个更换部位才能生成</small>
        )}
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
          {/* V77（§3.5 已确认删）：「将写作「图2的…」」层级说明句 */}
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
          {/* V77（§3.5 已确认删）：穿法摘要句（自然/自定义/跟随图2穿法的说明文字） */}
          {outfitIntent.wearing.mode === "custom" && (
            <button className="imageFactToggle" type="button" onClick={() => setWearingDetailOpen((value) => !value)} aria-expanded={wearingDetailOpen}>
              {wearingDetailOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              <span>{wearingDetailOpen ? "收起详细设置" : "展开详细设置"}</span>
            </button>
          )}
        </div>
      </div>

      <div className="outfitIntentRow">
        <span className="outfitIntentRowTitle">掩膜约束</span>
        <div className="outfitIntentChips">
          {OUTFIT_MASK_MODE_OPTIONS.map((mode) => {
            const active = maskMode === mode.value;
            return (
              <button
                className={active ? "active" : ""}
                key={mode.value}
                type="button"
                aria-pressed={active}
                onClick={() => onMaskModeChange(mode.value)}
              >
                {active && <Check size={13} />}
                <span>{mode.label}</span>
              </button>
            );
          })}
        </div>
        <small className="outfitIntentHint">仅提示词约束，当前模型不做区域锁定</small>
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
