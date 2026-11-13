// src/features/detail-studio/generation/result-image.js
// 共享：从生成任务抽取浏览器可加载的结果图 URL（同源 relative URL，绝不返回文件系统绝对路径）。
// 抽离自 GenerationPanel / StitchPreview 同名的局部函数，消除跨文件重复定义（frontend-duplication 红线）。

export function resultImageSrc(task) {
  const ref = task && task.resultRef;
  if (ref && (ref.localUrl || ref.value)) return ref.localUrl || ref.value;
  return null;
}
