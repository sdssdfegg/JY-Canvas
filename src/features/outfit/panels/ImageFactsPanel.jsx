// src/features/outfit/panels/ImageFactsPanel.jsx
// V65 (P5-3) 2026-10-15：从 src/outfit-workflow.jsx renderImageFactsPanel（3184–3250，派发日实测）逐字搬出。
// 内容：图2 卡片里的「图2服装事实」面板——只做分析 + 查看/修改结构化事实，不产生任何提示词文本。
//   头部状态（过期提醒 / 已识别项数）+ 分析按钮 + 摘要 + 可展开的字段编辑器。
// 模式：原函数内引用的 state/handler 全部改为 props（名字与搬出前一致，JSX 一行不动）；
//   模块级常量（OUTFIT_FACT_FIELDS / FACT_UNRECOGNIZED）从 shared/outfit-intent.js 直接 import。
//   ⚠️ props 漏项 = 运行期 undefined（vite build 验不出），由 V65 §3.2 负向对照兜底。
import { ChevronDown, ChevronUp, Loader2, Sparkles } from "lucide-react";
import { FACT_UNRECOGNIZED, OUTFIT_FACT_FIELDS } from "../../../shared/outfit-intent.js";
import { Button } from "../../../shared/ui/Button";
import { ModuleHeader } from "../../../shared/ui/ModuleHeader";

export function ImageFactsPanel({
  outfitIntent,
  selectedFixedClothing,
  outfitIntentSummary,
  outfitRecognizedFacts,
  imageFactsAnalyzing,
  factsDetailOpen,
  setFactsDetailOpen,
  analyzeImageFacts,
  updateOutfitFact
}) {
  const factsSource = outfitIntent.factsSource;
  const stale = Boolean(factsSource.sourceId)
    && Boolean(selectedFixedClothing?.id)
    && factsSource.sourceId !== selectedFixedClothing.id;
  const visibleFields = OUTFIT_FACT_FIELDS.filter((field) => field.parts.some((part) => outfitIntent.parts.includes(part)));
  const summary = visibleFields
    .map((field) => {
      const value = outfitIntent.facts[field.key];
      if (!value || value === FACT_UNRECOGNIZED) return "";
      return `${field.label}：${value}`;
    })
    .filter(Boolean)
    .join("；");
  return (
    <div className="imageFactPanel">
      <ModuleHeader
        icon={<Sparkles size={13} />}
        title="图2服装事实"
        subtitle={outfitIntent.parts.length === 0
          ? "先在下方「更换部位」里选部位，分析才知道该提取什么"
          : stale
            ? "图2已更换，这份事实可能过期，建议重新分析"
            : `只保留本次所选部位（${outfitIntentSummary.replaceText}）的服装事实`}
        action={<em>{outfitRecognizedFacts.length > 0 ? `已识别 ${outfitRecognizedFacts.length} 项` : "未识别"}</em>}
      />
      <div className="imageFactActions">
        <Button
          size="sm"
          type="button"
          onClick={() => void analyzeImageFacts()}
          disabled={imageFactsAnalyzing}
          title="读取当前图2的服装事实（不会覆盖你的部位/层级/穿法选择，也不会覆盖你手改过的内容）"
        >
          {imageFactsAnalyzing ? <Loader2 className="spin" size={14} /> : <Sparkles size={14} />}
          <span>{imageFactsAnalyzing ? "分析中" : "分析当前图2"}</span>
        </Button>
        <button className="imageFactToggle" type="button" onClick={() => setFactsDetailOpen((value) => !value)} aria-expanded={factsDetailOpen}>
          {factsDetailOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          <span>{factsDetailOpen ? "收起" : "查看/修改摘要"}</span>
        </button>
      </div>
      <p className="imageFactSummary">
        {summary || "还没分析：可以点「分析当前图2」自动读取，也可以留空完全靠手写。"}
      </p>
      {factsDetailOpen && (
        <div className="imageFactEditor">
          {visibleFields.length === 0 && <small>请先选择更换部位，才会出现对应的服装事实字段。</small>}
          {visibleFields.map((field) => (
            <label key={field.key}>
              <span>{field.label}</span>
              <input
                value={outfitIntent.facts[field.key] === FACT_UNRECOGNIZED ? "" : outfitIntent.facts[field.key]}
                placeholder={FACT_UNRECOGNIZED}
                onChange={(event) => updateOutfitFact(field.key, event.target.value)}
              />
            </label>
          ))}
          {visibleFields.length > 0 && (
            <small>留空或写「未识别」就表示这一项没有可用事实，不会写进最终提示词。</small>
          )}
        </div>
      )}
    </div>
  );
}
