// 导出文件名的公共实现。
//
// 为什么要有这个文件（前端专项阶段 B · 刀 3）：
//   `fileBaseName` 此前有 3 份定义（src/image-editor.jsx、src/main.jsx、
//   src/outfit-workflow.jsx），三份只有形参名不同（name / filename），行为逐字节等价。
//
// 行为：去掉最后一个扩展名；空值或非字符串一律落到 "image"（不返回空串，
// 否则会生成 ".jpg" 这种没有主文件名的怪名字）。

export function fileBaseName(name) {
  return String(name || "image").replace(/\.[^.]+$/, "") || "image";
}
