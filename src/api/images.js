import { postForm } from "./client.js";

export function generateImages(form, options = {}) {
  return postForm("/api/images", form, "图片生成失败", options);
}
