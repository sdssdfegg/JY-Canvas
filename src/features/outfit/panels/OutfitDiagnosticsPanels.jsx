// V5.0-009：本文件从 src/features/outfit/outfit-panels.jsx 逐字拆出（原 2169–2192 与 2206–2262 行）。
// 拆分单见 docs/执行单/ 的 V5.0-009（拆分 outfit-panels 堆积文件）。
// 内容：局部贴回 / 裁剪回流两个诊断面板及其 summary（原 outfit-panels 的 H 区，不含 LegacyModulePanel）。
import { fileSize } from "../../../lib/format/index.js";
import { ModuleHeader } from "../../../shared/ui/ModuleHeader";
import { normalizeCropReturnMeta } from "../outfit-task.js";

export function LocalPasteDiagnosticsPanel({ image }) {
  const summary = localPasteDiagnosticSummary(image);
  if (!summary) return null;
  return (
    <section className="previewLocalPastePanel">
      <ModuleHeader title={summary.title} />
      <div className="previewQualityFacts">
        {summary.items.map((item) => <span key={item}>{item}</span>)}
      </div>
    </section>
  );
}
export function CropReturnDiagnosticsPanel({ image }) {
  const summary = cropReturnDiagnosticSummary(image);
  if (!summary) return null;
  return (
    <section className="previewCropReturnPanel">
      <ModuleHeader title={summary.title} />
      <div className="previewQualityFacts">
        {summary.items.map((item) => <span key={item}>{item}</span>)}
      </div>
    </section>
  );
}
export function localPasteDiagnosticSummary(image) {
  const diagnostics = image?.localEdit?.diagnostics;
  if (!diagnostics) return null;
  const align = diagnostics.align || {};
  const color = diagnostics.colorMatchDetail || {};
  const neutral = diagnostics.neutralToneMatchDetail || {};
  const paste = diagnostics.pasteRect || {};
  const binding = diagnostics.taskBinding || {};
  const sharpen = diagnostics.sharpen || {};
  const output = diagnostics.output || {};
  const items = [
    diagnostics.strategy ? `策略 ${diagnostics.strategy}` : "",
    binding.modelName ? `图1 ${binding.modelName}` : "",
    binding.batchMode ? `批量 ${binding.batchMode}` : "",
    Number.isFinite(binding.cropQuality) && binding.cropQuality > 0 ? `裁剪 Q${binding.cropQuality}` : "",
    output.lossless ? "输出 PNG无损" : output.quality ? `输出 Q${output.quality}` : "",
    diagnostics.autoAlign
      ? `对齐 ${align.applied ? `${align.dx || 0},${align.dy || 0}` : align.reason || "未偏移"}`
      : "对齐 关闭",
    diagnostics.colorMatch
      ? `色彩 ${color.applied ? `${color.deltaR ?? 0}/${color.deltaG ?? 0}/${color.deltaB ?? 0}` : color.reason || "未调整"}`
      : "色彩 关闭",
    diagnostics.neutralToneMatch
      ? `中性色偏 ${neutral.applied ? `${neutral.deltaR ?? 0}/${neutral.deltaG ?? 0}/${neutral.deltaB ?? 0}` : neutral.reason || "未调整"}`
      : "",
    diagnostics.sharpenPatch
      ? `清晰 ${sharpen.applied ? "补偿" : sharpen.reason || "未补偿"}`
      : "",
    Number.isFinite(diagnostics.feather) ? `羽化 ${diagnostics.feather}px` : "",
    paste.width && paste.height ? `贴回 ${paste.width}x${paste.height}` : ""
  ].filter(Boolean);
  if (!items.length) return null;
  return {
    title: diagnostics.hasMask ? "局部回贴诊断 · 蒙版" : "局部回贴诊断",
    items
  };
}
export function cropReturnDiagnosticSummary(image) {
  const cropReturn = normalizeCropReturnMeta(image?.cropReturn);
  if (!cropReturn?.cropRect) return null;
  const diagnostics = image?.cropReturn?.diagnostics || {};
  const output = diagnostics.output || {};
  const items = [
    diagnostics.strategy ? `策略 ${diagnostics.strategy}` : "",
    cropReturn.sourceWidth && cropReturn.sourceHeight ? `原图 ${cropReturn.sourceWidth}x${cropReturn.sourceHeight}` : "",
    cropReturn.cropRect.width && cropReturn.cropRect.height ? `裁剪 ${cropReturn.cropRect.width}x${cropReturn.cropRect.height}` : "",
    cropReturn.outputWidth && cropReturn.outputHeight ? `大图 ${cropReturn.outputWidth}x${cropReturn.outputHeight}` : "",
    diagnostics.generatedWidth && diagnostics.generatedHeight ? `生成 ${diagnostics.generatedWidth}x${diagnostics.generatedHeight}` : "",
    output.quality ? `输出 Q${output.quality}` : "",
    output.bytes ? `文件 ${fileSize(output.bytes)}` : ""
  ].filter(Boolean);
  if (!items.length) return null;
  return {
    title: "裁剪回流诊断",
    items
  };
}
