// 模式：V5.0-011——改色部位/层级域整块迁入本 hook。
// 域 = 原 src/outfit-workflow.jsx 的两个函数（selectRecolorPart → selectRecolorUpperLayer），按原声明顺序逐字迁移。
// 行为契约：零行为变化（纯迁移）——两个函数体逐字不动。
// 调用点约束：调用方须将 useOutfitRecolorPart 置于 useOutfitSettingsIntent 之后（ctx 消费 addEvent）；
//   派生值 recolorPart / recolorUpperLayer 留在组件（喂 OutfitComposer props）经 ctx 注入；
//   消费方仅 JSX（OutfitComposer 的 .outfitIntentChips），无其他时序约束；
//   本 hook 是纯函数工厂（内部无任何 React hook）⇒ 无 hook 顺序影响。
import {
  normalizeRecolorPart,
  normalizeRecolorUpperLayer,
  RECOLOR_PART_WORDS,
  replaceRecolorPartWords,
  replaceRecolorUpperLayerWords,
  replaceUpperLayerWordsWithPart,
  RECOLOR_PART_OPTIONS
} from "../outfit-top.js";
import { UPPER_LAYER_OPTIONS } from "../../../shared/outfit-intent.js";

export function useOutfitRecolorPart(ctx) {
  const {
    settings, setSettings,
    recolorPart, recolorUpperLayer,
    addEvent
  } = ctx;

  function selectRecolorPart(nextPart) {
    const part = normalizeRecolorPart(nextPart);
    // 用户主动切部位：提示词正文里全部部位类别词统一换成新部位的词（单部位改色，4 处词应始终一致；
    // 即便之前手动改过词导致状态与正文错位，切一次部位也整体对齐。不再早退，保证实时同步）。
    const partPrompt = replaceRecolorPartWords(settings.prompt, recolorPart, part);
    // V125 修复：切到非上装部位（下装/连衣裙/鞋子）时，正文里残留的「上装层级词」（内搭/外套/内搭和外套）
    // 已无意义，必须随部位一起换算成新部位词——否则它们不在 RECOLOR_PART_WORDS 内、上一步不会动，
    // 表现为「层级非 single 时切下装/鞋子提示词不跟着变」。
    const nextPrompt = part === "upper"
      ? partPrompt
      : replaceUpperLayerWordsWithPart(partPrompt, (RECOLOR_PART_WORDS[part] || [])[0] || "下衣");
    // 离开上装区域即丢弃层级选择（层级仅在 更换部位=上装 有意义），避免状态与文案错位。
    setSettings((current) => ({
      ...current,
      recolorPart: part,
      prompt: nextPrompt,
      recolorUpperLayer: part === "upper" ? recolorUpperLayer : "single"
    }));
    const label = RECOLOR_PART_OPTIONS.find((item) => item.value === part)?.label || part;
    addEvent("更换部位", `改色部位已切换为「${label}」`);
    // V117（用户要求·联动兜底）：正文无部位词时不改写（保护手写），但必须给出可见反馈，否则用户看到"点了没反应"。
    if (nextPrompt === String(settings.prompt || "")) {
      addEvent("更换部位", "提示词里没有检测到可替换的服装类别词（上衣/下衣/连衣裙/鞋子），已保留你的手写提示词");
    }
  }
  function selectRecolorUpperLayer(nextLayer) {
    const layer = normalizeRecolorUpperLayer(nextLayer);
    if (layer === recolorUpperLayer) return;
    // V113-R1（用户要求）：层级切换联动提示词——把正文里的层级词（single 时为上装部位词）整体换成新层级的词；
    // 正文没有任何层级词/部位词时不改动（保护手写内容，与「更换部位」联动同一口径）。
    const partWord = (RECOLOR_PART_WORDS[normalizeRecolorPart(settings.recolorPart)] || RECOLOR_PART_WORDS.upper)[0] || "上衣";
    const nextPrompt = replaceRecolorUpperLayerWords(settings.prompt, recolorUpperLayer, layer, partWord);
    setSettings((current) => ({ ...current, recolorUpperLayer: layer, prompt: nextPrompt }));
    const label = UPPER_LAYER_OPTIONS.find((item) => item.value === layer)?.label || layer;
    addEvent("上装层级", `已切换为「${label}」`);
    // V117（用户要求·联动兜底）：正文无层级词/上装部位词时不改写（保护手写），给出可见反馈。
    if (nextPrompt === String(settings.prompt || "")) {
      addEvent("上装层级", "提示词里没有检测到可替换的上装层级词（内搭/外套/内外叠穿）或上装部位词（上衣），已保留你的手写提示词");
    }
  }

  return { selectRecolorPart, selectRecolorUpperLayer };
}
