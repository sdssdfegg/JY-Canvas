// src/features/outfit/outfit-top.js
// RF-081 (V26): 从 src/outfit-workflow.jsx 抽出的模块顶层纯函数 + 常量。
// 形态：普通模块导出（非 B3 工厂）；只被 outfit-workflow.jsx 单向 import，自身绝不反向 import outfit。
//
// 🔴 本文件 defaultLocalEditCrop 与 src/features/local-edit/crop-rect-resize.js 的 defaultQuickLocalEditCrop 是「真分叉」
//    （RF-082 S5 从 src/main.jsx 迁入 crop-rect-resize.js，此处同步更新指向）：
//    outfit 侧语义 = fitRectToRatioLocked(null,…) 一行包装；main 侧保留「普通裁剪自由矩形」语义。
//    两侧常量不同源、语义不同，严禁合并、严禁互相 import。见冷启动「局部回帖分叉裁定」。
import { fetchImageBlob } from "../../api/assets.js";
import { normalizeApiKeyInput } from "../auth/api-key.js";
import { DEFAULT_PREPROCESS_MODE, MAX_UPLOAD_IMAGES, compressOriginalImageFile, constrainLocalEditRect, loadImageFromUrl, makeId, padImageFile, processImageFile, ratioParts, resolveCropSourceRect } from "./outfit-panels.jsx";
import { OUTFIT_DRAFT_DB_KEY, cropReturnRectSnapshot, hydrateTasksWithUploadReferences, imageSource, localEditRectSnapshot, normalizeCropReturnMeta, normalizeQualityCheck, normalizeQualityCheckResult, normalizeRandomBackgroundFocus, outfitLocalGet, outfitLocalSet, readTaskHistory, recoverPersistedTasks, sanitizeTaskHistoryItem } from "./outfit-task.js";
import { readJsonStorage } from "../../lib/storage/json-storage.js";
import { canvasToBlob } from "../../shared/canvas-blob.js";
import { fileBaseName } from "../../shared/file-name.js";
import { CHANNEL_UPLOAD_LIMIT_BYTES, CHANNEL_UPLOAD_MAX_SIDE, CHANNEL_UPLOAD_TARGET_BYTES, imageBitmapFromBlob, imageBitmapFromFile, imageExtension } from "../../shared/image-input.js";
import { composeLocalPasteBlob, fitRectToRatioLocked } from "../../shared/local-edit-geometry.js";
import { LOCAL_EDIT_BRUSH_DEFAULT, LOCAL_EDIT_MASK_MODE, LOCAL_EDIT_MASK_OPACITY_DEFAULT, LOCAL_EDIT_RECT_MODE, createLocalEditAlphaMask, imageBitmapFromDataUrl } from "../../shared/local-edit-mask.js";
import { defaultOutfitIntent, normalizeOutfitIntent } from "../../shared/outfit-intent.js";
import { normalizePromptCategories, normalizePromptPreset } from "../../shared/prompt-library.js";
import { WHITE_REFINE_BATCH_LEGACY_DEFAULT_PROMPT, WHITE_REFINE_COLOR_LOCK_LEGACY_DEFAULT_PROMPT, WHITE_REFINE_DEFAULT_PROMPT, defaultRetouchIntent, normalizeRetouchIntent } from "../../shared/retouch-intent.js";
import { canonicalModel } from "../../shared/routing.js";
export const STORAGE_KEY = "jingyin-outfit-workflow-settings-v1";
export const BATCH_CONCURRENCY_DEFAULT_MIGRATION_KEY = "batchConcurrencyDefaultV5Applied";
export const GENERATION_COUNT_AUTOLINK_MIGRATION_KEY = "generationCountAutoLinkV11Applied";
export const OUTFIT_PAGES_KEY = "jingyin-outfit-workflow-pages-v1";
export const PROMPT_LIBRARY_VERSION = "v2-20260802";
export const PROMPT_PRESETS_KEY = `jingyin-outfit-workflow-prompt-library-${PROMPT_LIBRARY_VERSION}`;
export const PROMPT_CATEGORIES_KEY = `jingyin-outfit-workflow-prompt-categories-${PROMPT_LIBRARY_VERSION}`;
export const DEFAULT_OUTFIT_PAGE_NAME = "换装";
export const DEFAULT_POSE_REMIX_PAGE_NAME = "批量姿态";
export const DEFAULT_LOCAL_DETAIL_PAGE_NAME = "局部回贴";
export const DEFAULT_BACKGROUND_CHANGE_PAGE_NAME = "固定背景";
export const DEFAULT_RANDOM_BACKGROUND_PAGE_NAME = "随机背景";
export const DEFAULT_OUTPAINT_PAGE_NAME = "批量扩图";
export const DEFAULT_RECOLOR_PAGE_NAME = "批量改色";
export const DEFAULT_WHITE_REFINE_PAGE_NAME = "精修";
export const DEFAULT_FACE_SWAP_PAGE_NAME = "批量换脸";
export const DEFAULT_DESIGN_DRAFT_PAGE_NAME = "设计稿";
export const SINGLETON_WORKFLOW_MODES = new Set(["pose-remix", "local-detail", "background-change", "random-background", "recolor", "white-refine", "face-swap", "design-draft"]);
export const POSE_REMIX_DEFAULT_PROMPT = [
  "批量姿态任务：图1上传区是批量姿态参考图，每张图1只提取脸部朝向、头颈方向、肩膀角度、手臂手腕手掌、下半身、重心、站坐走关系和构图动势；不要复制图1人物身份、脸、发型、服装、穿法、背景、镜头风格或颜色。",
  "图2上传区是固定母版成片，人物身份、脸、发型、服装、穿法、场景、光影、镜头和画面风格都作为锁定标准。图2最多上传2张，默认用固定母版。",
  "生成时保持图2同一个模特、同一套衣服、同一穿法、同一场景和同一商业摄影质感，只把图2人物自然调整为当前图1姿态。",
  "姿态相似度要高：结果必须一眼看出是在模仿当前图1动作，抬手高度、手肘弯曲、手腕手掌方向、肩膀高低、身体重心、胯部转向、膝盖弯曲、脚尖方向和半身/全身裁切尽量贴近图1，不要只做轻微动作变化。",
  "服装版型和穿法必须跟图2母版一致：袖子放下/卷起、袖口落点、袖克夫长度、扣子开合、拉链高度、衣摆扎法、裙长/裤长、腰身松量、下摆轮廓、面料纹理和可见细节不要随机漂移。",
  "如果图1姿态与图2服装穿法冲突，先尽量保持图1动作相似度，再让图2服装做真实穿着褶皱和遮挡适配；只有物理上无法同时满足时才轻微折中。不要让图1衣服、裙裤类型或背景影响结果，不要输出对比图、拼贴图、文字、水印或标注。"
].join("\n");
export const POSE_MOTHER_FACE_SWAP_DEFAULT_PROMPT = [
  "批量换脸任务：图1上传区是批量姿态参考图，只提取姿势、身体动作、镜头距离、半身/全身裁切和构图动势；图2上传区是固定母图/母版成片，人物身份、脸、发型、服装、场景、光影和商业摄影质感都以图2为准；图3上传区是可选补充信息。",
  "生成时必须把图2母图里的同一个人物自然调整成图1姿态。图1半身就输出半身，图1全身就输出全身；图1侧身、抬手、坐姿、肩膀角度、手臂手腕手掌、腿脚和重心都要跟随，但不能复制图1的人脸身份、服装、发型、背景、颜色或拍摄风格。",
  "人物脸部身份只能来自图2母图：五官结构、脸型、年龄感、妆容、皮肤质感、发型外轮廓和发色趋势都要像图2，不允许把图1参考图的人脸特征混入结果，不要生成图1和图2混合脸。",
  "场景背景、光影方向、色温、镜头质感和服装事实保留图2母图；如果图1姿态和图2母图场景有冲突，只按图1姿态调整人物动作，不重建新场景、不换背景、不复制图1环境。",
  "最终结果必须像图2母图同一人物在图2场景里按图1姿态重新拍摄出来的真实电商成片，不要输出对比图、拼贴图、文字、水印或标注。"
].join("\n");
export const FACE_SWAP_SHORT_DEFAULT_PROMPT = [
  "批量换脸任务：图1上传区是需要保留身体、服装、姿势、背景和构图的目标人物图，图2上传区是要迁移的人脸身份参考，图3上传区是可选补充信息。",
  "图1是唯一底图和画面来源：人物身体、服装、衣领、肩膀、姿势、场景、背景、构图、镜头距离、光影、画面裁切、头身比、头部外接框、下巴位置和脖子肩线全部保持图1，不换衣、不换场景、不重拍。",
  "图2只读取脸部身份、五官、脸型、肤色妆容、发色、刘海方向和发缝趋势。图2不提供头部姿态、头部大小、头发整体外轮廓、脖子长度、肩颈关系或头身比例；图2脖子以下全部无效。",
  "只在图1原脸部角度和原头颈连接里融合图2身份，头部位置、脸部朝向、头部大小、头颈关系、下巴到锁骨/衣领的距离不变；如果发型迁移会影响图1服装、肩颈或背景，优先保留图1，只迁移脸部身份。",
  "结果出现图2服装、图2衣领肩膀、图2背景或图2拍摄场景就是失败；不要输出对比图、拼贴图、文字、水印或标注。"
].join("\n");
export const FACE_SWAP_BATCH_TONE_LEGACY_DEFAULT_PROMPT = [
  "批量换脸任务：图1上传区是需要保留身体、服装、姿势、背景和构图的目标人物图，图2上传区是要迁移的人脸身份参考，图3上传区是可选补充信息。",
  "图1是唯一底图和画面来源：人物身体、服装、衣领、肩膀、姿势、场景、背景、构图、镜头距离、光影、画面裁切、头身比、头部外接框、下巴位置、脖子长度和肩颈连接全部保持图1，不换衣、不换场景、不重拍。",
  "图2只读取脸部身份、脸部肤色妆容色调和小范围发型特征：五官、脸型、肤色明暗、妆容质感、发色、刘海方向、发缝趋势和贴脸发丝方向。脸部色调以图2脸母图为主，但只作用在脸部身份融合上。",
  "图2不提供头部姿态、低头/歪头/仰头角度、头部大小、头发整体外轮廓、脖子长度、肩颈关系、头身比例、衣领肩膀、身体、背景、场景、镜头和整体穿搭；图2脖子以下全部无效。",
  "只在图1原脸部角度和原头颈连接里融合图2身份；发顶、脸中心、双眼连线倾斜、下巴、下颌角、脖子上缘、锁骨/衣领交界、双肩基线和人物头身比必须跟图1一致。结果出现图2服装、图2衣领肩膀、图2背景、图2拍摄场景或图2头部姿态就是失败。"
].join("\n");
export const FACE_SWAP_HEAD_LOCK_LEGACY_DEFAULT_PROMPT = [
  "批量换脸任务：图1上传区是需要保留身体、服装、姿势、背景和构图的目标人物图，图2上传区是要迁移的人脸身份参考，图3上传区是可选补充信息。",
  "图1是唯一底图和画面来源：人物身体、服装、衣领、肩膀、姿势、场景、背景、构图、镜头距离、光影、画面裁切、头身比、头部外接框、下巴位置、脖子长度和肩颈连接全部保持图1，不换衣、不换场景、不重拍。",
  "图2只读取脸部身份、脸部肤色妆容色调和小范围发型特征：五官、脸型、肤色明暗、妆容质感、发色、刘海方向、发缝趋势和贴脸发丝方向。脸部色调以图2脸母图为主，但只作用在脸部身份融合上。",
  "同批统一脸部色彩标准：所有结果都以同一张图2脸母图的肤色明暗、妆容浓淡、口红色相和饱和度、面部对比度、磨皮程度、清晰度作为统一标准；不同图1只允许在脸部边缘做轻微现场光过渡，不能一张口红更鲜艳、一张低饱和、一张更白皙或像不同光源下拍摄。",
  "图2不提供头部姿态、低头/歪头/仰头角度、头部大小、头发整体外轮廓、脖子长度、肩颈关系、头身比例、衣领肩膀、身体、背景、场景、镜头和整体穿搭；图2脖子以下全部无效。",
  "只在图1原脸部角度和原头颈连接里融合图2身份；发顶、脸中心、双眼连线倾斜、下巴、下颌角、脖子上缘、锁骨/衣领交界、双肩基线和人物头身比必须跟图1一致。结果出现图2服装、图2衣领肩膀、图2背景、图2拍摄场景或图2头部姿态就是失败。"
].join("\n");
export const FACE_SWAP_DEFAULT_PROMPT = [
  "批量换脸任务：图1上传区是需要保留身体、服装、姿势、背景和构图的目标人物图；图2上传区是脸部身份、脸型、发型和头饰母图；图3上传区是可选补充信息。",
  "图1只作为底图和坐标来源：人物身体、服装、衣领、肩膀、姿势、场景、背景、构图、镜头距离、光影、画面裁切、头身比、头部位置、头部大小、脸部朝向、下巴位置、脖子长度和肩颈连接保持图1，不换衣、不换场景、不重拍。",
  "图2作为头脸妆造标准：五官结构、脸型轮廓、年龄感、肤色明暗、妆容质感、口红色相、发型整体轮廓、发量体积、发顶高度、发色、刘海、发缝、卷直程度、贴脸发丝、头饰、发饰、耳饰都以图2母图为准；图1原脸型、原发型、原发饰和头饰不作为结果参考。",
  "同批统一头脸色彩标准：所有结果都以同一张图2母图的肤色明暗、妆容浓淡、口红色相和饱和度、面部对比度、磨皮程度、清晰度作为统一标准；不同图1只允许在脸颈边缘做轻微现场光过渡，不能一张口红更鲜艳、一张低饱和、一张更白皙或像不同光源下拍摄。",
  "迁移图2发型和头饰时，只适配图1原头部坐标、脸部朝向、头颈连接和画面裁切；允许用图2发型轮廓覆盖图1原发型/头饰干扰，但不能移动头部、放大头身比例、改变肩颈、重绘衣领、换身体、换背景或复制图2衣服。",
  "图2脖子以下全部无效：不能复制图2服装、衣领、肩膀、身体、姿势、背景、拍摄角度、场景和整体穿搭；图2头部姿态也不能覆盖图1脸部朝向。结果保留图1原脸型、原发型或原头饰导致不像图2母图，或出现图2衣服/背景/场景，都是失败。"
].join("\n");
export const FACE_SWAP_PRE_HEAD_LOCK_SHORT_DEFAULT_PROMPT = [
  "批量换脸任务：图1上传区是需要保留身体、服装、姿势、背景和构图的目标人物图，图2上传区是要迁移的人脸身份参考，图3上传区是可选补充信息。",
  "图1是唯一底图和画面来源：人物身体、服装、衣领、肩膀、姿势、场景、背景、构图、镜头距离、光影和画面裁切全部保持图1，不换衣、不换场景、不重拍。",
  "图2只读取脸部身份和可融合发型：五官、脸型、肤色妆容、刘海、发缝、发色和头发轮廓。图2脖子以下全部无效，不能读取图2衣服、衣领、肩膀、身体、姿势、背景、场景、镜头和整体穿搭。",
  "只在图1原头脸位置融合图2身份和发型，头部位置、脸部朝向、头部大小、头颈关系不变；如果发型迁移会影响图1服装、肩颈或背景，优先保留图1，只迁移脸部身份。",
  "结果出现图2服装、图2衣领肩膀、图2背景或图2拍摄场景就是失败；不要输出对比图、拼贴图、文字、水印或标注。"
].join("\n");
export const FACE_SWAP_PRE_HEAD_LOCK_DEFAULT_PROMPT = [
  "批量换脸任务：图1上传区是需要保留身体、服装、姿势、背景和构图的目标人物图，图2上传区是要迁移的人脸身份参考，图3上传区是可选补充信息。",
  "图1是唯一底图和画面来源：人物身体、服装、衣领、肩膀、姿势、场景、背景、构图、镜头距离、光影和画面裁切全部保持图1，不换衣、不换场景、不重拍。",
  "图2只读取脸部身份、脸部肤色妆容色调和可融合发型：五官、脸型、肤色明暗、妆容质感、刘海、发缝、发色和头发轮廓。脸部色调以图2脸母图为主，但只作用在脸部身份融合上。",
  "图2脖子以下全部无效，不能读取图2衣服、衣领、肩膀、身体、姿势、背景、场景、镜头和整体穿搭；只在图1原头脸位置融合图2身份和发型，头部位置、脸部朝向、头部大小、头颈关系不变。",
  "如果发型或肤色融合会影响图1服装、肩颈或背景，优先保留图1边界，只让脸部自然过渡；结果出现图2服装、图2衣领肩膀、图2背景或图2拍摄场景就是失败。"
].join("\n");
export const LEGACY_FACE_SWAP_DEFAULT_PROMPT = [
  "批量换脸任务：图1上传区是需要保留身体、服装、姿势、背景和构图的目标人物图，图2上传区是要迁移的人脸身份参考，图3上传区是可选补充信息。",
  "替换图1人物的脸部身份特征，并参考图2的人脸、发型气质、刘海方向、发缝、卷直程度和发色趋势；图1的人物身体、服装、衣领、肩膀、姿势、场景、背景、光影和画面裁切必须保持。图2不是服装参考、不是身体参考、不是场景参考，不能把图2衣服、衣领、肩膀、背景或拍摄风格带到结果里。",
  "必须保留图1的头部位置、头部大小、脸部朝向、头颈关系、身体比例、衣服、手脚、背景、光影和画面裁切。发型只能在图1原有头部轮廓和发量范围内自然融合，不能导致头部偏移、头变大、脸中心改变或背景被大片重绘。",
  "如果图1已设置局部编辑区域，本次只生成这个局部区域，输出必须和局部区域同构图、同角度、同光影，不要输出整张图、不要扩展画布、不要添加边框。",
  "图2可以是一张或多张脸部/发型参考图，用于身份、五官、妆容气质和发型方向参考；不要复制图2的衣服、背景、拍摄角度、饰品或画面风格。图3不是必填，只在上传时补充妆容、表情、发型细节、年龄感、皮肤质感、客户要求或禁忌。",
  "最终结果必须像原图里真实拍出来的人物，只换脸，不换衣、不换身体、不换背景、不移动人物，不要输出对比图、拼贴图、文字、水印或标注。"
].join("\n");
export const FACE_SWAP_LOOSE_DEFAULT_PROMPT = [
  "批量换脸任务：图1上传区是需要保留身体、服装、姿势、背景和构图的目标人物图，图2上传区是要迁移的人脸身份参考，图3上传区是可选补充信息。",
  "替换图1人物的脸部身份特征，并在用户需要时参考图2的发型气质、刘海方向、发缝、卷直程度和发色趋势；必须保留图1的头部位置、头部大小、脸部朝向、头颈关系、身体比例、衣服、手脚、背景、光影和画面裁切。发型只能在图1原有头部轮廓和发量范围内自然融合，不能导致头部偏移、头变大、脸中心改变或背景被大片重绘。",
  "如果图1已设置局部编辑区域，本次只生成这个局部区域，输出必须和局部区域同构图、同角度、同光影，不要输出整张图、不要扩展画布、不要添加边框。",
  "图2可以是一张或多张脸部/发型参考图，用于身份、五官、妆容气质和发型方向参考；不要复制图2的衣服、背景、拍摄角度、饰品或画面风格。图3不是必填，只在上传时补充妆容、表情、发型细节、年龄感、皮肤质感、客户要求或禁忌。",
  "最终结果必须像原图里真实拍出来的人物，只换脸，不换衣、不换身体、不换背景、不移动人物，不要输出对比图、拼贴图、文字、水印或标注。"
].join("\n");
export const BACKGROUND_CHANGE_LEGACY_DEFAULT_PROMPT = [
  "批量换背景任务：图1上传区是要保留的人物图，图2上传区是统一场景图，图3上传区是可选补充信息。",
  "必须完全保持图1人物的位置、姿势、身体比例、头部大小、脸部朝向、发型、服装款式、服装颜色、服装细节、手脚姿态和人物在画面中的占比不变。",
  "只把图1人物自然放入图2场景中，让每一张结果都像同一场景里的统一摆拍，光影方向、色温、对比度、地面接触阴影、透视和整体色调必须一致。",
  "如果图1原本有背景或是透明/白底图，只提取人物主体和原服装事实，不保留图1原背景；不能改变人物衣服、姿态或重新摆拍。",
  "图3不是必填，只在上传时用于补充场景氛围、光线、色调、道具边界或客户额外要求；没有图3时不要凭空添加复杂道具、文字、水印或品牌元素。"
].join("\n");
export const BACKGROUND_CHANGE_PERSON_LIGHT_LEGACY_DEFAULT_PROMPT = [
  "批量换背景任务：图1上传区是要保留的人物图，图2上传区是统一场景图，图3上传区是可选补充信息。",
  "图1人物必须原样保留：位置、姿势、身体比例、头部大小、脸部朝向、发型、服装款式、服装颜色、服装细节、手脚姿态、人物占比和当前裁切都不变。",
  "图1是半身就保持半身，图1是全身就保持全身；禁止补全半身下半身、扩出腿脚、拉长身体、重排站位、扩展画布或为了适配背景重新构图。",
  "只替换人物后方场景：背景结构、地面、空间透视和商业氛围来自图2，但人物身上的光源方向、曝光、肤色、服装色和明暗关系以图1为主，背景去适配人物。",
  "只允许做人物边缘融合、脚底接触阴影和背景局部光影衔接，不能把图2色调强行套到人物身上；图3只在上传时补充场景要求，没有图3时不要添加文字、水印、品牌或复杂道具。"
].join("\n");
export const BACKGROUND_CHANGE_DEFAULT_PROMPT = [
  "批量固定背景任务：图1上传区是要保留的人物图，图2上传区是固定目标背景/场景图，图3上传区是可选补充信息。",
  "图1人物结构必须原样保留：位置、姿势、身体比例、头部大小、脸部朝向、发型、服装款式、服装细节、手脚姿态、人物占比和当前裁切都不变。",
  "图1是半身就保持半身，图1是全身就保持全身；禁止补全半身下半身、扩出腿脚、拉长身体、重排站位、扩展画布或为了适配背景重新构图。",
  "固定背景是最终光影标准：背景结构、地面、空间透视、主光方向、色温、对比度、阴影强度和商业氛围来自图2；允许对图1人物做自然的整体重光照、色温统一和边缘环境光融合，让人物像真实站在图2场景里。",
  "重光照只服务融合，不改变人物身份、脸、发型、服装颜色款式、服装细节、身体轮廓和手脚位置；必须补足脚底/身体接触阴影、边缘反光、远近虚实和白平衡一致性，避免贴图感、断层、假边和明显 P 图感。图3只在上传时补充场景要求，没有图3时不要添加文字、水印、品牌或复杂道具。"
].join("\n");
export const RANDOM_BACKGROUND_LIGHT_LEGACY_DEFAULT_PROMPT = [
  "批量随机背景任务：图1上传区是要保留的人物原图；想要的大概场景直接写在场景补充里。",
  "人物锁定：严格保留图1模特五官妆容、脸部清晰度、发型、全部身体姿态、人物构图、画面占比和整套服装版型配饰；人物面部拒绝重绘。",
  "服装锁定：完整保留图1服装款式、颜色、亮度、面料纹理、质感、褶皱、配饰和细节，不换衣、不改色、不提亮、不重绘服装结构。",
  "背景按场景补充生成真实电商实拍环境，可以是同一场景体系里的不同机位、不同角度和轻微景深变化；不要像固定相机重复拍同一张背景，也不要生成虚假 AI 场景。",
  "光影以真实融合为目标：柔和自然光，背景光影匹配图1人物明暗和服装展示需求，不要强行打亮人物，不要让脸、肤色、服装色发生明显漂移；无文字、无水印、无多余人物。"
].join("\n");
export const RANDOM_BACKGROUND_NEUTRAL_DAYLIGHT_LEGACY_DEFAULT_PROMPT = [
  "批量随机背景任务：图1上传区是要保留的人物原图；想要的大概场景直接写在场景补充里。",
  "人物锁定：严格保留图1模特五官妆容、脸部清晰度、发型、全部身体姿态、人物构图、画面占比和整套服装版型配饰；人物面部拒绝重绘。",
  "服装锁定：完整保留图1服装款式、颜色、亮度、面料纹理、质感、褶皱、配饰和细节，不换衣、不改色、不重绘服装结构。",
  "背景按场景补充生成真实电商实拍环境，可以是同一场景体系里的不同机位、不同角度和轻微景深变化；不要像固定相机重复拍同一张背景，也不要生成虚假 AI 场景。",
  "光照标准由目标场景先决定，不由图1原片背光、阴天、暗沉或室内黄光决定；整批要像同一时间段、同一场景体系拍摄的柔和明亮白天自然光。场景主动带动人物做自然补光、白平衡统一、边缘环境光和脚底接触阴影，不要让人物原本背光把新背景压暗。",
  "白平衡必须中性干净、清爽日光感：禁止暖黄、偏橙、咖啡暖滤镜、复古黄调、室内暗沉、假白提亮、强直射阳光、硬阴影、背光剪影、地面大面积太阳光斑或高反差午后强光。同批肤色、脸部明暗、口红、发色、服装白位/黑位保持同一亮度层级，不能一张明亮一张像背光阴天；无文字、无水印、无多余人物。"
].join("\n");
export const RANDOM_BACKGROUND_RELIGHT_LEGACY_DEFAULT_PROMPT = [
  "批量随机背景任务：图1上传区是要保留的人物原图；想要的大概场景直接写在场景补充里。",
  "人物锁定：严格保留图1模特五官妆容、脸部清晰度、发型轮廓、全部身体姿态、人物构图、画面占比和整套服装版型配饰；人物面部拒绝重绘，不做生硬抠图贴背景。",
  "服装锁定：完整保留图1服装款式、版型、面料纹理、质感、褶皱、配饰和细节，不换衣、不重绘服装结构；但允许在不改色相和材质事实的前提下，把图1室内暖光造成的偏黄、偏橙、暗沉人物色温校正到目标场景的统一日光白平衡。",
  "背景按场景补充生成真实电商实拍环境，可以是同一场景体系里的不同机位、不同角度和轻微景深变化；不要像固定相机重复拍同一张背景，也不要生成虚假 AI 场景。",
  "光照标准由目标场景先决定，不由图1原片背光、阴天、暗沉或室内黄光决定；先固定整批统一的柔和明亮白天自然光，再让人物、皮肤、头发和服装做自然重光照与色温统一。",
  "融合方式必须像真实换到同一场景重新拍摄：人物边缘有自然环境光、半透明发丝过渡和脚底接触阴影，不能出现硬抠边、白边、黑边、锯齿边、发丝断裂、人物像贴纸或背景被人物原暖光反向染黄。",
  "白平衡必须中性干净、清爽日光感：禁止暖黄、偏橙、咖啡暖滤镜、复古黄调、室内暗沉、假白提亮、强直射阳光、硬阴影、背光剪影、地面大面积太阳光斑或高反差午后强光。同批肤色、脸部明暗、口红、发色、服装白位/黑位保持同一亮度层级，不能一张明亮一张像背光阴天。"
].join("\n");
export const RANDOM_BACKGROUND_DEFAULT_PROMPT = [
  "批量随机背景任务：图1上传区是要保留的人物原图；想要的大概场景直接写在场景补充里。",
  "人物锁定：严格保留图1模特五官妆容、脸部清晰度、发型轮廓、全部身体姿态、人物构图、画面占比和整套服装版型配饰；人物面部拒绝重绘，不能像把人物抠出来贴到背景上。",
  "服装锁定：完整保留图1服装款式、版型、面料纹理、质感、褶皱、配饰和细节，不换衣、不重绘服装结构；允许在不改色相和材质事实的前提下，把图1室内暖光、偏黄、偏橙、暗沉校正到目标场景白平衡。",
  "背景按场景补充生成真实电商实拍环境，可以是同一场景体系里的不同机位、不同角度和轻微景深变化；不要像固定相机重复拍同一张背景，也不要生成虚假 AI 场景。",
  "目标场景先决定整张图的亮度、色温、曝光、主光方向和环境反光；再让人物、皮肤、头发和服装做自然重光照、补光和白平衡统一，人物不能明显比背景暗、黄、灰或像旧图贴上去。",
  "融合方式必须像真实换到同一场景重新拍摄：人物边缘有自然环境光、半透明发丝过渡、服装边缘环境色和脚底接触阴影，不能出现硬抠边、白边、黑边、锯齿边、发丝断裂、人物漂浮或背景被人物原暖光反向染黄。",
  "白平衡必须中性干净、清爽日光感：禁止暖黄、偏橙、咖啡暖滤镜、复古黄调、室内暗沉、假白提亮、强直射阳光、硬阴影、背光剪影、地面大面积太阳光斑或高反差午后强光。同批肤色、脸部明暗、口红、发色、服装白位/黑位保持同一亮度层级。"
].join("\n");
export const RANDOM_BACKGROUND_LEGACY_DEFAULT_PROMPT = [
  "批量随机背景任务：图1上传区是要保留的人物原图；本页不需要图2和图3，想要的大概场景直接写在场景补充里。",
  "人物锁定：严格保留图1模特五官妆容、脸部清晰度、发型、全部身体姿态、人物构图、画面占比和整套服装版型配饰；人物面部拒绝重绘。",
  "服装锁定：完整保留图1服装款式、颜色、亮度、面料纹理、质感、褶皱、配饰和细节，不换衣、不改色、不提亮、不重绘服装结构。",
  "背景按场景补充生成真实电商实拍环境，可以是同一场景体系里的不同机位、不同角度和轻微景深变化；不要像固定相机重复拍同一张背景，也不要生成虚假 AI 场景。",
  "光影以真实融合为目标：柔和自然光，背景光影匹配图1人物明暗和服装展示需求，不要强行打亮人物，不要让脸、肤色、服装色发生明显漂移；无文字、无水印、无多余人物。"
].join("\n");
export const OUTPAINT_DEFAULT_PROMPT = [
  "批量扩图任务：只有图1上传区参与生成，图1是要向下扩图的唯一原图，优先把半身照扩成能看到鞋子的全身图；本页没有参考图、没有补充图。",
  "必须保持图1原有内容完全不变：人物身份、脸、发型、肤色、上半身、服装款式、服装颜色、姿势、重心、手臂、背景、光影、清晰度、构图中已有区域都不移动、不缩放、不重绘、不换脸、不换衣。",
  "只在图1画布下方新增内容：自然补全模特下半身、腿部、脚踝、鞋子和脚底接触阴影；鞋子必须可见，腿脚方向、重心、站姿和透视要延续图1已有身体动作。",
  "扩出来的下半身服装、腿部、鞋子、地面和背景必须像原图同一场景继续拍摄，不要像拼接，不要改变原图上半身，不要新增无关人物、道具、文字、水印或品牌标志。",
  "系统会在生成完成后把图1原有区域本地覆盖回结果图，模型只负责下方留白扩展；生成时也必须避免重绘原图上半部分。"
].join("\n");
export const RECOLOR_COLOR_LEGACY_DEFAULT_PROMPT = [
  "批量改色任务：图1上传区是要保留的人物原图，图2上传区是目标颜色/服装颜色参考图，图3上传区是可选补充信息。",
  "只改变图1中被图2选项指定的服装部位颜色；人物脸、发型、肤色、身体姿势、手脚、场景、背景、镜头、构图、服装款式、版型、衣长、袖长、扣子、拉链、腰带、图案、刺绣、口袋、面料纹理和褶皱结构都保持图1原样。",
  "图2只提供目标颜色、明暗关系、饱和度、材质色感和局部颜色参考；不能把图2人物、服装款式、穿法、版型、场景、背景、姿势或光影结构带入图1。",
  "同一批结果颜色要统一稳定，目标部位颜色要自然贴合图1原有光影、褶皱、材质纹理和边缘阴影；不要出现断层、涂抹感、边缘溢色、皮肤染色、场景变色或整张图偏色。",
  "如果图1开启局部回贴，只处理选区或蒙版范围内的目标服装颜色，输出必须和选区同构图、同角度、同光影，方便系统贴回原图。"
].join("\n");
export const RECOLOR_DEFAULT_PROMPT = [
  "批量改色任务：图1上传区是要保留的人物原图，图2上传区是目标颜色/服装颜色参考图，图3上传区是可选补充信息。",
  "只改变图1中被图2选项指定的服装部位颜色；人物脸、发型、肤色、身体姿势、手脚、场景、背景、镜头、构图、服装款式、版型、衣长、袖长、扣子、拉链、腰带、图案、刺绣、口袋、面料纹理和褶皱结构都保持图1原样。",
  "图2只提供目标颜色、明暗关系、饱和度、材质色感和局部颜色参考；不能把图2人物、服装款式、穿法、版型、场景、背景、姿势或光影结构带入图1。",
  "颜色校准以图2主颜色参考为准：不要增加饱和度、对比度、油润感、高光或商业滤镜；同批保持同一目标色阶，不变深、不变艳、不发油、不发灰。",
  "同一批结果颜色要统一稳定，目标部位颜色要自然贴合图1原有光影、褶皱、材质纹理和边缘阴影；不要出现断层、涂抹感、边缘溢色、皮肤染色、场景变色、整张图偏色或一批里明显色差。",
  "如果图1开启局部回贴，只处理选区或蒙版范围内的目标服装颜色，输出必须和选区同构图、同角度、同光影，方便系统贴回原图。"
].join("\n");
export const DESIGN_DRAFT_DEFAULT_PROMPT = [
  "参考图1上传区的实拍服装图或真人实拍服装图，将服装转换为图2上传区所参考的干净服装设计师手稿风格。图1上传区可能只有一张图，也可能有多张正面、背面、侧面或细节图；请把图1上传区的所有图片当作同一件服装的参考，综合识别服装颜色、版型、领口、袖型、袖口、下摆、长度比例、结构线、拼接方式和主要面料特点。图3上传区是可选的细节补充图，只有上传时才作为面料、袖口、裙摆、衣领、纹理或辅助线效果的补充参考；如果图3没有上传，不要强行假设图3内容。",
  "输出纯白背景的服装设计师手稿图，无人体、无模特、无场景、无衣架，画面只保留服装款式图。能从参考图中判断正反面时，优先输出服装正反面左右并排款式图；如果只有单面参考且背面信息不足，背面只能做保守、简洁、符合服装结构逻辑的合理补全，不要编造复杂设计。服装颜色以图1实拍服装为准，保留原服装的版型、廓形、领口、袖型、袖口、下摆、长度比例和主要结构。整体以黑色线稿为主，搭配极浅的米杏色淡填色，不要真实照片质感，不要复杂面料纹理，不要写实细节。",
  "线条使用手绘板绘制的服装款式图线条，外轮廓线清晰干净，起笔轻、收笔轻、中间压力重，线条两头尖、中间略粗，有自然的笔压变化和克制的手绘笔触；不要像儿童涂抹一样粗细一致、反复描边或杂乱涂抹。内部结构线、领口线、袖口线、下摆线、衣身分割线使用更细的线，线条稳定、准确、干净。",
  "服装所有轮廓转角、袖口四角、下摆边角、接缝拐点位置，点缀极短的浅灰色纤细定位短线。短线只停留在拐点外侧，短小零散，不要长贯穿线条；线条浅淡但要比普通起稿痕迹略明显，明度低于黑色衣身轮廓线，是设计师手稿里的拐点定位辅助短线，不杂乱、不延伸。",
  "面料质感只用非常少量的简化材质符号和浅淡铅笔排线暗示，抓住面料特点即可，不出现真实照片级织物细节，不出现复杂编织纹理，不出现杂乱涂抹线。整体像服装打版师、设计师用手绘板画出来的产品工艺手稿，结构清楚、比例准确、线条干净、有轻微手写压感但不凌乱。"
].join("\n");
export const LOCAL_EDIT_OUTPUT_TARGET_BYTES = 64 * 1024 * 1024;
export const LOCAL_EDIT_OUTPUT_JPEG_QUALITIES = [0.985, 0.975, 0.965, 0.95, 0.94];
export const DEFAULT_BATCH_CONCURRENCY = 5;
export const CROP_RETURN_OUTPUT_TARGET_BYTES = 64 * 1024 * 1024;
export const CROP_RETURN_OUTPUT_JPEG_QUALITIES = [0.985, 0.975, 0.965, 0.95, 0.94];
export const GARMENT_PART_OPTIONS = [
  { value: "upper", label: "上装" },
  { value: "lower", label: "下装" },
  { value: "shoes", label: "鞋子" }
];
export const GARMENT_COMPOSITION_OPTIONS = [
  { value: "single-upper", label: "单件上衣", parts: ["upper"] },
  { value: "upper-layer", label: "外套+内搭", parts: ["upper"] },
  { value: "outfit-set", label: "套装", parts: ["upper", "lower"] },
  { value: "custom", label: "自定义范围", parts: [] }
];
export const DEFAULT_GARMENT_PARTS = ["upper"];
export const DEFAULT_GARMENT_COMPOSITION = "single-upper";
export const DEFAULT_UPLOAD_LABELS = {
  model: {
    title: "带场景模特图",
    hint: "上传完整模特和场景底图；批量时按左到右顺序逐张生成。"
  },
  clothing: {
    title: "服装/产品图",
    hint: "可上传模特穿着图或平铺产品图；后台只抽取服装款式和细节。"
  },
  reference: {
    title: "参考图/物品图",
    hint: "可选；默认不参与换装，只有在补充提示词里明确说明图3用途时才参考。"
  }
};
export const POSE_REMIX_UPLOAD_LABELS = {
  model: {
    title: "批量姿态图",
    hint: "批量上传姿态参考；每张只提取脸部朝向、肩膀、手臂、手腕手掌、下半身、重心和构图动势，不参考衣服和背景。"
  },
  clothing: {
    title: "固定母版成片",
    hint: "上传已满意的模特服装场景成片；固定人物身份、脸、发型、服装、穿法、场景和光影，默认最多2张。"
  },
  reference: {
    title: "补充约束图",
    hint: "可选；只有在提示词里明确说明图3用途时才参考，用于补充禁忌、细节边界或客户要求。"
  }
};
export const LEGACY_POSE_REMIX_UPLOAD_LABELS = {
  model: {
    title: "固定母版成片",
    hint: "上传 1 张已满意的模特服装场景成片；批量任务固定人物、服装、穿法、场景和光影。"
  },
  clothing: {
    title: "批量姿势参考图",
    hint: "批量上传姿势参考；每张只提取身体姿态、手脚动作、朝向和重心，不参考衣服和背景。"
  },
  reference: {
    title: "补充约束图",
    hint: "可选；只有在提示词里明确说明图3用途时才参考，用于补充禁忌、细节边界或客户要求。"
  }
};
export const LOCAL_DETAIL_UPLOAD_LABELS = {
  model: {
    title: "原图/待回贴图",
    hint: "上传需要局部修改的大图；在图1缩略图下方点局部回贴，框选或涂抹要修改的服装细节。"
  },
  clothing: {
    title: "细节结构参考图",
    hint: "上传要参考的局部结构、形状、五金、缝线或纹理走势；不参考图2颜色。"
  },
  reference: {
    title: "补充说明图",
    hint: "可选；补充局部结构或客户要求，颜色、材质、光影仍以图1原产品为准。"
  }
};
export const CUSTOM_UPLOAD_LABELS = {
  model: {
    title: "图1",
    hint: "上传本次临时需求的图1，可按需求使用裁剪或局部回贴。"
  },
  clothing: {
    title: "图2",
    hint: "上传本次临时需求的图2。"
  },
  reference: {
    title: "图3",
    hint: "可选；上传补充参考图或额外要求。"
  }
};
export const BACKGROUND_CHANGE_UPLOAD_LABELS = {
  model: {
    title: "人物图/模特图",
    hint: "批量上传要保留的人物；位置、姿势、比例、服装和主体占比都要锁定不变。"
  },
  clothing: {
    title: "固定背景图",
    hint: "上传固定目标背景；批量人物都放进同一场景，人物光影要自然贴合背景。"
  },
  reference: {
    title: "补充参考图",
    hint: "可选；补充场景氛围、光线、色调、道具边界或本次客户要求。"
  }
};
export const RANDOM_BACKGROUND_UPLOAD_LABELS = {
  model: {
    title: "批量人物图",
    hint: "批量上传要换随机背景的人物原图；脸、姿势、服装、构图和人物占比都要锁定不变。"
  },
  clothing: {
    title: "不参与",
    hint: "随机背景不使用图2，场景需求请写在场景补充。"
  },
  reference: {
    title: "不参与",
    hint: "随机背景不使用图3，避免参考图干扰人物和服装。"
  }
};
export const RECOLOR_UPLOAD_LABELS = {
  model: {
    title: "批量原图/模特图",
    hint: "批量上传要改色的原图；人物、姿势、场景、肤色、服装款式和细节都要锁定不变。"
  },
  clothing: {
    title: "改色服装参考图",
    hint: "上传目标颜色参考，可上传多张；只读取图2选中服装范围的颜色、明暗和材质色感。"
  },
  reference: {
    title: "补充参考图",
    hint: "可选；补充颜色禁忌、局部材质、客户要求或要避免的效果，不上传时不强行添加。"
  }
};
export const LEGACY_WHITE_REFINE_UPLOAD_LABELS_1 = {
  model: {
    title: "批量平铺图/挂拍图",
    hint: "批量上传要变白底并精修的服装图；图1款式、颜色、面料和全部细节是唯一主事实。"
  },
  clothing: {
    title: "可选参考/细节图",
    hint: "可选上传标准平铺、袖口腰带扣子等细节或衣架去除参考；只辅助精修，不覆盖图1款式颜色。"
  },
  reference: {
    title: "不参与",
    hint: "白底精修不使用图3，补充要求请写在文字里。"
  }
};
export const LEGACY_WHITE_REFINE_UPLOAD_LABELS_2 = {
  model: {
    title: "多图生图（图1~图N）",
    hint: "同一件服装可以一次上传多张（正面/背面/侧面/细节/挂拍）；点生成只输出一张白底精修成品图。"
  },
  clothing: {
    title: "补充素材（图N+1…）",
    hint: "继续补充同一件服装的其它角度或细节；和多图生图里的图一起合成同一张成品，不作为单独款式。"
  },
  reference: {
    title: "不参与",
    hint: "白底精修不使用图3，补充要求请写在文字里。"
  }
};
export const WHITE_REFINE_UPLOAD_LABELS = {
  model: {
    // 2026-09-26（按用户要求）：图1 就是多图上传区，标题直接叫「图片上传」。
    // 图2 已经不再渲染（图1 本身就是多图生图），这里保留一份标题只为兼容数据形状。
    title: "图片上传",
    hint: "同一件服装可以一次上传多张（正面/背面/侧面/细节/挂拍）；点生成只输出一张白底精修成品图。"
  },
  clothing: {
    title: "补充素材（已不用）",
    hint: "精修页只需要图1 的多图上传；这里仅为兼容旧数据保留。"
  },
  reference: {
    title: "不参与",
    hint: "白底精修不使用图3，补充要求请写在文字里。"
  }
};
export const OUTPAINT_UPLOAD_LABELS = {
  model: {
    title: "待扩图原图",
    hint: "批量上传要向下扩图的半身照或局部人物图；只用图1生成，原有画面会本地覆盖保护。"
  },
  clothing: {
    title: "不参与",
    hint: "批量扩图不使用图2。"
  },
  reference: {
    title: "不参与",
    hint: "批量扩图不使用图3。"
  }
};
export const POSE_MOTHER_FACE_SWAP_UPLOAD_LABELS = {
  model: {
    title: "批量姿态图",
    hint: "批量上传姿态参考图；只提取姿势、半身/全身裁切、镜头距离和构图动势，不提取人物身份、服装或背景。"
  },
  clothing: {
    title: "固定母图",
    hint: "上传要保留的人物母图；脸、发型、服装、场景、光影和商业摄影质感都以母图为准。"
  },
  reference: {
    title: "补充参考图",
    hint: "可选；补充本次姿态、表情、妆造、客户要求或禁忌，不上传时不强行添加。"
  }
};
export const FACE_SWAP_UPLOAD_LABELS = {
  model: {
    title: "目标人物图",
    hint: "批量上传要换脸的原图；身体、衣服、姿势、背景、构图和头部坐标要保留，原脸型发型头饰不作为结果参考。"
  },
  clothing: {
    title: "脸型发型母图",
    hint: "上传要替换进去的母图；脸型、五官、发型、头饰/发饰、妆容和脸部色调都以这里为准。"
  },
  reference: {
    title: "妆容/表情补充图",
    hint: "可选；补充妆容、表情、年龄感、皮肤质感、客户要求或禁忌，不上传时不强行添加。"
  }
};
export const LEGACY_FACE_SWAP_UPLOAD_LABELS = FACE_SWAP_UPLOAD_LABELS;
export const DESIGN_DRAFT_UPLOAD_LABELS = {
  model: {
    title: "实拍服装图/真人实拍图",
    hint: "上传单张或多张实拍参考；正反面、侧面会合并识别为同一件服装。"
  },
  clothing: {
    title: "手稿风格参考图",
    hint: "上传设计稿或手稿样式参考；用于笔触、线条、淡填色和拐点短线风格。"
  },
  reference: {
    title: "细节/手稿补充图",
    hint: "可选；补充面料、袖口、裙摆、衣领、纹理或辅助短线效果。"
  }
};
export const OUTFIT_DEFAULT_PROMPT = [
  "让图1当前人物穿着图2服装，生成自然干净的电商成片。",
  "以图1为人物姿势和构图基准，不改变图1模特的姿势、位置、身体比例、手部姿势和画面构图；保留身份、发型、原脸质感、镜头、背景和原图光影，不磨皮、不变脸。",
  "图1模特身上的原服装不作为图2服装的款式、版型、大小、松量或长度参考；图1的服装不做任何款式参考，尤其不能影响图2袖长、袖口落点、袖筒松量、衣长、领口、扣子、衣摆扎法、颜色和面料。",
  "图2是唯一服装标准：保留款式、版型、长度、松量、颜色、面料、领口、袖口、袖子穿法、扣合状态、衣摆扎法、下摆、扣子、拉链、拼接、里衬/网纱层次等关键细节。",
  "图2服装颜色校准必须保持：不要增加饱和度、对比度、油润感、高光或商业滤镜；同批保持同一服装色阶，不变浅、不变深、不变艳、不发油、不发灰，也不要因图1环境自动改色。",
  "用户补充文字里明确点名的删除、移除、去掉类要求必须完整执行，不能只处理一部分或留下残影。",
  "只做真实穿着适配，不按模型审美把图2改短、收腰、修身、瘦身、重设计或简化细节。",
  "袖子状态按图2实际穿法执行：放下就放下，卷起就卷起，挽起就挽起；袖口落点、袖克夫长度、卷袖高度和层数不要上提、缩短或随机变化。",
  "扣子、拉链、门襟开合和衣摆扎法按图2保持；如果涉及扎入下装，先识别图1真实下装类型，再把图2同样的扎入位置和露出边界适配过去。",
  "服装细节保持自然真实，面料垂坠、褶皱、光影和原图环境一致，保留清新干净的商业摄影质感。"
].join("\n");
export const LOCAL_DETAIL_DEFAULT_PROMPT = [
  "局部服装细节任务：在图1指定局部区域内，只修改用户点名的服装细节。",
  "图1是颜色、基础材质、明暗、光影、纹理尺度和周边衔接的标准；选区外和未点名区域保持图1原样。",
  "图2只参考被点名细节的结构、形状、五金、缝线、纹理走势或工艺位置；不参考图2颜色、色温、曝光、背景，也不要把图2当整件服装来源。",
  "局部结果必须像原本长在图1这件衣服上，边缘自然连续，不出现突兀色块、材质断层或人物位置变化。"
].join("\n");
export const PROMPT_BUILTIN_PRESETS = [
  {
    id: "outfit-keep",
    title: "换装保结构",
    category: "常用",
    content: OUTFIT_DEFAULT_PROMPT
  },
  {
    id: "local-outfit-material-fit",
    title: "局部换装锁版型面料",
    category: "常用",
    content: [
      "局部换装任务：图1是原图，已框选局部编辑区域；图2是本次要换上的服装唯一来源。",
      "请先在内部分析图2服装的面料类别和可见材质事实，例如棉麻、帆布、牛仔、雪纺、皮革、蕾丝、网纱、针织等，以及织纹方向、颗粒大小、厚薄、垂感、光泽、高光位置、透明度、褶皱逻辑、缝线方向和边缘结构；不要输出分析文字，只把分析结果用于生成。",
      "把图2服装真实穿到图1人物局部区域内，严格保持图2的服装类别、版型、廓形、宽松/修身程度、腰身松量、肩线、领口形状、袖型、袖长、袖口、袖子穿法、扣合状态、衣摆扎法、衣长、裙长、下摆宽度、开衩、扣子、拉链、口袋、拼接线、颜色、面料纹理、厚薄、垂感、反光和光泽。",
      "图1原服装只用于判断身体轮廓和遮挡，不参考它的袖长、袖口位置、松量、衣长、领口、门襟、扣子、颜色、面料或褶皱。",
      "图2颜色深浅、明度、饱和度和面料光泽必须保持，不要把服装变浅、泛白、发灰、降饱和、加柔光或提亮成浅一号。",
      "只允许做符合图1姿态和身体角度的真实穿着适配与自然褶皱，不能按模型审美自动美化版型；禁止把图2服装改成更收腰、更细腰、更短、更紧身、更修身、更顺滑、更亮、更薄、更厚或更完美状态。",
      "图1人物的脸、发型、头部位置、身体比例、姿势、手臂手腕手指、腿脚、背景光影和选区边缘必须保持稳定；不要输出整张重构图、对比图、文字、水印或边框。"
    ].join("\n")
  },
  {
    id: "detail-lock",
    title: "细节锁定",
    category: "常用",
    content: "重点锁定图2服装的面料纹理、领口、袖口、扣子、拼接线、褶皱、内衬、网纱/蕾丝外层和内里长度差，确保批量结果细节一致，避免衣长漂移、版型变修身、腰身松量变化、错位和材质漂移。"
  },
  {
    id: "soft-pad",
    title: "背景边缘扩充",
    category: "常用",
    content: "只扩充或裁剪画布边缘来匹配目标比例，人物/主体的站位、中心、大小和构图重心必须保持原图不偏移；扩展区域从原图背景边缘自然填充，不要移动、重绘或替换主体。"
  },
  {
    id: "batch-copy",
    title: "批量复刻",
    category: "批量复刻",
    content: "保持同一批结果在人物风格、镜头、布光、构图和商品表现上统一，只允许在目标内容上做必要替换，其他部分尽量一致。"
  },
  {
    id: "batch-sku",
    title: "批量SKU",
    category: "批量sku",
    content: "批量生成同一商品的不同SKU画面时，统一电商调性、背景洁净、主体清晰，颜色和款式切换准确，避免无关变化。"
  },
  {
    id: "partial-migrate",
    title: "局部迁移",
    category: "局部迁移",
    content: "仅迁移指定局部信息，其余区域保持原图结构和风格稳定，避免整体被重绘成新的风格。"
  }
];
export const THEME_OPTIONS = [
  { value: "dark", label: "暗夜", colors: ["#080910", "#151522", "#10cfc4"] },
  { value: "jade", label: "柔粉", colors: ["#fff2f7", "#fffafd", "#ec6f9e"] },
  { value: "graphite", label: "米杏", colors: ["#f3e6d4", "#fff8ec", "#c98652"] },
  { value: "mist", label: "浅雾", colors: ["#f5f7fa", "#ffffff", "#0d7a76"] }
];
export const PROMPT_PRESET_GROUPS = [
  {
    category: "常用",
    presets: [
      {
        title: "标准换装",
        content: "让图1人物穿着图2服装，保留人物脸部、身材比例和自然姿态，服装版型、颜色、材质、领口、袖口、纽扣、腰线和长度准确自然。"
      },
      {
        title: "电商主图",
        content: "生成一张干净高级的电商主图，人物和服装占画面主体，背景简洁，光线柔和，服装边缘贴合自然，避免拼接感、过曝和廉价滤镜。"
      },
      {
        title: "白底展示",
        content: "输出白底或浅灰干净背景，模特自然站姿，完整展示服装正面穿着效果，保持衣服真实版型、颜色和细节，不改变人物五官和身材比例。"
      }
    ]
  },
  {
    category: "细节锁定",
    presets: [
      {
        title: "面料纹理",
        content: "重点锁定图2服装的面料纹理、厚薄、垂感、光泽和褶皱逻辑，穿到图1人物身上后保持真实服装质感，不能变成塑料感或糊成一片。"
      },
      {
        title: "版型结构",
        content: "严格保留图2服装的版型结构，包括领型、肩线、袖长、腰线、下摆长度、扣子位置和拼接结构，避免错领、错袖、错扣和比例变形。"
      },
      {
        title: "蕾丝双层",
        content: "如果图2是蕾丝、网纱、假两件或内外双层结构，必须保留外层纹理和内层布面/内衬的层次关系，不能合并成单层布料。"
      },
      {
        title: "鞋包配饰",
        content: "保留图1人物原有姿态和适合画面的鞋包配饰，只让服装替换为图2款式；无关品牌标识、水印和文字不要进入最终画面。"
      }
    ]
  },
  {
    category: "构图光线",
    presets: [
      {
        title: "全身海报",
        content: "全身构图，人物从头到脚完整入画，鞋子和下摆不能被裁掉，四周留出自然呼吸空间，适合女装海报和电商详情首屏。"
      },
      {
        title: "柔光质感",
        content: "使用柔和四面补光，低反差，无生硬黑影，突出衣服轮廓、面料纹理和高级质感，背景干净真实，不要过曝。"
      },
      {
        title: "轻场景",
        content: "场景为简约室内、白墙建筑、浅色咖啡馆或干净街拍氛围，场景只服务服装展示，避免繁杂道具和网红打卡感。"
      }
    ]
  }
];
export const PROMPT_CATEGORIES = ["全部", ...new Set([
  ...PROMPT_PRESET_GROUPS.map((group) => group.category),
  ...PROMPT_BUILTIN_PRESETS.map((preset) => preset.category)
])];
export const BUILTIN_PROMPT_LIBRARY = [
  ...PROMPT_BUILTIN_PRESETS,
  ...PROMPT_PRESET_GROUPS.flatMap((group, groupIndex) => group.presets.map((preset, presetIndex) => ({
    id: `legacy_${groupIndex}_${presetIndex}`,
    title: preset.title,
    category: group.category,
    content: preset.content
  })))
];
export function shouldRepairOutfitPrompt(prompt) {
  const text = String(prompt || "").trim();
  if (!text) return true;
  if (/(唯一人物底图和几何基准|图1人物几何锁定|肩胯角度|姿势幅度|鞋脚接地点)/.test(text)
    && /(让图1当前人物穿着图2服装|图2服装|唯一服装标准)/.test(text)) return true;
  if (/补齐画布|背景从原图氛围自然延展|不要引入新的主体元素/.test(text)) return true;
  if (/让图1模特穿着图2服装，图1模特的样貌[\s\S]*不优化图2服装款式/.test(text)) return true;
  if (/必须让图1人物穿着图2服装。保持图1模特[\s\S]*手脚位置[\s\S]*不优化、重设计/.test(text)) return true;
  if (/批量换装任务：图1是当前模特图[\s\S]*图2服装是唯一换装标准[\s\S]*不优化、重设计或简化图2服装款式/.test(text)) return true;
  if (/图3只做可选补充，不替代图2/.test(text)) return true;
  if (/让图1当前人物穿着图2服装，生成自然干净的电商成片。[\s\S]*图1模特身上的原服装不作为图2服装/.test(text)
    && !/以图1为人物姿势和构图基准/.test(text)) return true;
  return false;
}
export function normalizeSmartIntervention(value) {
  if (value === true) return true;
  if (value === false) return false;
  const text = String(value ?? "false").trim().toLowerCase();
  return ["1", "true", "on", "smart", "智能", "开启"].includes(text);
}
export function normalizeGarmentParts(value) {
  const raw = Array.isArray(value) ? value : String(value || "").split(/[,\s|，、]+/);
  const next = GARMENT_PART_OPTIONS
    .map((option) => option.value)
    .filter((part) => raw.includes(part));
  return next.length > 0 ? next : DEFAULT_GARMENT_PARTS;
}
export function sameGarmentParts(left, right) {
  const leftParts = normalizeGarmentParts(left).slice().sort();
  const rightParts = normalizeGarmentParts(right).slice().sort();
  return leftParts.length === rightParts.length && leftParts.every((part, index) => part === rightParts[index]);
}
export function normalizeGarmentComposition(value, garmentParts = DEFAULT_GARMENT_PARTS) {
  const allowed = new Set(GARMENT_COMPOSITION_OPTIONS.map((option) => option.value));
  const parts = normalizeGarmentParts(garmentParts);
  const next = allowed.has(String(value || "")) ? String(value) : DEFAULT_GARMENT_COMPOSITION;
  const upperOnly = parts.length === 1 && parts.includes("upper");
  const upperLowerOnly = parts.length === 2 && parts.includes("upper") && parts.includes("lower");
  if (["single-upper", "upper-layer"].includes(next)) return upperOnly ? next : "custom";
  if (next === "outfit-set") return upperLowerOnly ? next : "custom";
  return "custom";
}
export function garmentCompositionLabel(value) {
  return GARMENT_COMPOSITION_OPTIONS.find((option) => option.value === value)?.label || "自定义范围";
}
export const defaultSettings = {
  apiKey: "",
  // canonical ID：旧存档里的 gpt-image / nano-banana2 会由 canonicalModel 在读取时映射。
  model: "tt-image-2",
  channelId: "",
  dispatchMode: "manual",
  aspectRatio: "3:4",
  imageSize: "2K",
  concurrency: DEFAULT_BATCH_CONCURRENCY,
  generationCount: "auto",
  smartIntervention: false,
  qualityCheck: false,
  // 批量改色的改色范围（旧机制，只有 recolor 还在用）。
  garmentParts: DEFAULT_GARMENT_PARTS,
  garmentComposition: DEFAULT_GARMENT_COMPOSITION,
  // 批量换装的结构化意图（唯一来源）：更换部位 / 上装层级 / 穿法 / 图2服装事实。
  outfitIntent: defaultOutfitIntent(),
  // 服装精修的结构化意图（唯一来源）：对称 / 衣摆或裙摆 / 版型 / 用户补充。
  retouchIntent: defaultRetouchIntent(),
  pairingMode: "fixed",
  preprocessMode: DEFAULT_PREPROCESS_MODE,
  randomBackgroundFocus: "default",
  theme: "dark",
  prompt: OUTFIT_DEFAULT_PROMPT,
  productNote: ""
};
export function readSettings() {
  try {
    const stored = readJsonStorage(STORAGE_KEY, {});
    const settings = { ...defaultSettings, ...stored };
    if (shouldUpgradeLegacyBatchConcurrency(settings)) {
      settings.concurrency = DEFAULT_BATCH_CONCURRENCY;
      settings[BATCH_CONCURRENCY_DEFAULT_MIGRATION_KEY] = true;
    }
    if (settings.generationCount === 10 && settings[GENERATION_COUNT_AUTOLINK_MIGRATION_KEY] !== true) {
      settings.generationCount = "auto";
      settings[GENERATION_COUNT_AUTOLINK_MIGRATION_KEY] = true;
    }
    if (shouldRepairOutfitPrompt(settings.prompt)) settings.prompt = OUTFIT_DEFAULT_PROMPT;
    settings.generationCount = normalizeGenerationCount(settings.generationCount);
    settings.smartIntervention = normalizeSmartIntervention(settings.smartIntervention);
    settings.qualityCheck = normalizeQualityCheck(settings.qualityCheck);
    settings.garmentParts = normalizeGarmentParts(settings.garmentParts);
    settings.garmentComposition = normalizeGarmentComposition(settings.garmentComposition, settings.garmentParts);
    settings.outfitIntent = normalizeOutfitIntent(settings.outfitIntent);
    settings.retouchIntent = normalizeRetouchIntent(settings.retouchIntent);
    settings.randomBackgroundFocus = normalizeRandomBackgroundFocus(settings.randomBackgroundFocus);
    settings.concurrency = normalizeBatchConcurrency(settings.concurrency);
    settings.preprocessMode = DEFAULT_PREPROCESS_MODE;
    // 旧存档模型 ID 归一化到 3.0 canonical ID；目录加载完成后还会再收敛一次能力参数。
    settings.model = canonicalModel(settings.model);
    settings.dispatchMode = "manual";
    settings.channelId = String(settings.channelId || "");
    return settings;
  } catch {
    return defaultSettings;
  }
}
export function normalizeOutfitPageName(value, fallback = DEFAULT_OUTFIT_PAGE_NAME) {
  const name = String(value || "").replace(/\s+/g, " ").trim();
  // 旧名字（批量换装 / 批量AI换装 / 批量生成）统一迁移到新的短名字「换装」。
  if (name === "批量AI换装" || name === "批量生成" || name === "批量换装") return DEFAULT_OUTFIT_PAGE_NAME;
  if (/批量姿态|批量姿态图|姿态参考图|固定模特换姿势|固定模特|固定人物|批量姿势|换姿势|姿势生成|姿势参考|pose/i.test(name)) return DEFAULT_POSE_REMIX_PAGE_NAME;
  if (/局部细节|局部精修|局部贴回|local\s*detail/i.test(name)) return DEFAULT_LOCAL_DETAIL_PAGE_NAME;
  if (/随机背景|随机场景|随机实景|random\s*background/i.test(name)) return DEFAULT_RANDOM_BACKGROUND_PAGE_NAME;
  if (/换固定背景|固定背景|换背景|換背景|背景更换|背景替换|换场景|換場景/i.test(name)) return DEFAULT_BACKGROUND_CHANGE_PAGE_NAME;
  if (/批量扩图|扩图|扩画布|向下扩|下半身扩图|补全下半身|outpaint|expand/i.test(name)) return DEFAULT_OUTPAINT_PAGE_NAME;
  if (/批量改色|改色|换色|服装改色|颜色替换|颜色参考|recolor/i.test(name)) return DEFAULT_RECOLOR_PAGE_NAME;
  // 「精修」是新的短名字；旧的「批量白底（图）精修」仍然识别，老存档读取时自动迁移。
  if (/精修|白底精修|白底图精修|服装精修|平铺精修|挂拍精修|去衣架|去掉衣架|white\s*refine/i.test(name)) return DEFAULT_WHITE_REFINE_PAGE_NAME;
  return (name || fallback).slice(0, 18);
}
export function isPoseRemixPageName(value) {
  return /批量姿态|批量姿态图|姿态参考图|固定模特换姿势|固定模特|固定人物|固定成片|批量姿势|换姿势|姿势生成|姿势参考|pose/i.test(String(value || ""));
}
export function isLocalDetailPageName(value) {
  return /局部回贴|局部贴回|局部细节|局部精修|local\s*detail/i.test(String(value || ""));
}
export function isBackgroundChangePageName(value) {
  return /换固定背景|固定背景|换背景|換背景|背景更换|背景替换|换场景|換場景|场景图|统一场景/i.test(String(value || ""));
}
export function isRandomBackgroundPageName(value) {
  return /随机背景|随机场景|随机实景|random\s*background/i.test(String(value || ""));
}
export function isOutpaintPageName(value) {
  return /批量扩图|扩图|扩画布|向下扩|下半身扩图|补全下半身|outpaint|expand/i.test(String(value || ""));
}
export function isRecolorPageName(value) {
  return /批量改色|改色|换色|服装改色|颜色替换|颜色参考|recolor/i.test(String(value || ""));
}
export function isWhiteRefinePageName(value) {
  return /精修|白底精修|白底图精修|服装精修|平铺精修|挂拍精修|去衣架|去掉衣架|white\s*refine/i.test(String(value || ""));
}
export function isDesignDraftPageName(value) {
  return /设计稿|設計稿|design/i.test(String(value || ""));
}
export function isFaceSwapPageName(value) {
  return /批量换脸|换脸|人脸|脸部|face\s*swap/i.test(String(value || ""));
}
export function isCustomWorkflowPageName(value) {
  return /临时需求|自定义需求|批量需求|custom/i.test(String(value || ""));
}
export function mentionsOptionalReferenceImage(prompt, productNote) {
  const text = [prompt, productNote].join("\n");
  return /图\s*3|图三|第三张|第三个|补充图|补充参考|参考图\s*3|reference\s*3/i.test(String(text || ""));
}
export function defaultUploadLabelsForPage(name) {
  if (isPoseRemixPageName(name)) return POSE_REMIX_UPLOAD_LABELS;
  if (isLocalDetailPageName(name)) return LOCAL_DETAIL_UPLOAD_LABELS;
  if (isDesignDraftPageName(name)) return DESIGN_DRAFT_UPLOAD_LABELS;
  if (isFaceSwapPageName(name)) return FACE_SWAP_UPLOAD_LABELS;
  if (isRandomBackgroundPageName(name)) return RANDOM_BACKGROUND_UPLOAD_LABELS;
  if (isBackgroundChangePageName(name)) return BACKGROUND_CHANGE_UPLOAD_LABELS;
  if (isOutpaintPageName(name)) return OUTPAINT_UPLOAD_LABELS;
  if (isRecolorPageName(name)) return RECOLOR_UPLOAD_LABELS;
  if (isWhiteRefinePageName(name)) return WHITE_REFINE_UPLOAD_LABELS;
  if (isCustomWorkflowPageName(name)) return CUSTOM_UPLOAD_LABELS;
  return DEFAULT_UPLOAD_LABELS;
}
export function defaultPromptForWorkflowMode(mode) {
  if (mode === "pose-remix") return POSE_REMIX_DEFAULT_PROMPT;
  if (mode === "design-draft") return DESIGN_DRAFT_DEFAULT_PROMPT;
  if (mode === "face-swap") return FACE_SWAP_DEFAULT_PROMPT;
  if (mode === "random-background") return RANDOM_BACKGROUND_DEFAULT_PROMPT;
  if (mode === "background-change") return BACKGROUND_CHANGE_DEFAULT_PROMPT;
  if (mode === "outpaint") return OUTPAINT_DEFAULT_PROMPT;
  if (mode === "recolor") return RECOLOR_DEFAULT_PROMPT;
  if (mode === "white-refine") return WHITE_REFINE_DEFAULT_PROMPT;
  if (mode === "local-detail") return LOCAL_DETAIL_DEFAULT_PROMPT;
  if (mode === "custom") return "";
  return OUTFIT_DEFAULT_PROMPT;
}
export function workflowModeFromPage(pageName, uploadLabels) {
  const modelTitle = String(uploadLabels?.model?.title || "");
  const clothingTitle = String(uploadLabels?.clothing?.title || "");
  const referenceTitle = String(uploadLabels?.reference?.title || "");
  const text = [pageName, modelTitle, clothingTitle, referenceTitle].join(" ");
  if (isCustomWorkflowPageName(pageName)) {
    return "custom";
  }
  if (isLocalDetailPageName(pageName)) {
    return "local-detail";
  }
  if (isFaceSwapPageName(pageName)) {
    return "face-swap";
  }
  if (isRandomBackgroundPageName(pageName) || isRandomBackgroundPageName(text)) {
    return "random-background";
  }
  if (isOutpaintPageName(pageName) || isOutpaintPageName(text) || /待扩图原图|扩图参考图|向下扩图|补全下半身/.test(text)) {
    return "outpaint";
  }
  if (isWhiteRefinePageName(pageName) || isWhiteRefinePageName(text) || /平铺图|挂拍图|衣架去除|可选参考\/细节图|白底商品图/.test(text)) {
    return "white-refine";
  }
  if (isRecolorPageName(pageName) || isRecolorPageName(text) || /改色服装参考图|目标颜色|颜色替换/.test(text)) {
    return "recolor";
  }
  if (isPoseRemixPageName(text) || /固定母版成片|批量姿势参考图|批量姿态图|姿态参考图|只提取姿势|固定成片/i.test(text)) {
    return "pose-remix";
  }
  if (isFaceSwapPageName(text) || /目标人物图|人脸参考图|妆容|表情|脸部身份/.test(text)) {
    return "face-swap";
  }
  if (isDesignDraftPageName(text) || /设计稿|設計稿|design|实拍服装|真人实拍|细节补充/.test(text)) {
    return "design-draft";
  }
  const explicitBackgroundPage = isBackgroundChangePageName(pageName) || isBackgroundChangePageName(clothingTitle);
  const backgroundLabelPair = /人物图|人物照|人物|模特图|模特/i.test(modelTitle)
    && /固定背景|统一场景|场景图|目标场景|背景图|换背景|背景/i.test(clothingTitle);
  if (explicitBackgroundPage || backgroundLabelPair || /PS贴回/i.test(text)) {
    return "background-change";
  }
  return "outfit";
}
export function normalizeUploadLabelText(value, fallback, limit = 80) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return (text || fallback).slice(0, limit);
}
export function normalizeUploadLabels(value = {}, pageName = DEFAULT_OUTFIT_PAGE_NAME) {
  const defaults = defaultUploadLabelsForPage(pageName);
  return Object.fromEntries(["model", "clothing", "reference"].map((key) => {
    const current = value?.[key] || {};
    return [key, {
      title: normalizeUploadLabelText(current.title, defaults[key].title, 36),
      hint: normalizeUploadLabelText(current.hint, defaults[key].hint, 140)
    }];
  }));
}
export function sameUploadLabels(left, right) {
  const normalizedLeft = normalizeUploadLabels(left);
  const normalizedRight = normalizeUploadLabels(right);
  return ["model", "clothing", "reference"].every((key) => (
    normalizedLeft[key].title === normalizedRight[key].title
    && normalizedLeft[key].hint === normalizedRight[key].hint
  ));
}
export function uploadLabelsMatchPreset(value, preset) {
  return ["model", "clothing", "reference"].every((key) => (
    String(value?.[key]?.title || "") === String(preset?.[key]?.title || "")
    && String(value?.[key]?.hint || "") === String(preset?.[key]?.hint || "")
  ));
}
export function isLegacyPoseRemixUploadLabels(value = {}) {
  const modelTitle = String(value?.model?.title || "");
  const clothingTitle = String(value?.clothing?.title || "");
  return /固定母版|固定成片|固定模特/i.test(modelTitle)
    && /姿势|姿态|pose/i.test(clothingTitle);
}
export function inferOutfitWorkflowMode(pageName, uploadLabels) {
  return workflowModeFromPage(pageName, uploadLabels);
}
export function isSingletonWorkflowMode(mode) {
  return SINGLETON_WORKFLOW_MODES.has(String(mode || ""));
}
export function outfitPageContentScore(page = {}) {
  const imageCount = (Array.isArray(page.modelImages) ? page.modelImages.length : 0)
    + (Array.isArray(page.clothingImages) ? page.clothingImages.length : 0)
    + (Array.isArray(page.referenceImages) ? page.referenceImages.length : 0);
  const taskCount = Array.isArray(page.tasks) ? page.tasks.length : 0;
  const libraryCount = Array.isArray(page.originalLibrary) ? page.originalLibrary.length : 0;
  return imageCount * 10
    + taskCount * 4
    + libraryCount * 2
    + (page.fixedClothingId ? 3 : 0)
    + (String(page.settings?.productNote || "").trim() ? 1 : 0);
}
export function dedupeSingletonWorkflowPages(pages = []) {
  const output = [];
  const singletonIndexByMode = new Map();
  for (const page of Array.isArray(pages) ? pages : []) {
    if (!page) continue;
    const mode = inferOutfitWorkflowMode(page.name, page.uploadLabels);
    if (!isSingletonWorkflowMode(mode)) {
      output.push(page);
      continue;
    }
    const existingIndex = singletonIndexByMode.get(mode);
    if (existingIndex === undefined) {
      singletonIndexByMode.set(mode, output.length);
      output.push(page);
      continue;
    }
    if (outfitPageContentScore(page) > outfitPageContentScore(output[existingIndex])) {
      output[existingIndex] = page;
    }
  }
  return output;
}
export function normalizeOutfitPageSettings(value = {}, options = {}) {
  const settings = { ...defaultSettings, ...(value || {}) };
  if (shouldUpgradeLegacyBatchConcurrency(settings)) {
    settings.concurrency = DEFAULT_BATCH_CONCURRENCY;
    settings[BATCH_CONCURRENCY_DEFAULT_MIGRATION_KEY] = true;
  }
  if (settings.generationCount === 10 && settings[GENERATION_COUNT_AUTOLINK_MIGRATION_KEY] !== true) {
    settings.generationCount = "auto";
    settings[GENERATION_COUNT_AUTOLINK_MIGRATION_KEY] = true;
  }
  if (!(options.allowEmptyPrompt && !String(settings.prompt || "").trim()) && shouldRepairOutfitPrompt(settings.prompt)) {
    settings.prompt = OUTFIT_DEFAULT_PROMPT;
  }
  settings.generationCount = normalizeGenerationCount(settings.generationCount);
  settings.smartIntervention = normalizeSmartIntervention(settings.smartIntervention);
  settings.qualityCheck = normalizeQualityCheck(settings.qualityCheck);
  settings.garmentParts = normalizeGarmentParts(settings.garmentParts);
  settings.garmentComposition = normalizeGarmentComposition(settings.garmentComposition, settings.garmentParts);
  // 旧存档里的 garmentParts / garmentComposition / garmentLengths / masterFit* 只做安全读取：
  // 它们留在对象里不报错，但不再影响批量换装的任何行为，也不会覆盖新的 outfitIntent。
  settings.outfitIntent = normalizeOutfitIntent(settings.outfitIntent);
  settings.retouchIntent = normalizeRetouchIntent(settings.retouchIntent);
  settings.randomBackgroundFocus = normalizeRandomBackgroundFocus(settings.randomBackgroundFocus);
  settings.concurrency = normalizeBatchConcurrency(settings.concurrency);
  settings.theme = normalizeTheme(settings.theme);
  settings.apiKey = normalizeApiKeyInput(settings.apiKey);
  settings.preprocessMode = DEFAULT_PREPROCESS_MODE;
  return settings;
}
export function stripOutfitPageGlobalSettings(value = {}, options = {}) {
  const next = normalizeOutfitPageSettings(value, options);
  const { apiKey, theme, preprocessMode, ...pageSettings } = next;
  return pageSettings;
}
export function mergeOutfitPageSettings(pageSettings = {}, currentSettings = readSettings(), options = {}) {
  const next = normalizeOutfitPageSettings({ ...currentSettings, ...(pageSettings || {}) }, options);
  return {
    ...next,
    apiKey: currentSettings.apiKey || "",
    theme: normalizeTheme(currentSettings.theme)
  };
}
export function makeOutfitPage(name = DEFAULT_OUTFIT_PAGE_NAME, patch = {}) {
  const pageName = normalizeOutfitPageName(name || patch.name, DEFAULT_OUTFIT_PAGE_NAME);
  const pageMode = inferOutfitWorkflowMode(pageName, patch.uploadLabels || {});
  const allowEmptyPrompt = patch.allowEmptyPrompt || pageMode === "custom" || pageMode === "local-detail";
  const sourceSettings = patch.settings || readSettings();
  const sourcePrompt = String(sourceSettings.prompt || "");
  const migratedSettings = pageMode === "face-swap" && (
    !sourcePrompt.trim()
    || sourcePrompt === FACE_SWAP_SHORT_DEFAULT_PROMPT
    || sourcePrompt === FACE_SWAP_BATCH_TONE_LEGACY_DEFAULT_PROMPT
    || sourcePrompt === FACE_SWAP_HEAD_LOCK_LEGACY_DEFAULT_PROMPT
    || sourcePrompt === LEGACY_FACE_SWAP_DEFAULT_PROMPT
    || sourcePrompt === FACE_SWAP_LOOSE_DEFAULT_PROMPT
    || sourcePrompt === POSE_MOTHER_FACE_SWAP_DEFAULT_PROMPT
    || sourcePrompt === FACE_SWAP_PRE_HEAD_LOCK_SHORT_DEFAULT_PROMPT
    || sourcePrompt === FACE_SWAP_PRE_HEAD_LOCK_DEFAULT_PROMPT
  )
    ? { ...sourceSettings, prompt: FACE_SWAP_DEFAULT_PROMPT, productNote: "", pairingMode: "fixed" }
    : pageMode === "random-background" && (
      !sourcePrompt.trim()
      || sourcePrompt === OUTFIT_DEFAULT_PROMPT
      || sourcePrompt === BACKGROUND_CHANGE_DEFAULT_PROMPT
      || sourcePrompt === BACKGROUND_CHANGE_LEGACY_DEFAULT_PROMPT
      || sourcePrompt === BACKGROUND_CHANGE_PERSON_LIGHT_LEGACY_DEFAULT_PROMPT
      || sourcePrompt === RANDOM_BACKGROUND_LIGHT_LEGACY_DEFAULT_PROMPT
      || sourcePrompt === RANDOM_BACKGROUND_NEUTRAL_DAYLIGHT_LEGACY_DEFAULT_PROMPT
      || sourcePrompt === RANDOM_BACKGROUND_RELIGHT_LEGACY_DEFAULT_PROMPT
      || sourcePrompt === RANDOM_BACKGROUND_LEGACY_DEFAULT_PROMPT
    )
      ? { ...sourceSettings, prompt: RANDOM_BACKGROUND_DEFAULT_PROMPT, productNote: "", smartIntervention: false, pairingMode: "fixed", randomBackgroundFocus: "default" }
    : pageMode === "background-change" && (
      !sourcePrompt.trim()
      || sourcePrompt === BACKGROUND_CHANGE_LEGACY_DEFAULT_PROMPT
      || sourcePrompt === BACKGROUND_CHANGE_PERSON_LIGHT_LEGACY_DEFAULT_PROMPT
    )
      ? { ...sourceSettings, prompt: BACKGROUND_CHANGE_DEFAULT_PROMPT, productNote: "" }
    : pageMode === "outpaint" && (
      !sourcePrompt.trim()
      || sourcePrompt === OUTFIT_DEFAULT_PROMPT
      || sourcePrompt === BACKGROUND_CHANGE_DEFAULT_PROMPT
    )
      ? { ...sourceSettings, prompt: OUTPAINT_DEFAULT_PROMPT, productNote: "", smartIntervention: false, pairingMode: "fixed", aspectRatio: "9:16" }
    : pageMode === "recolor" && (
      !sourcePrompt.trim()
      || sourcePrompt === OUTFIT_DEFAULT_PROMPT
      || sourcePrompt === BACKGROUND_CHANGE_DEFAULT_PROMPT
      || sourcePrompt === RECOLOR_COLOR_LEGACY_DEFAULT_PROMPT
    )
      ? { ...sourceSettings, prompt: RECOLOR_DEFAULT_PROMPT, productNote: "", smartIntervention: false, pairingMode: "fixed" }
    : pageMode === "white-refine" && (
      !sourcePrompt.trim()
      || sourcePrompt === OUTFIT_DEFAULT_PROMPT
      || sourcePrompt === RECOLOR_DEFAULT_PROMPT
      || sourcePrompt === BACKGROUND_CHANGE_DEFAULT_PROMPT
      || sourcePrompt === WHITE_REFINE_COLOR_LOCK_LEGACY_DEFAULT_PROMPT
      || sourcePrompt === WHITE_REFINE_BATCH_LEGACY_DEFAULT_PROMPT
    )
      ? { ...sourceSettings, prompt: WHITE_REFINE_DEFAULT_PROMPT, productNote: "", smartIntervention: false, pairingMode: "fixed" }
    : pageMode === "pose-remix"
      ? { ...sourceSettings, pairingMode: "fixed" }
      : pageMode === "local-detail" && !String(sourceSettings.prompt || "").trim()
        ? { ...sourceSettings, prompt: LOCAL_DETAIL_DEFAULT_PROMPT, productNote: "" }
        : sourceSettings;
  const sourceUploadLabels = patch.uploadLabels || {};
  const migratedUploadLabels = pageMode === "face-swap" && (
    !patch.uploadLabels
    || uploadLabelsMatchPreset(sourceUploadLabels, LEGACY_FACE_SWAP_UPLOAD_LABELS)
    || uploadLabelsMatchPreset(sourceUploadLabels, POSE_MOTHER_FACE_SWAP_UPLOAD_LABELS)
  )
    ? FACE_SWAP_UPLOAD_LABELS
    : pageMode === "pose-remix" && (
      !patch.uploadLabels
      || uploadLabelsMatchPreset(sourceUploadLabels, LEGACY_POSE_REMIX_UPLOAD_LABELS)
      || isLegacyPoseRemixUploadLabels(sourceUploadLabels)
    )
      ? POSE_REMIX_UPLOAD_LABELS
      : pageMode === "random-background" && (
        !patch.uploadLabels
        || uploadLabelsMatchPreset(sourceUploadLabels, DEFAULT_UPLOAD_LABELS)
        || uploadLabelsMatchPreset(sourceUploadLabels, BACKGROUND_CHANGE_UPLOAD_LABELS)
      )
        ? RANDOM_BACKGROUND_UPLOAD_LABELS
      : pageMode === "background-change" && (
        !patch.uploadLabels
        || String(sourceUploadLabels?.clothing?.title || "").trim() === "统一场景图"
      )
        ? BACKGROUND_CHANGE_UPLOAD_LABELS
      : pageMode === "outpaint" && (
        !patch.uploadLabels
        || uploadLabelsMatchPreset(sourceUploadLabels, DEFAULT_UPLOAD_LABELS)
        || uploadLabelsMatchPreset(sourceUploadLabels, BACKGROUND_CHANGE_UPLOAD_LABELS)
      )
        ? OUTPAINT_UPLOAD_LABELS
      : pageMode === "recolor" && (
        !patch.uploadLabels
        || uploadLabelsMatchPreset(sourceUploadLabels, DEFAULT_UPLOAD_LABELS)
        || uploadLabelsMatchPreset(sourceUploadLabels, BACKGROUND_CHANGE_UPLOAD_LABELS)
      )
        ? RECOLOR_UPLOAD_LABELS
      : pageMode === "white-refine" && (
        // 2026-09-26：精修只留一个「图片上传」多图区，图1/图2 的旧标题都要迁移过来。
        // 只在标题还是历史默认值时迁移；用户自己改过的标题不动。
        !patch.uploadLabels
        || uploadLabelsMatchPreset(sourceUploadLabels, LEGACY_WHITE_REFINE_UPLOAD_LABELS_1)
        || uploadLabelsMatchPreset(sourceUploadLabels, LEGACY_WHITE_REFINE_UPLOAD_LABELS_2)
        || uploadLabelsMatchPreset(sourceUploadLabels, DEFAULT_UPLOAD_LABELS)
      )
        ? WHITE_REFINE_UPLOAD_LABELS
      : pageMode === "local-detail" && (
        !patch.uploadLabels
        || uploadLabelsMatchPreset(sourceUploadLabels, CUSTOM_UPLOAD_LABELS)
      )
        ? LOCAL_DETAIL_UPLOAD_LABELS
        : sourceUploadLabels;
  return {
    id: String(patch.id || makeId("outfit_page")),
    name: pageName,
    deleteLocked: Boolean(patch.deleteLocked),
    settings: stripOutfitPageGlobalSettings(migratedSettings, { allowEmptyPrompt }),
    modelImages: Array.isArray(patch.modelImages) ? patch.modelImages : [],
    clothingImages: Array.isArray(patch.clothingImages) ? patch.clothingImages : [],
    referenceImages: Array.isArray(patch.referenceImages) ? patch.referenceImages : [],
    fixedClothingId: String(patch.fixedClothingId || ""),
    tasks: Array.isArray(patch.tasks) ? patch.tasks : [],
    originalLibrary: Array.isArray(patch.originalLibrary) ? patch.originalLibrary : [],
    activeUploadGroup: patch.activeUploadGroup || "model",
    uploadLabels: normalizeUploadLabels(migratedUploadLabels, pageName)
  };
}
export function makeDesignDraftPage(baseSettings = readSettings(), patch = {}) {
  return makeOutfitPage(DEFAULT_DESIGN_DRAFT_PAGE_NAME, {
    deleteLocked: true,
    ...patch,
    settings: {
      ...baseSettings,
      prompt: DESIGN_DRAFT_DEFAULT_PROMPT,
      productNote: "",
      smartIntervention: false,
      ...(patch.settings || {})
    },
    uploadLabels: patch.uploadLabels || DESIGN_DRAFT_UPLOAD_LABELS
  });
}
export function makePoseRemixPage(baseSettings = readSettings(), patch = {}) {
  return makeOutfitPage(DEFAULT_POSE_REMIX_PAGE_NAME, {
    deleteLocked: true,
    ...patch,
    settings: {
      ...baseSettings,
      prompt: POSE_REMIX_DEFAULT_PROMPT,
      productNote: "",
      smartIntervention: false,
      pairingMode: "fixed",
      ...(patch.settings || {})
    },
    uploadLabels: patch.uploadLabels || POSE_REMIX_UPLOAD_LABELS
  });
}
export function makeBackgroundChangePage(baseSettings = readSettings(), patch = {}) {
  return makeOutfitPage(DEFAULT_BACKGROUND_CHANGE_PAGE_NAME, {
    deleteLocked: true,
    ...patch,
    settings: {
      ...baseSettings,
      prompt: BACKGROUND_CHANGE_DEFAULT_PROMPT,
      productNote: "",
      smartIntervention: false,
      ...(patch.settings || {})
    },
    uploadLabels: patch.uploadLabels || BACKGROUND_CHANGE_UPLOAD_LABELS
  });
}
export function makeRandomBackgroundPage(baseSettings = readSettings(), patch = {}) {
  return makeOutfitPage(DEFAULT_RANDOM_BACKGROUND_PAGE_NAME, {
    deleteLocked: true,
    ...patch,
    settings: {
      ...baseSettings,
      prompt: RANDOM_BACKGROUND_DEFAULT_PROMPT,
      productNote: "",
      smartIntervention: false,
      pairingMode: "fixed",
      randomBackgroundFocus: "default",
      ...(patch.settings || {})
    },
    uploadLabels: patch.uploadLabels || RANDOM_BACKGROUND_UPLOAD_LABELS
  });
}
export function makeRecolorPage(baseSettings = readSettings(), patch = {}) {
  return makeOutfitPage(DEFAULT_RECOLOR_PAGE_NAME, {
    deleteLocked: true,
    ...patch,
    settings: {
      ...baseSettings,
      prompt: RECOLOR_DEFAULT_PROMPT,
      productNote: "",
      smartIntervention: false,
      pairingMode: "fixed",
      garmentParts: DEFAULT_GARMENT_PARTS,
      garmentComposition: DEFAULT_GARMENT_COMPOSITION,
      ...(patch.settings || {})
    },
    uploadLabels: patch.uploadLabels || RECOLOR_UPLOAD_LABELS
  });
}
export function makeWhiteRefinePage(baseSettings = readSettings(), patch = {}) {
  return makeOutfitPage(DEFAULT_WHITE_REFINE_PAGE_NAME, {
    deleteLocked: true,
    ...patch,
    settings: {
      ...baseSettings,
      prompt: WHITE_REFINE_DEFAULT_PROMPT,
      productNote: "",
      smartIntervention: false,
      pairingMode: "fixed",
      ...(patch.settings || {})
    },
    uploadLabels: patch.uploadLabels || WHITE_REFINE_UPLOAD_LABELS
  });
}
export function makeFaceSwapPage(baseSettings = readSettings(), patch = {}) {
  return makeOutfitPage(DEFAULT_FACE_SWAP_PAGE_NAME, {
    deleteLocked: true,
    ...patch,
    settings: {
      ...baseSettings,
      prompt: FACE_SWAP_DEFAULT_PROMPT,
      productNote: "",
      smartIntervention: false,
      pairingMode: "fixed",
      ...(patch.settings || {})
    },
    uploadLabels: patch.uploadLabels || FACE_SWAP_UPLOAD_LABELS
  });
}
export function ensureWorkflowPages(pages = [], baseSettings = readSettings()) {
  let output = dedupeSingletonWorkflowPages(Array.isArray(pages) ? pages.filter(Boolean) : [])
    .filter((page) => {
      const mode = inferOutfitWorkflowMode(page.name, page.uploadLabels);
      return mode !== "local-detail" && mode !== "outpaint";
    });
  const hasPoseRemixPage = output.some((page) => inferOutfitWorkflowMode(page.name, page.uploadLabels) === "pose-remix");
  const hasBackgroundChangePage = output.some((page) => inferOutfitWorkflowMode(page.name, page.uploadLabels) === "background-change");
  const hasRandomBackgroundPage = output.some((page) => inferOutfitWorkflowMode(page.name, page.uploadLabels) === "random-background");
  const hasRecolorPage = output.some((page) => inferOutfitWorkflowMode(page.name, page.uploadLabels) === "recolor");
  const hasWhiteRefinePage = output.some((page) => inferOutfitWorkflowMode(page.name, page.uploadLabels) === "white-refine");
  const hasFaceSwapPage = output.some((page) => inferOutfitWorkflowMode(page.name, page.uploadLabels) === "face-swap");
  const hasDesignDraftPage = output.some((page) => inferOutfitWorkflowMode(page.name, page.uploadLabels) === "design-draft");

  if (!hasPoseRemixPage) {
    const outfitIndex = output.findIndex((page) => inferOutfitWorkflowMode(page.name, page.uploadLabels) === "outfit");
    const poseRemixPage = makePoseRemixPage(baseSettings);
    output = outfitIndex >= 0
      ? [...output.slice(0, outfitIndex + 1), poseRemixPage, ...output.slice(outfitIndex + 1)]
      : [poseRemixPage, ...output];
  }

  if (!hasBackgroundChangePage) {
    const designIndex = output.findIndex((page) => ["face-swap", "design-draft"].includes(inferOutfitWorkflowMode(page.name, page.uploadLabels)));
    const backgroundPage = makeBackgroundChangePage(baseSettings);
    output = designIndex >= 0
      ? [...output.slice(0, designIndex), backgroundPage, ...output.slice(designIndex)]
      : [...output, backgroundPage];
  }

  if (!hasRandomBackgroundPage) {
    const backgroundIndex = output.findIndex((page) => inferOutfitWorkflowMode(page.name, page.uploadLabels) === "background-change");
    const recolorIndex = output.findIndex((page) => inferOutfitWorkflowMode(page.name, page.uploadLabels) === "recolor");
    const designIndex = output.findIndex((page) => ["face-swap", "design-draft"].includes(inferOutfitWorkflowMode(page.name, page.uploadLabels)));
    const randomBackgroundPage = makeRandomBackgroundPage(baseSettings);
    output = backgroundIndex >= 0
      ? [...output.slice(0, backgroundIndex + 1), randomBackgroundPage, ...output.slice(backgroundIndex + 1)]
      : recolorIndex >= 0
        ? [...output.slice(0, recolorIndex), randomBackgroundPage, ...output.slice(recolorIndex)]
        : designIndex >= 0
          ? [...output.slice(0, designIndex), randomBackgroundPage, ...output.slice(designIndex)]
          : [...output, randomBackgroundPage];
  }

  if (!hasRecolorPage) {
    const randomBackgroundIndex = output.findIndex((page) => inferOutfitWorkflowMode(page.name, page.uploadLabels) === "random-background");
    const backgroundIndex = output.findIndex((page) => inferOutfitWorkflowMode(page.name, page.uploadLabels) === "background-change");
    const designIndex = output.findIndex((page) => ["face-swap", "design-draft"].includes(inferOutfitWorkflowMode(page.name, page.uploadLabels)));
    const recolorPage = makeRecolorPage(baseSettings);
    output = randomBackgroundIndex >= 0
      ? [...output.slice(0, randomBackgroundIndex + 1), recolorPage, ...output.slice(randomBackgroundIndex + 1)]
      : backgroundIndex >= 0
        ? [...output.slice(0, backgroundIndex + 1), recolorPage, ...output.slice(backgroundIndex + 1)]
      : designIndex >= 0
        ? [...output.slice(0, designIndex), recolorPage, ...output.slice(designIndex)]
        : [...output, recolorPage];
  }

  if (!hasWhiteRefinePage) {
    const recolorIndex = output.findIndex((page) => inferOutfitWorkflowMode(page.name, page.uploadLabels) === "recolor");
    const designIndex = output.findIndex((page) => ["face-swap", "design-draft"].includes(inferOutfitWorkflowMode(page.name, page.uploadLabels)));
    const whiteRefinePage = makeWhiteRefinePage(baseSettings);
    output = recolorIndex >= 0
      ? [...output.slice(0, recolorIndex + 1), whiteRefinePage, ...output.slice(recolorIndex + 1)]
      : designIndex >= 0
        ? [...output.slice(0, designIndex), whiteRefinePage, ...output.slice(designIndex)]
        : [...output, whiteRefinePage];
  }

  if (!hasFaceSwapPage) {
    const designIndex = output.findIndex((page) => inferOutfitWorkflowMode(page.name, page.uploadLabels) === "design-draft");
    const faceSwapPage = makeFaceSwapPage(baseSettings);
    output = designIndex >= 0
      ? [...output.slice(0, designIndex), faceSwapPage, ...output.slice(designIndex)]
      : [...output, faceSwapPage];
  }

  if (!hasDesignDraftPage) {
    output = [...output, makeDesignDraftPage(baseSettings)];
  }

  const faceSwapIndex = output.findIndex((page) => inferOutfitWorkflowMode(page.name, page.uploadLabels) === "face-swap");
  const poseRemixIndex = output.findIndex((page) => inferOutfitWorkflowMode(page.name, page.uploadLabels) === "pose-remix");
  if (faceSwapIndex >= 0 && poseRemixIndex >= 0 && faceSwapIndex !== poseRemixIndex + 1) {
    const faceSwapPage = output[faceSwapIndex];
    const withoutFaceSwap = output.filter((_, index) => index !== faceSwapIndex);
    const nextPoseRemixIndex = withoutFaceSwap.findIndex((page) => inferOutfitWorkflowMode(page.name, page.uploadLabels) === "pose-remix");
    output = [
      ...withoutFaceSwap.slice(0, nextPoseRemixIndex + 1),
      faceSwapPage,
      ...withoutFaceSwap.slice(nextPoseRemixIndex + 1)
    ];
  }

  return dedupeSingletonWorkflowPages(output);
}
export function serializeOutfitPage(page) {
  const pageName = normalizeOutfitPageName(page?.name, DEFAULT_OUTFIT_PAGE_NAME);
  const pageMode = inferOutfitWorkflowMode(pageName, page?.uploadLabels || {});
  const allowEmptyPrompt = pageMode === "custom" || pageMode === "local-detail";
  return {
    id: String(page?.id || makeId("outfit_page")),
    name: pageName,
    deleteLocked: Boolean(page?.deleteLocked),
    settings: stripOutfitPageGlobalSettings(page?.settings || {}, { allowEmptyPrompt }),
    uploadLabels: normalizeUploadLabels(page?.uploadLabels || {}, pageName)
  };
}
export function readOutfitPages() {
  const baseSettings = readSettings();
  const stored = readJsonStorage(OUTFIT_PAGES_KEY, null);
  if (Array.isArray(stored) && stored.length > 0) {
    const pages = stored.map((page, index) => makeOutfitPage(
      page?.name || (index === 0 ? DEFAULT_OUTFIT_PAGE_NAME : `批量需求 ${index + 1}`),
      {
        ...page,
        settings: { ...baseSettings, ...(page?.settings || {}) },
        tasks: index === 0 ? readTaskHistory() : []
      }
    ));
    if (pages.length > 0) return ensureWorkflowPages(pages, baseSettings);
  }
  return ensureWorkflowPages([
    makeOutfitPage(DEFAULT_OUTFIT_PAGE_NAME, { settings: baseSettings, tasks: readTaskHistory() })
  ], baseSettings);
}
export function pickInitialOutfitPage(pages = []) {
  const list = Array.isArray(pages) ? pages.filter(Boolean) : [];
  return list.find((page) => inferOutfitWorkflowMode(page.name, page.uploadLabels) === "outfit")
    || list.find((page) => inferOutfitWorkflowMode(page.name, page.uploadLabels) === "background-change")
    || list.find((page) => inferOutfitWorkflowMode(page.name, page.uploadLabels) === "design-draft")
    || list[0]
    || makeOutfitPage(DEFAULT_OUTFIT_PAGE_NAME);
}
export function normalizeTheme(value) {
  return THEME_OPTIONS.some((theme) => theme.value === value) ? value : defaultSettings.theme;
}
export function themeToVars(theme) {
  const palette = {
    dark: {
      appBg: "#07090d",
      shellBg: "#0b0d14",
      sidebarBg: "rgba(12, 13, 20, 0.92)",
      topbarBg: "rgba(7, 9, 13, 0.88)",
      panelBg: "rgba(255, 255, 255, 0.045)",
      panelStrongBg: "rgba(255, 255, 255, 0.055)",
      inputBg: "rgba(255, 255, 255, 0.06)",
      buttonBg: "rgba(255, 255, 255, 0.055)",
      border: "rgba(255, 255, 255, 0.1)",
      text: "#eef4f5",
      textSoft: "#93a0aa",
      accent: "#1fcfc3",
      accentText: "#061515",
      accentBorder: "#1fcfc3",
      danger: "#ffb3b3",
      optionBg: "#141821"
    },
    jade: {
      appBg: "#fff5f9",
      shellBg: "#fff1f6",
      sidebarBg: "rgba(255, 242, 247, 0.96)",
      topbarBg: "rgba(255, 248, 251, 0.94)",
      panelBg: "rgba(255, 255, 255, 0.72)",
      panelStrongBg: "rgba(255, 255, 255, 0.82)",
      inputBg: "rgba(255, 255, 255, 0.85)",
      buttonBg: "rgba(255, 255, 255, 0.8)",
      border: "rgba(236, 111, 158, 0.18)",
      text: "#35212a",
      textSoft: "#8d7280",
      accent: "#ec6f9e",
      accentText: "#ffffff",
      accentBorder: "#ec6f9e",
      danger: "#cf5b79",
      optionBg: "#fff7fb"
    },
    graphite: {
      appBg: "#fcf4e7",
      shellBg: "#f6ebdb",
      sidebarBg: "rgba(249, 239, 226, 0.96)",
      topbarBg: "rgba(252, 246, 236, 0.94)",
      panelBg: "rgba(255, 251, 244, 0.82)",
      panelStrongBg: "rgba(255, 252, 247, 0.9)",
      inputBg: "rgba(255, 255, 255, 0.88)",
      buttonBg: "rgba(255, 255, 255, 0.82)",
      border: "rgba(201, 134, 82, 0.18)",
      text: "#3b2d22",
      textSoft: "#907561",
      accent: "#c98652",
      accentText: "#ffffff",
      accentBorder: "#c98652",
      danger: "#b86c4b",
      optionBg: "#fffaf3"
    },
    mist: {
      appBg: "#eef5f7",
      shellBg: "#f6fbfc",
      sidebarBg: "rgba(245, 249, 250, 0.96)",
      topbarBg: "rgba(248, 251, 252, 0.94)",
      panelBg: "rgba(255, 255, 255, 0.82)",
      panelStrongBg: "rgba(255, 255, 255, 0.92)",
      inputBg: "rgba(255, 255, 255, 0.88)",
      buttonBg: "rgba(255, 255, 255, 0.82)",
      border: "rgba(13, 122, 118, 0.16)",
      text: "#1f3132",
      textSoft: "#6e8082",
      accent: "#0d7a76",
      accentText: "#ffffff",
      accentBorder: "#0d7a76",
      danger: "#c65d5d",
      optionBg: "#f7fbfc"
    }
  };
  return palette[normalizeTheme(theme)] || palette.dark;
}
export function loadOutfitPromptPresets() {
  const builtins = BUILTIN_PROMPT_LIBRARY.map(normalizePromptPreset).filter((preset) => preset.content);
  const stored = readJsonStorage(PROMPT_PRESETS_KEY, null);
  if (Array.isArray(stored) && stored.length > 0) {
    const builtinsById = new Map(builtins.map((preset) => [preset.id, preset]));
    const seenIds = new Set();
    const merged = stored.map(normalizePromptPreset).filter((preset) => preset.content).map((preset) => {
      seenIds.add(preset.id);
      const builtin = builtinsById.get(preset.id);
      if (!builtin || preset.custom) return preset;
      return {
        ...preset,
        title: builtin.title,
        content: builtin.content,
        custom: false
      };
    });
    builtins.forEach((preset) => {
      if (!seenIds.has(preset.id)) merged.push(preset);
    });
    return merged;
  }
  return builtins;
}
export function loadOutfitPromptCategories() {
  const storedCategories = readJsonStorage(PROMPT_CATEGORIES_KEY, null);
  const storedPrompts = readJsonStorage(PROMPT_PRESETS_KEY, null) || [];
  const presetCategories = Array.isArray(storedPrompts)
    ? storedPrompts.map((preset) => preset?.category)
    : [];
  const base = Array.isArray(storedCategories) && storedCategories.length > 0
    ? ["全部", ...storedCategories]
    : PROMPT_CATEGORIES;
  return normalizePromptCategories([...base, ...presetCategories]);
}
export function formatClock(value) {
  const time = Number(value);
  if (!Number.isFinite(time) || time <= 0) return "--";
  return new Date(time).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}
export function qualityStatusClass(check) {
  const status = normalizeQualityCheckResult(check)?.status || "";
  if (status === "passed") return "pass";
  if (status === "failed") return "fail";
  if (status === "checking" || status === "pending") return "checking";
  if (status === "skipped") return "skipped";
  return status ? "error" : "";
}
export function qualityStatusLabel(check) {
  const item = normalizeQualityCheckResult(check);
  if (!item) return "";
  const score = Number.isFinite(item.score) ? ` ${item.score}` : "";
  if (item.status === "passed") return `质检合格${score}`;
  if (item.status === "failed") return `质检不合格${score}`;
  if (item.status === "checking") return "AI质检中";
  if (item.status === "pending") return "等待质检";
  if (item.status === "skipped") return "未质检";
  return "质检异常";
}
export function qualityBadgeTitle(check) {
  const item = normalizeQualityCheckResult(check);
  if (!item) return "";
  return [
    qualityStatusLabel(item),
    item.summary,
    item.faceQuality ? `脸部：${item.faceQuality}` : "",
    item.poseMatch ? `姿态：${item.poseMatch}` : "",
    item.outfitMatch ? `服装：${item.outfitMatch}` : "",
    item.issues.length ? `问题：${item.issues.join("；")}` : "",
    item.repairPrompt ? `返修：${item.repairPrompt}` : ""
  ].filter(Boolean).join("\n");
}
export function fileFromBlob(blob, name, fallbackMimeType = "image/png") {
  const mimeType = blob?.type || fallbackMimeType;
  const extension = imageExtension(mimeType);
  return new File([blob], `${fileBaseName(name || "image")}.${extension}`, {
    type: mimeType,
    lastModified: Date.now()
  });
}
export function groupPreprocessValue(items, fallbackMode) {
  if (!items.length) return fallbackMode;
  const modes = [...new Set(items.map((item) => item.mode || fallbackMode))];
  return modes.length === 1 ? modes[0] : "mixed";
}
export function normalizeGenerationCount(value) {
  if (value === "auto") return "auto";
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return "auto";
  return Math.max(1, Math.min(MAX_UPLOAD_IMAGES, number));
}
export function normalizeBatchConcurrency(value) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return DEFAULT_BATCH_CONCURRENCY;
  return Math.max(1, Math.min(DEFAULT_BATCH_CONCURRENCY, number));
}
export function shouldUpgradeLegacyBatchConcurrency(value = {}) {
  const number = Number.parseInt(value?.concurrency, 10);
  return number === 3 && value?.[BATCH_CONCURRENCY_DEFAULT_MIGRATION_KEY] !== true;
}
export function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}
export function createAsyncLimiter(limit) {
  const max = Math.max(1, Number(limit) || 1);
  let active = 0;
  const queue = [];
  const release = () => {
    active = Math.max(0, active - 1);
    const next = queue.shift();
    if (next) next();
  };
  return async function runLimited(task) {
    if (active >= max) {
      await new Promise((resolve) => queue.push(resolve));
    }
    active += 1;
    try {
      return await task();
    } finally {
      release();
    }
  };
}
export async function canvasToHighQualityJpegBlob(canvas, options = {}) {
  const qualities = Array.isArray(options.qualities) && options.qualities.length
    ? options.qualities
    : LOCAL_EDIT_OUTPUT_JPEG_QUALITIES;
  const targetBytes = Math.max(1, Number(options.targetBytes || LOCAL_EDIT_OUTPUT_TARGET_BYTES));
  let best = null;
  for (const quality of qualities) {
    const blob = await canvasToBlob(canvas, "image/jpeg", quality);
    best = { blob, quality };
    if (blob.size <= targetBytes) return best;
  }
  return best;
}
export async function canvasToLosslessPngBlob(canvas) {
  const blob = await canvasToBlob(canvas, "image/png");
  return { blob, quality: 1 };
}
export async function canvasToCropReturnBlob(canvas, options = {}) {
  return canvasToHighQualityJpegBlob(canvas, {
    targetBytes: Number(options.targetBytes || CROP_RETURN_OUTPUT_TARGET_BYTES),
    qualities: CROP_RETURN_OUTPUT_JPEG_QUALITIES
  });
}
export async function composeOutfitLocalEditBlob(originalFile, generatedBlob, cropRect, localEdit = null, options = {}) {
  const original = await imageBitmapFromFile(originalFile);
  const generated = await imageBitmapFromBlob(generatedBlob);
  let maskImage = null;
  let blendMask = null;
  try {
    const sourceWidth = original.width || original.naturalWidth;
    const sourceHeight = original.height || original.naturalHeight;
    const pasteRect = constrainLocalEditRect(localEdit?.cropRect || cropRect, sourceWidth, sourceHeight);

    const diagnostics = {
      strategy: String(options.strategy || "local-paste"),
      editMode: localEdit?.editMode || LOCAL_EDIT_RECT_MODE,
      sourceWidth,
      sourceHeight,
      generatedWidth: generated.width || generated.naturalWidth || 0,
      generatedHeight: generated.height || generated.naturalHeight || 0,
      frameFit: "stretch",
      pasteRect: localEditRectSnapshot(pasteRect),
      contextRect: null,
      hasContext: false,
      hasMask: Boolean(localEdit?.editMode === LOCAL_EDIT_MASK_MODE && localEdit?.maskDataUrl),
      autoAlign: false,
      maxShift: 0,
      colorMatch: false,
      neutralToneMatch: false,
      sharpenPatch: false,
      protectSkinAndFace: false,
      feather: 0,
      patchRect: { x: pasteRect.x, y: pasteRect.y, width: pasteRect.width, height: pasteRect.height },
      composedAt: Date.now()
    };

    if (localEdit?.editMode === LOCAL_EDIT_MASK_MODE && localEdit?.maskDataUrl) {
      maskImage = await imageBitmapFromDataUrl(localEdit.maskDataUrl);
      blendMask = createLocalEditAlphaMask(maskImage, pasteRect, 0);
    }

    const useLosslessOutput = options.losslessOutput !== false;
    const composed = await composeLocalPasteBlob(original, generated, pasteRect, {
      maskImage: blendMask,
      mimeType: useLosslessOutput ? "image/png" : "image/jpeg",
      targetBytes: Number(options.outputTargetBytes || LOCAL_EDIT_OUTPUT_TARGET_BYTES),
      qualities: LOCAL_EDIT_OUTPUT_JPEG_QUALITIES
    });
    diagnostics.output = {
      mimeType: composed.blob.type || (useLosslessOutput ? "image/png" : "image/jpeg"),
      quality: composed.quality,
      bytes: composed.blob.size,
      lossless: useLosslessOutput,
      targetBytes: Number(options.outputTargetBytes || LOCAL_EDIT_OUTPUT_TARGET_BYTES)
    };
    return options.returnDiagnostics ? { blob: composed.blob, diagnostics } : composed.blob;
  } finally {
    original.close?.();
    generated.close?.();
    maskImage?.close?.();
  }
}
export async function composeCropReturnBlob(originalFile, generatedBlob, cropReturn, options = {}) {
  if (!originalFile) throw new Error("缺少原图，无法回流到大图画布");
  const original = await imageBitmapFromFile(originalFile);
  const generated = await imageBitmapFromBlob(generatedBlob);
  try {
    const rect = normalizeCropReturnMeta(cropReturn);
    if (!rect?.cropRect) throw new Error("缺少裁剪回流尺寸，无法回流到大图画布");
    const sourceWidth = Math.max(1, Math.round(original.width || original.naturalWidth || rect.sourceWidth));
    const sourceHeight = Math.max(1, Math.round(original.height || original.naturalHeight || rect.sourceHeight));
    const pasteRect = constrainLocalEditRect(rect.cropRect, sourceWidth, sourceHeight);
    const canvas = document.createElement("canvas");
    canvas.width = sourceWidth;
    canvas.height = sourceHeight;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("无法创建裁剪回流画布");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, sourceWidth, sourceHeight);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(original, 0, 0, sourceWidth, sourceHeight);
    ctx.drawImage(generated, pasteRect.x, pasteRect.y, pasteRect.width, pasteRect.height);
    const { blob, quality } = await canvasToCropReturnBlob(canvas, options);
    return {
      blob,
      diagnostics: {
        strategy: "crop-return-full-canvas-v1",
        sourceWidth,
        sourceHeight,
        cropRect: cropReturnRectSnapshot(pasteRect),
        outputWidth: sourceWidth,
        outputHeight: sourceHeight,
        generatedWidth: generated.width || generated.naturalWidth || 0,
        generatedHeight: generated.height || generated.naturalHeight || 0,
        output: {
          mimeType: "image/jpeg",
          quality,
          bytes: blob.size,
          targetBytes: Number(options.targetBytes || CROP_RETURN_OUTPUT_TARGET_BYTES)
        },
        composedAt: Date.now()
      }
    };
  } finally {
    original.close?.();
    generated.close?.();
  }
}
export async function composeOutpaintOriginalRegionBlob(originalFile, generatedBlob, outpaintMeta, options = {}) {
  if (!originalFile) throw new Error("缺少原图，无法保护扩图原有区域");
  const original = await imageBitmapFromFile(originalFile);
  const generated = await imageBitmapFromBlob(generatedBlob);
  try {
    const outputWidth = Math.max(1, Math.round(generated.width || generated.naturalWidth || outpaintMeta?.outputWidth || 1));
    const outputHeight = Math.max(1, Math.round(generated.height || generated.naturalHeight || outpaintMeta?.outputHeight || 1));
    const sourceWidth = Math.max(1, Math.round(original.width || original.naturalWidth || outpaintMeta?.sourceWidth || 1));
    const sourceHeight = Math.max(1, Math.round(original.height || original.naturalHeight || outpaintMeta?.sourceHeight || 1));
    const preparedWidth = Math.max(1, Number(outpaintMeta?.outputWidth) || outputWidth);
    const preparedHeight = Math.max(1, Number(outpaintMeta?.outputHeight) || outputHeight);
    const sourceRect = outpaintMeta?.originalRect || {
      x: 0,
      y: 0,
      width: preparedWidth,
      height: Math.min(preparedHeight, Math.round(preparedWidth * (sourceHeight / sourceWidth)))
    };
    const protectedRect = constrainLocalEditRect({
      x: Math.round(Number(sourceRect.x || 0) * outputWidth / preparedWidth),
      y: Math.round(Number(sourceRect.y || 0) * outputHeight / preparedHeight),
      width: Math.round(Number(sourceRect.width || preparedWidth) * outputWidth / preparedWidth),
      height: Math.round(Number(sourceRect.height || preparedHeight) * outputHeight / preparedHeight)
    }, outputWidth, outputHeight);
    const canvas = document.createElement("canvas");
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("无法创建扩图原图保护画布");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, outputWidth, outputHeight);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(generated, 0, 0, outputWidth, outputHeight);
    const featherHeight = Math.max(0, Math.min(
      Math.max(24, Math.round(protectedRect.height * 0.08)),
      160,
      Math.max(0, protectedRect.height - 4)
    ));
    const lockedHeight = Math.max(0, protectedRect.height - featherHeight);
    if (lockedHeight > 0) {
      const lockedSourceHeight = Math.max(1, Math.round(sourceHeight * lockedHeight / protectedRect.height));
      ctx.drawImage(
        original,
        0,
        0,
        sourceWidth,
        lockedSourceHeight,
        protectedRect.x,
        protectedRect.y,
        protectedRect.width,
        lockedHeight
      );
    }
    if (featherHeight > 0) {
      const featherCanvas = document.createElement("canvas");
      featherCanvas.width = protectedRect.width;
      featherCanvas.height = featherHeight;
      const featherCtx = featherCanvas.getContext("2d");
      if (featherCtx) {
        const sourceFeatherHeight = Math.max(1, Math.round(sourceHeight * featherHeight / protectedRect.height));
        featherCtx.imageSmoothingEnabled = true;
        featherCtx.imageSmoothingQuality = "high";
        featherCtx.drawImage(
          original,
          0,
          Math.max(0, sourceHeight - sourceFeatherHeight),
          sourceWidth,
          sourceFeatherHeight,
          0,
          0,
          protectedRect.width,
          featherHeight
        );
        featherCtx.globalCompositeOperation = "destination-in";
        const gradient = featherCtx.createLinearGradient(0, 0, 0, featherHeight);
        gradient.addColorStop(0, "rgba(0,0,0,1)");
        gradient.addColorStop(0.58, "rgba(0,0,0,0.78)");
        gradient.addColorStop(1, "rgba(0,0,0,0)");
        featherCtx.fillStyle = gradient;
        featherCtx.fillRect(0, 0, protectedRect.width, featherHeight);
        ctx.drawImage(featherCanvas, protectedRect.x, protectedRect.y + lockedHeight);
      }
    } else {
      ctx.drawImage(original, 0, 0, sourceWidth, sourceHeight, protectedRect.x, protectedRect.y, protectedRect.width, protectedRect.height);
    }
    const { blob, quality } = await canvasToLosslessPngBlob(canvas);
    const diagnostics = {
      strategy: "outpaint-original-region-lock-v2-feather",
      sourceWidth,
      sourceHeight,
      preparedWidth,
      preparedHeight,
      generatedWidth: outputWidth,
      generatedHeight: outputHeight,
      originalRect: cropReturnRectSnapshot(sourceRect),
      protectedRect: cropReturnRectSnapshot(protectedRect),
      featherHeight,
      blankRect: outpaintMeta?.blankRect ? cropReturnRectSnapshot(outpaintMeta.blankRect) : null,
      output: {
        mimeType: blob.type || "image/png",
        quality,
        bytes: blob.size,
        lossless: true
      },
      composedAt: Date.now()
    };
    return options.returnDiagnostics ? { blob, diagnostics } : blob;
  } finally {
    original.close?.();
    generated.close?.();
  }
}
export async function blobFromOutfitImage(image) {
  const src = imageSource(image);
  if (!src) throw new Error("图片地址无效");
  return fetchImageBlob(src, "图片下载失败");
}
export async function processImageFileWithMeta(file, ratio, mode = "pad", crop = null) {
  const outputFile = await processImageFile(file, ratio, mode, crop);
  if (mode !== "crop" || !crop) return { file: outputFile, cropReturn: null };
  const originalUrl = URL.createObjectURL(file);
  try {
    const image = await loadImageFromUrl(originalUrl);
    const sourceWidth = image.naturalWidth || image.width || 0;
    const sourceHeight = image.naturalHeight || image.height || 0;
    const cropRect = resolveCropSourceRect(image, ratio, crop);
    return {
      file: outputFile,
      cropReturn: {
        enabled: true,
        mode: "crop-return",
        cropRect,
        sourceWidth,
        sourceHeight,
        aspectRatio: ratio,
        cropWidth: cropRect.width,
        cropHeight: cropRect.height,
        outputWidth: sourceWidth,
        outputHeight: sourceHeight,
        createdAt: Date.now()
      }
    };
  } finally {
    URL.revokeObjectURL(originalUrl);
  }
}
export async function ensureOutfitUploadCanvasRatio(file, ratio) {
  if (!(file instanceof File)) return file;
  const targetRatio = ratioParts(ratio).value;
  const originalUrl = URL.createObjectURL(file);
  try {
    const image = await loadImageFromUrl(originalUrl);
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (!width || !height) return await compressOriginalImageFile(file);
    const sourceRatio = width / height;
    if (Math.abs(sourceRatio - targetRatio) <= 0.015) {
      return await compressOriginalImageFile(file);
    }
    return await padImageFile(file, image, ratio, false);
  } finally {
    URL.revokeObjectURL(originalUrl);
  }
}
export async function prepareOutpaintUploadCanvas(file, ratio) {
  const emptyMeta = async (nextFile = file, sourceWidth = 0, sourceHeight = 0) => ({
    file: nextFile,
    maskFile: null,
    originalRect: null,
    blankRect: null,
    maskRect: null,
    outputWidth: 0,
    outputHeight: 0,
    sourceWidth,
    sourceHeight
  });
  if (!(file instanceof File)) {
    return emptyMeta(file, 0, 0);
  }
  const targetRatio = ratioParts(ratio || "9:16").value;
  const originalUrl = URL.createObjectURL(file);
  try {
    const image = await loadImageFromUrl(originalUrl);
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (!width || !height) {
      return emptyMeta(await compressOriginalImageFile(file), 0, 0);
    }

    const ratioHeight = Math.round(width / targetRatio);
    const minExtensionHeight = Math.round(height * 0.42);
    const targetHeight = Math.max(ratioHeight, height + minExtensionHeight);
    const baseScale = Math.min(1, CHANNEL_UPLOAD_MAX_SIDE / Math.max(width, targetHeight));
    const qualities = [0.92, 0.88, 0.84, 0.78, 0.72, 0.66, 0.6, 0.54, 0.48];
    let scaleFactor = 1;
    let lastAttempt = null;

    function renderPair(scaleDown) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * scaleDown));
      canvas.height = Math.max(1, Math.round(targetHeight * scaleDown));
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) throw new Error("无法创建扩图上传画布");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const drawWidth = Math.max(1, Math.round(width * scaleDown));
      const drawHeight = Math.max(1, Math.round(height * scaleDown));
      const drawX = Math.round((canvas.width - drawWidth) / 2);
      ctx.drawImage(image, drawX, 0, drawWidth, drawHeight);

      const blankStartY = drawHeight;
      if (blankStartY < canvas.height) {
        const stripHeight = Math.max(2, Math.round(drawHeight * 0.035));
        const bleedHeight = Math.min(canvas.height - blankStartY, Math.max(8, stripHeight * 5));
        ctx.save();
        ctx.globalAlpha = 0.16;
        ctx.filter = "blur(10px)";
        ctx.drawImage(
          image,
          0,
          Math.max(0, height - Math.round(height * 0.05)),
          width,
          Math.max(1, Math.round(height * 0.05)),
          drawX,
          blankStartY - Math.round(stripHeight / 2),
          drawWidth,
          bleedHeight
        );
        ctx.restore();
      }

      const overlapHeight = Math.max(0, Math.min(
        Math.max(24, Math.round(drawHeight * 0.08)),
        192,
        Math.max(0, drawHeight - 4),
        Math.max(0, canvas.height - 1)
      ));
      const editableStartY = Math.max(0, drawHeight - overlapHeight);
      const maskCanvas = document.createElement("canvas");
      maskCanvas.width = canvas.width;
      maskCanvas.height = canvas.height;
      const maskCtx = maskCanvas.getContext("2d");
      if (!maskCtx) throw new Error("无法创建扩图蒙版");
      maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
      maskCtx.fillStyle = "rgba(255,255,255,1)";
      maskCtx.fillRect(0, 0, maskCanvas.width, editableStartY);

      return {
        canvas,
        maskCanvas,
        scaleDown,
        drawX,
        drawWidth,
        drawHeight,
        blankStartY,
        overlapHeight,
        editableStartY
      };
    }

    for (let attempt = 0; attempt < 7; attempt += 1) {
      const rendered = renderPair(baseScale * scaleFactor);
      const maskBlob = await canvasToBlob(rendered.maskCanvas, "image/png");
      for (const quality of qualities) {
        const imageBlob = await canvasToBlob(rendered.canvas, "image/jpeg", quality);
        lastAttempt = { rendered, imageBlob, maskBlob, quality };
        if (imageBlob.size <= CHANNEL_UPLOAD_TARGET_BYTES && maskBlob.size <= CHANNEL_UPLOAD_LIMIT_BYTES) {
          return {
            file: fileFromBlob(imageBlob, `${fileBaseName(file.name)}_outpaint_upload`, "image/jpeg"),
            maskFile: fileFromBlob(maskBlob, `${fileBaseName(file.name)}_outpaint_mask`, "image/png"),
            originalRect: {
              x: rendered.drawX,
              y: 0,
              width: rendered.drawWidth,
              height: rendered.drawHeight
            },
            blankRect: {
              x: rendered.drawX,
              y: rendered.drawHeight,
              width: rendered.drawWidth,
              height: Math.max(0, rendered.canvas.height - rendered.drawHeight)
            },
            maskRect: {
              x: 0,
              y: rendered.editableStartY,
              width: rendered.canvas.width,
              height: Math.max(0, rendered.canvas.height - rendered.editableStartY)
            },
            outputWidth: rendered.canvas.width,
            outputHeight: rendered.canvas.height,
            sourceWidth: width,
            sourceHeight: height,
            scale: rendered.scaleDown,
            maskOverlapHeight: rendered.overlapHeight,
            imageQuality: quality,
            createdAt: Date.now()
          };
        }
      }
      scaleFactor *= 0.84;
    }

    if (lastAttempt?.imageBlob?.size <= CHANNEL_UPLOAD_LIMIT_BYTES && lastAttempt?.maskBlob?.size <= CHANNEL_UPLOAD_LIMIT_BYTES) {
      const { rendered, imageBlob, maskBlob, quality } = lastAttempt;
      return {
        file: fileFromBlob(imageBlob, `${fileBaseName(file.name)}_outpaint_upload`, "image/jpeg"),
        maskFile: fileFromBlob(maskBlob, `${fileBaseName(file.name)}_outpaint_mask`, "image/png"),
        originalRect: {
          x: rendered.drawX,
          y: 0,
          width: rendered.drawWidth,
          height: rendered.drawHeight
        },
        blankRect: {
          x: rendered.drawX,
          y: rendered.drawHeight,
          width: rendered.drawWidth,
          height: Math.max(0, rendered.canvas.height - rendered.drawHeight)
        },
        maskRect: {
          x: 0,
          y: rendered.editableStartY,
          width: rendered.canvas.width,
          height: Math.max(0, rendered.canvas.height - rendered.editableStartY)
        },
        outputWidth: rendered.canvas.width,
        outputHeight: rendered.canvas.height,
        sourceWidth: width,
        sourceHeight: height,
        scale: rendered.scaleDown,
        maskOverlapHeight: rendered.overlapHeight,
        imageQuality: quality,
        createdAt: Date.now()
      };
    }

    throw new Error("扩图上传图和蒙版压缩后仍超过 4MB，请换一张更轻的素材再试");
  } finally {
    URL.revokeObjectURL(originalUrl);
  }
}
export async function createImageItem(file, ratio, mode) {
  const originalUrl = URL.createObjectURL(file);
  const processedFile = await processImageFile(file, ratio, mode);
  const processedUrl = URL.createObjectURL(processedFile);
  return {
    id: makeId("img"),
    name: file.name,
    originalFile: file,
    file: processedFile,
    originalUrl,
    previewUrl: processedUrl,
    mode,
    cropReturn: null,
    localEdit: null,
    selected: true,
    createdAt: Date.now()
  };
}
export function serializeDraftImageItem(item) {
  if (!item?.originalFile && !item?.file) return null;
  const cropReturn = normalizeCropReturnMeta(item.cropReturn);
  const localEdit = item.localEdit?.cropFile && item.localEdit?.cropRect
    ? {
        cropFile: item.localEdit.cropFile,
        cropRect: item.localEdit.cropRect,
        contextRect: item.localEdit.contextRect || null,
        sourceWidth: Number(item.localEdit.sourceWidth || 0),
        sourceHeight: Number(item.localEdit.sourceHeight || 0),
        aspectRatio: item.localEdit.aspectRatio || "1:1",
        editMode: item.localEdit.editMode || LOCAL_EDIT_RECT_MODE,
        maskDataUrl: item.localEdit.maskDataUrl || "",
        maskBounds: item.localEdit.maskBounds || null,
        brushSize: item.localEdit.brushSize || LOCAL_EDIT_BRUSH_DEFAULT,
        maskOpacity: item.localEdit.maskOpacity || LOCAL_EDIT_MASK_OPACITY_DEFAULT,
        appliedAt: Number(item.localEdit.appliedAt || Date.now())
      }
    : null;
  return {
    id: String(item.id || makeId("img")),
    name: String(item.name || item.originalFile?.name || item.file?.name || "image.jpg"),
    originalFile: item.originalFile || item.file,
    file: item.file || item.originalFile,
    mode: item.mode || DEFAULT_PREPROCESS_MODE,
    cropReturn,
    localEdit,
    selected: item.selected !== false,
    createdAt: Number(item.createdAt || Date.now())
  };
}
export function hydrateDraftImageItem(item) {
  const originalFile = item?.originalFile || item?.file;
  const file = item?.file || originalFile;
  if (!originalFile || !file) return null;
  return {
    id: String(item.id || makeId("img")),
    name: String(item.name || originalFile.name || file.name || "image.jpg"),
    originalFile,
    file,
    originalUrl: URL.createObjectURL(originalFile),
    previewUrl: URL.createObjectURL(file),
    mode: item.mode || DEFAULT_PREPROCESS_MODE,
    cropReturn: normalizeCropReturnMeta(item.cropReturn),
    localEdit: item.localEdit?.cropFile && item.localEdit?.cropRect
      ? {
          cropFile: item.localEdit.cropFile,
          cropRect: item.localEdit.cropRect,
          contextRect: item.localEdit.contextRect || null,
          sourceWidth: Number(item.localEdit.sourceWidth || 0),
          sourceHeight: Number(item.localEdit.sourceHeight || 0),
          previewUrl: URL.createObjectURL(item.localEdit.cropFile),
          aspectRatio: item.localEdit.aspectRatio || "1:1",
          editMode: item.localEdit.editMode || LOCAL_EDIT_RECT_MODE,
          maskDataUrl: item.localEdit.maskDataUrl || "",
          maskBounds: item.localEdit.maskBounds || null,
          brushSize: item.localEdit.brushSize || LOCAL_EDIT_BRUSH_DEFAULT,
          maskOpacity: item.localEdit.maskOpacity || LOCAL_EDIT_MASK_OPACITY_DEFAULT,
          appliedAt: Number(item.localEdit.appliedAt || Date.now())
        }
      : null,
    selected: item.selected !== false,
    createdAt: Number(item.createdAt || Date.now())
  };
}
export function serializeOriginalDraftItem(item, imageById) {
  const source = imageById.get(item?.sourceId);
  const file = source?.originalFile || source?.file || null;
  if (!file) return null;
  return {
    id: String(item.id || makeId("origin")),
    group: item.group || "",
    sourceId: String(item.sourceId || source.id || ""),
    name: String(item.name || file.name || "image.jpg"),
    file,
    size: Number(item.size || file.size || 0),
    createdAt: Number(item.createdAt || Date.now())
  };
}
export function hydrateOriginalDraftItem(item) {
  const file = item?.file;
  if (!file) return null;
  return {
    id: String(item.id || makeId("origin")),
    group: item.group || "",
    sourceId: String(item.sourceId || ""),
    name: String(item.name || file.name || "image.jpg"),
    url: URL.createObjectURL(file),
    size: Number(item.size || file.size || 0),
    createdAt: Number(item.createdAt || Date.now())
  };
}
export function serializeDraftPage(page) {
  const modelImages = (page?.modelImages || []).map(serializeDraftImageItem).filter(Boolean);
  const clothingImages = (page?.clothingImages || []).map(serializeDraftImageItem).filter(Boolean);
  const referenceImages = (page?.referenceImages || []).map(serializeDraftImageItem).filter(Boolean);
  const imageById = new Map([...modelImages, ...clothingImages, ...referenceImages].map((item) => [item.id, item]));
  return {
    ...serializeOutfitPage(page),
    modelImages,
    clothingImages,
    referenceImages,
    fixedClothingId: String(page?.fixedClothingId || ""),
    originalLibrary: (page?.originalLibrary || []).map((item) => serializeOriginalDraftItem(item, imageById)).filter(Boolean),
    activeUploadGroup: page?.activeUploadGroup || "model",
    tasks: Array.isArray(page?.tasks) ? page.tasks.map(sanitizeTaskHistoryItem).filter(Boolean) : []
  };
}
export function hydrateDraftPage(page, options = {}) {
  const pageName = normalizeOutfitPageName(page?.name, DEFAULT_OUTFIT_PAGE_NAME);
  const modelImages = (page?.modelImages || []).map(hydrateDraftImageItem).filter(Boolean);
  const clothingImages = (page?.clothingImages || []).map(hydrateDraftImageItem).filter(Boolean);
  const referenceImages = (page?.referenceImages || []).map(hydrateDraftImageItem).filter(Boolean);
  const tasks = hydrateTasksWithUploadReferences(recoverPersistedTasks(page?.tasks, options), {
    modelImages,
    clothingImages,
    referenceImages
  });
  return makeOutfitPage(pageName, {
    ...page,
    modelImages,
    clothingImages,
    referenceImages,
    originalLibrary: (page?.originalLibrary || []).map(hydrateOriginalDraftItem).filter(Boolean),
    uploadLabels: normalizeUploadLabels(page?.uploadLabels || {}, pageName),
    tasks
  });
}
export async function persistOutfitDraftState(pages, activeId) {
  const serializablePages = ensureWorkflowPages(pages, readSettings()).map(serializeDraftPage);
  await outfitLocalSet(OUTFIT_DRAFT_DB_KEY, {
    activeId,
    pages: serializablePages,
    updatedAt: Date.now()
  });
}
export async function loadOutfitDraftState(options = {}) {
  const draft = await outfitLocalGet(OUTFIT_DRAFT_DB_KEY, null);
  if (!draft || !Array.isArray(draft.pages) || draft.pages.length === 0) return null;
  const pages = draft.pages.map((page) => hydrateDraftPage(page, options)).filter(Boolean);
  if (!pages.length) return null;
  return {
    activeId: pages.some((page) => page.id === draft.activeId) ? draft.activeId : pages[0].id,
    pages
  };
}
export function moveItemByDrop(items, fromId, toId, placement) {
  if (!fromId || !toId || fromId === toId) return items;
  const fromIndex = items.findIndex((item) => item.id === fromId);
  const targetIndex = items.findIndex((item) => item.id === toId);
  if (fromIndex < 0 || targetIndex < 0) return items;

  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  const normalizedTargetIndex = next.findIndex((item) => item.id === toId);
  next.splice(placement === "after" ? normalizedTargetIndex + 1 : normalizedTargetIndex, 0, moved);
  return next;
}
export function defaultLocalEditCrop(width, height, ratio) {
  // 2026-09-25：默认选框就是上次/当前选定的比例（居中、约占 62%），
  // 因为局部回贴选框必须"始终"等于所选比例。
  return fitRectToRatioLocked(null, ratio, width, height);
}
