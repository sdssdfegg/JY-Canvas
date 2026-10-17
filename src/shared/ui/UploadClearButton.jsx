// 上传模块统一「清除」钮（V82 落地；总纲 §4.2 派生）。
// 规格（用户 2026-10-17 两轮要求）：每个上传图片模块右上角一律挂它；纯文字「清除」居中、无图标
// ——图标+文字在 sm 28px 钮内堆叠溢出（换装旧版实测）；中性灰 default 色调（不要 danger 红，
// 与截图中「下装/连衣裙/鞋子」选项钮同色系不抢眼）；sm 阶 28px 与选项钮同高（紧凑）。
// size/tone 刻意不开 prop：统一视觉、防止再次分叉；rest 仅预期承载 title/aria-*/data-* 等原生属性。
import { Button } from "./Button";

export function UploadClearButton({ onClick, ...rest }) {
  return (
    <Button size="sm" tone="default" type="button" onClick={onClick} {...rest}>
      清除
    </Button>
  );
}
