import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { mimeTypeFromFile } from "./file-naming.js";
import { DOWNLOAD_CHUNK_BYTES } from "./runtime-config.js";

function parseByteRange(rangeHeader, size) {
  const raw = String(rangeHeader || "").trim();
  if (!raw) return null;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(raw);
  if (!match) return false;

  const [, startText, endText] = match;
  if (!startText && !endText) return false;

  let start;
  let end;
  if (!startText) {
    const suffixLength = Number.parseInt(endText, 10);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return false;
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = Number.parseInt(startText, 10);
    end = endText ? Number.parseInt(endText, 10) : size - 1;
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= size) {
    return false;
  }

  return { start, end: Math.min(end, size - 1) };
}

async function streamLocalImageFile(req, res, file, options = {}) {
  const info = await stat(file);
  if (!info.isFile()) throw new Error("not_file");

  const size = info.size;
  const range = parseByteRange(req.headers.range, size);
  const headers = {
    "Accept-Ranges": "bytes",
    "Content-Type": options.contentType || mimeTypeFromFile(file),
    "Cache-Control": options.cacheControl || "public, max-age=31536000, immutable"
  };

  if (range === false) {
    res.status(416)
      .set({
        ...headers,
        "Content-Range": `bytes */${size}`
      })
      .end();
    return;
  }

  if (size === 0) {
    res.status(200).set({ ...headers, "Content-Length": "0" }).end();
    return;
  }

  const start = range?.start ?? 0;
  const end = range?.end ?? size - 1;
  const contentLength = end - start + 1;
  res.status(range ? 206 : 200).set({
    ...headers,
    "Content-Length": String(contentLength),
    ...(range ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {})
  });

  await pipeline(createReadStream(file, { start, end, highWaterMark: DOWNLOAD_CHUNK_BYTES }), res);
}

export {
  parseByteRange,
  streamLocalImageFile
};
