// canvas → Blob 的**唯一实现**。
//
// 为什么要有这个文件（前端专项阶段 B · 刀 3）：
//   `canvasToBlob` 此前有 4 份定义（src/image-editor.jsx、src/main.jsx、
//   src/outfit-workflow.jsx、src/shared/local-edit-geometry.js），其中 image-editor 那份
//   还带 `(type = "image/jpeg", quality = 0.94)` 默认值。统一成本文件的这一份。
//
// 签名（⚠️ 有意为之，不要加回默认值）：
//   统一成 `(canvas, type, quality)` —— **不提供默认值**。
//   取证：src/ 内 12 个调用点里没有任何一个依赖旧默认值，唯一的 image-editor 调用点
//   （image-editor.jsx:892）本来就显式写了 `("image/jpeg", 0.94)` ⇒ 默认值是死代码。
//   不设默认值可以让「漏传 type/quality」在代码评审时**看得见**，而不是被静默兜底。
//
// 错误文案：统一成「图片压缩失败」（原三选一：图片导出失败 / 图片压缩失败 / 图片编码失败）。
//   这是本刀**唯一的用户可见变化**。选它是因为 main + outfit 两处在用（多数派），
//   且开工前已 grep 全仓确认：scripts/verify/** 与浏览器探针**没有任何断言依赖**
//   这三句文案中的任何一句 ⇒ 不存在「改文案打断断言」的风险。
//   ⚠️ 若将来某处断言了其中一句，按「断言优先于多数派」改成被断言的那句。

export function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("图片压缩失败"));
    }, type, quality);
  });
}
