// src/features/detail-studio/generation/StitchPreview.jsx
// P2.8：客户端 canvas 纵向长图拼接预览（在 P0 的结果图网格 ScreenGrid 之上补充）。
// 纯前端：拉取每屏成功结果图 → 等比缩放拼成一张纵向长图 → 一键下载 PNG。
// 红线：不 import main.jsx 的 App 级 Modal；不搬旧模块；图源只用浏览器可加载的 relative URL（resultRef.localUrl/value）。
// 复用 src/shared/ui/Button；canvas 用同源图，不污染画布、可 toBlob 下载。

import { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "../../../shared/ui/Button.jsx";
import { resultImageSrc } from "./result-image.js";

export function StitchPreview({ tasks = [] }) {
  const canvasRef = useRef(null);
  const [stitched, setStitched] = useState(false);
  const [error, setError] = useState("");

  const images = tasks
    .filter((t) => t && t.status === "success" && resultImageSrc(t))
    .map((t) => resultImageSrc(t));
  const key = images.join("|");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    if (images.length === 0) {
      setStitched(false);
      setError("");
      return undefined;
    }
    let cancelled = false;
    const ctx = canvas.getContext("2d");
    Promise.all(images.map((src) => new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("图片加载失败：" + src));
      img.src = src;
    })))
      .then((loaded) => {
        if (cancelled) return;
        const pad = 8;
        const maxW = loaded.reduce((m, i) => Math.max(m, i.width), 0);
        const totalH = loaded.reduce((h, i) => h + (maxW / i.width) * i.height + pad, 0);
        canvas.width = maxW;
        canvas.height = Math.round(totalH);
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, maxW, totalH);
        let y = 0;
        for (const img of loaded) {
          const h = (maxW / img.width) * img.height;
          ctx.drawImage(img, 0, y, maxW, h);
          y += h + pad;
        }
        setStitched(true);
        setError("");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err && err.message ? err.message : "长图拼接失败");
      });
    return () => { cancelled = true; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const onDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas || !stitched) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "detail-studio-stitch.png";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, "image/png");
  };

  if (images.length === 0) return null;

  return (
    <div className="dsStitchPreview">
      <div className="dsStitchHead">
        <span className="dsStitchTitle">拼图预览（纵向长图 · {images.length} 屏）</span>
        <Button size="sm" tone="primary" icon={<Download size={14} />} onClick={onDownload} disabled={!stitched}>
          下载长图
        </Button>
      </div>
      {error ? (
        <div className="detailStudioBanner detailStudioBannerError">{error}</div>
      ) : (
        <canvas ref={canvasRef} className="dsStitchCanvas" />
      )}
      <p className="dsStitchHint">客户端本地拼接，不占用服务器资源；仅拼接已成功出图的屏。</p>
    </div>
  );
}

export default StitchPreview;
