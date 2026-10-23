// src/features/outfit/outfit-top.js
// RF-081 (V26): 从 src/outfit-workflow.jsx 抽出的模块顶层纯函数 + 常量。
// V64 (P5-2) 2026-10-15 三拆后残留「L0 基础层」：存储键、页面名/上传标签/各模式默认提示词常量、
//   readSettings/defaultSettings、结构化意图 normalize 一族（smartIntervention/
//   generationCount/batchConcurrency）、主题、提示词库加载、质检徽标、formatClock，
//   以及 moveItemByDrop 兼容 re-export（排序内核 2026-10-06 已抽到 src/shared/list-order.js）。
// 页面生命周期与草稿持久化 -> outfit-page-actions.js；图片/画布管线 -> outfit-image-pipeline.js。
// 形态：普通模块导出（非 B3 工厂）；只被 outfit-workflow.jsx 单向 import，自身绝不反向 import outfit，
//   也不 import 本次拆出的任何新文件（L0 铁律，见 V4.0-执行单-V64 §2.1-4）。

import { DEFAULT_PREPROCESS_MODE, MAX_UPLOAD_IMAGES } from "./outfit-panels.jsx";
import { normalizeQualityCheck, normalizeQualityCheckResult, normalizeRandomBackgroundFocus } from "./outfit-task.js";
import { readJsonStorage } from "../../lib/storage/json-storage.js";
import { defaultOutfitIntent, normalizeOutfitIntent } from "../../shared/outfit-intent.js";
import { loadPromptLibraryCategories, loadPromptLibraryPresets } from "../../shared/prompt-library.js";
import { defaultRetouchIntent, normalizeRetouchIntent } from "../../shared/retouch-intent.js";
import { canonicalModel } from "../../shared/routing.js";
// V121-R2：存储键常量迁出到零依赖叶子模块 outfit-storage-keys.js——本文件属于 outfit 特性模块群
// （与 outfit-panels.jsx 有相互循环），启动链路模块（release-seed.js）不能从这里取键，
// 否则 public 生产构建触发模块初始化期 TDZ（详见 outfit-storage-keys.js 文件头）。
// 本文件只用得着 STORAGE_KEY 与两个提示词键；OUTFIT_PAGES_KEY / OUTFIT_DELETED_WORKFLOW_MODES_KEY
// 本文件内部不使用，外部引用方已一并改从叶子模块 import（V98 纪律：git grep -l 全量核对过）。
import { PROMPT_CATEGORIES_KEY, PROMPT_PRESETS_KEY, STORAGE_KEY } from "./outfit-storage-keys.js";

export const BATCH_CONCURRENCY_DEFAULT_MIGRATION_KEY = "batchConcurrencyDefaultV5Applied";
export const GENERATION_COUNT_AUTOLINK_MIGRATION_KEY = "generationCountAutoLinkV11Applied";
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
// 旧批量改色默认提示词：2026-10-18 起仅作老页面迁移基准（见 makeOutfitPage custom 迁移分支），新页面一律用 GARMENT_RECOLOR_DEFAULT_PROMPT。
export const GARMENT_RECOLOR_DEFAULT_PROMPT = "把图1模特的上衣改成图2上衣的颜色，仅改变上衣颜色，不要添加缝线，不要改变纹理，不要添加细节，图2的上衣细节样式不作为参考";
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
// V111（用户要求·1板块）：自定义改色页的部位类别词。
// ⚠️ UI 标签（上装/下装）与提示词里的类别词（上衣/下衣）不是一套词，分别维护；
//    换装侧编译用的 promptLabel 在 shared/outfit-intent.js，不复用。
export const RECOLOR_PART_WORDS = Object.freeze({
  upper: ["上衣", "上装"],
  lower: ["下衣", "下装"],
  dress: ["连衣裙"],
  shoes: ["鞋子"]
});
// V111/V112（用户要求·1板块）：自定义改色页「更换部位」行的可选项——键与 RECOLOR_PART_WORDS 一一对应，
// 比换装旧机制的 OUTFIT_PART_OPTIONS（仅 上装/下装/鞋子）多一个「连衣裙」。UI 选项必须与词表对齐，否则连衣裙无法选中、联动缺失。
export const RECOLOR_PART_OPTIONS = Object.freeze([
  { value: "upper", label: "上装" },
  { value: "lower", label: "下装" },
  { value: "dress", label: "连衣裙" },
  { value: "shoes", label: "鞋子" }
]);
export function normalizeRecolorPart(value) {
  return RECOLOR_PART_WORDS[value] ? value : "upper";
}
/** 把 prompt 里「实际出现过的部位类别词」统一替换成新部位的词（单部位改色：提示词里 4 处应为同一部位的词）。
   忽略 fromPart —— 直接按正文里出现过的部位词来换，这样即便之前手动改词导致状态与正文错位，
   只要正文里是某部位的词，切一次部位就能整体对齐；正文没出现过的部位词（如偶然提到的「鞋子不动」）不会被误伤。 */
export function replaceRecolorPartWords(prompt, _fromPart, toPart) {
  const toWord = (RECOLOR_PART_WORDS[normalizeRecolorPart(toPart)] || [])[0];
  if (!toWord) return String(prompt || "");
  let text = String(prompt || "");
  const presentWords = Object.values(RECOLOR_PART_WORDS).flat().filter((word) => text.includes(word));
  if (presentWords.length === 0) return text;
  presentWords.forEach((word) => {
    text = text.split(word).join(toWord);
  });
  return text;
}
// 上装层级取值（与 shared/outfit-intent.js 的 UPPER_LAYER_OPTIONS 保持一致；此处就近放一份归一化）。
const RECOLOR_UPPER_LAYER_VALUES = ["single", "inner", "outer", "inner-outer"];
export function normalizeRecolorUpperLayer(value) {
  return RECOLOR_UPPER_LAYER_VALUES.includes(value) ? value : "single";
}
// V113-R1（用户要求）：上装层级的提示词类别词。⚠️ 不得与 RECOLOR_PART_WORDS 的词重叠（上衣/上装已被部位词占用），
// 层级词用「内搭/外套」这一族；single（仅一件上装）没有专属词——它的正文标记就是当前部位的词（上衣），
// 切入 single 时把层级词还原成部位词。「内搭」是「内搭和外套」的子串，替换必须长词优先，否则会切成残句。
export const RECOLOR_UPPER_LAYER_WORDS = Object.freeze({
  single: [],
  inner: ["内搭", "里搭", "里层"],
  outer: ["外套", "外搭", "外层"],
  "inner-outer": ["内搭和外套", "内搭外套", "内搭加外套", "内外叠穿"]
});
/** 把 prompt 里实际出现过的层级词（from=single 时为部位词）整体替换成新层级的词；
    正文没有任何层级词/部位词时不改动（保护用户手写内容，与部位联动同一口径）。 */
export function replaceRecolorUpperLayerWords(prompt, fromLayer, toLayer, partWord = "上衣") {
  const from = normalizeRecolorUpperLayer(fromLayer);
  const to = normalizeRecolorUpperLayer(toLayer);
  if (from === to) return String(prompt || "");
  const fromWords = from === "single"
    ? (RECOLOR_PART_WORDS.upper || [])
    : (RECOLOR_UPPER_LAYER_WORDS[from] || []);
  const toWord = to === "single" ? partWord : (RECOLOR_UPPER_LAYER_WORDS[to] || [])[0];
  if (!toWord) return String(prompt || "");
  let text = String(prompt || "");
  let replaced = false;
  [...fromWords].sort((a, b) => b.length - a.length).forEach((word) => {
    if (word && text.includes(word)) {
      replaced = true;
      text = text.split(word).join(toWord);
    }
  });
  return replaced ? text : String(prompt || "");
}
/** V125（用户实测 BUG 修复）：把正文里实际出现过的「上装层级词」（内搭/外套/内搭和外套…）整体替换成指定部位词。
   用于「更换部位」切到非上装（下装/连衣裙/鞋子）时——这些层级词已无意义，必须随部位一起换算，
   否则它们不在 RECOLOR_PART_WORDS 内、replaceRecolorPartWords 不会碰，导致提示词不随部位变化。
   长词优先替换，避免「内搭和外套」先被切成残句。partWord 为新部位的类别词（如下衣/连衣裙/鞋子）。 */
export function replaceUpperLayerWordsWithPart(prompt, partWord) {
  const text0 = String(prompt || "");
  if (!partWord) return text0;
  const words = [...new Set(Object.values(RECOLOR_UPPER_LAYER_WORDS).flat().filter(Boolean))]
    .sort((a, b) => b.length - a.length);
  let text = text0;
  words.forEach((word) => {
    if (word && text.includes(word)) text = text.split(word).join(partWord);
  });
  return text;
}
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
export const THEME_OPTIONS = [
  { value: "dark", label: "暗夜", colors: ["#080910", "#151522", "#10cfc4"] },
  { value: "jade", label: "柔粉", colors: ["#fff2f7", "#fffafd", "#ec6f9e"] },
  { value: "graphite", label: "米杏", colors: ["#f3e6d4", "#fff8ec", "#c98652"] },
  { value: "mist", label: "浅雾", colors: ["#f5f7fa", "#ffffff", "#0d7a76"] }
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
  // 1板块（自定义改色页）的更换部位（单选；驱动提示词类别词联动）。
  recolorPart: "upper",
  // 1板块（自定义改色页）的上装层级（仅选「上装」部位时出现；仅记录，不自动改写提示词正文）。
  recolorUpperLayer: "single",
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
    settings.recolorPart = normalizeRecolorPart(settings.recolorPart);
    settings.recolorUpperLayer = normalizeRecolorUpperLayer(settings.recolorUpperLayer);
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
// V118（2026-10-19）：改为纯用户自建库，不再注入/回灌内置项（执行单 §1.1）。
// 加载口径收口到 src/shared/prompt-library.js 的 loadPromptLibraryPresets（§1.2），此处薄封装。
export function loadOutfitPromptPresets() {
  return loadPromptLibraryPresets({ presetsKey: PROMPT_PRESETS_KEY });
}
export function loadOutfitPromptCategories() {
  return loadPromptLibraryCategories({ categoriesKey: PROMPT_CATEGORIES_KEY, presetsKey: PROMPT_PRESETS_KEY });
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
// 2026-10-06：排序内核已抽到 src/shared/list-order.js（它是通用数组工具，不属于换装域）。
// 这里重新导出，旧的 import 路径一行都不用改。
export { moveItemByDrop } from "../../shared/list-order.js";
