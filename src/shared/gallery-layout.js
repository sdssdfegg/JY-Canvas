// src/shared/gallery-layout.js
// V138（2026-10-27）：快捷生成与批量生成的结果卡「基准最小宽度」唯一真相源。
//
// 背景：两边各自写死了一份基准值（快捷 170 / 批量 176），导致同一张结果图在
// 快捷生成和批量生成里显示大小不一致。用户要求以批量生成的尺寸为准统一。
//
// 纪律：这是零依赖叶子模块（只 export 常量），启动链路上的任意模块都可安全 import。
// 以后要调卡片大小只改这一个常量，两边自动一致；不要再在任一侧重算基准值。

// 结果卡基准最小宽度（px）。实际宽度 = 本值 × 画廊缩放（galleryZoom），
// 由调用方（quickgen-state.js / outfit-workflow.jsx）各自乘以自己的 zoom。
export const GALLERY_CARD_MIN_BASE = 176;
