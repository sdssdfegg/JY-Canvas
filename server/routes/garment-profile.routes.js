// 服装档案 API（P2-2）：薄封装 garment-profile-store，不写业务逻辑、不落盘新格式。
//
// 纪律（执行单 §3.1/§3.2 + 数据层红线）：
//   - 本文件是**唯一**允许 import 数据层的 routes 文件；server/index.js 与 server/app.js
//     只 import 本注册壳，绝不直接 import 数据层（见 garment-profile-check.mjs §9）。
//   - 🔴 不提供任何删除 / 清空 / 批量清理接口：用户资产红线，删除只能由用户显式触发。
//   - 所有 req.body 字段白名单校验（只收契约 §1 字段）；系统字段
//     （garment_profile_id / version / created_at / approved_baseline_asset_id）
//     不接受客户端直接指定，基准只能走 /baseline。
//   - id / asset_id 路径穿越**拒绝**（不只中和），防越界写。
//   - 错误统一 try/catch，不泄漏堆栈与绝对路径到前端。
import multer from "multer";
import { errorMessage, safeMessage } from "../core/route-helpers.js";
import {
  listGarmentProfiles,
  readGarmentProfile,
  createGarmentProfile,
  updateGarmentProfile,
  setApprovedBaseline,
  saveGarmentAsset
} from "../ai-tryon/garment-profile-store.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// 契约 §1 允许从客户端接收的字段（其余一律忽略，防注入系统字段）。
const CREATABLE_FIELDS = new Set([
  "garment_profile_id",
  "status",
  "color_profile",
  "fit_type",
  "garment_attributes",
  "reference_assets",
  "notes"
]);

// id 路径穿越拒绝（不只中和）：含 / \ .. 空字节或非 trim 即拒。
function assertSafeId(id) {
  const s = String(id == null ? "" : id);
  if (!s) throw new Error("invalid id");
  if (/[\\/]/.test(s) || /\.\./.test(s) || /\u0000/.test(s) || s !== s.trim()) {
    throw new Error("invalid id (path traversal not allowed)");
  }
  return s;
}

// 客户端可预期错误（数据层抛的）→ 4xx；其余（含未预期的）归 500。
const CLIENT_ERROR_HINTS = [
  "already exists",
  "not found",
  "invalid id",
  "invalid garment_profile_id",
  "invalid asset_id",
  "requires a non-empty"
];
function isClientError(error) {
  const msg = errorMessage(error);
  return CLIENT_ERROR_HINTS.some((hint) => msg.includes(hint));
}

function whitelist(body, allowed) {
  const out = {};
  for (const key of Object.keys(body || {})) {
    if (allowed.has(key)) out[key] = body[key];
  }
  return out;
}

export function registerGarmentProfileRoutes(app) {
  // GET /api/garment-profiles —— 列表（可按 status 过滤）
  app.get("/api/garment-profiles", async (req, res) => {
    try {
      const status = req.query.status;
      const profiles = await listGarmentProfiles(status ? { status } : {});
      res.json({ ok: true, profiles });
    } catch (error) {
      res.status(500).json({ ok: false, message: safeMessage(error) });
    }
  });

  // GET /api/garment-profiles/:id?version=n —— 详情（可带 version 读快照）
  app.get("/api/garment-profiles/:id", async (req, res) => {
    try {
      const id = assertSafeId(req.params.id);
      const rawVersion = req.query.version != null ? Number(req.query.version) : undefined;
      const version = Number.isFinite(rawVersion) ? rawVersion : undefined;
      const profile = await readGarmentProfile(id, version);
      if (!profile) return res.status(404).json({ ok: false, message: "服装档案不存在" });
      res.json({ ok: true, profile });
    } catch (error) {
      const status = /invalid id/.test(errorMessage(error)) ? 400 : 500;
      res.status(status).json({ ok: false, message: safeMessage(error) });
    }
  });

  // POST /api/garment-profiles —— 创建（version=1, status=draft）
  app.post("/api/garment-profiles", async (req, res) => {
    try {
      const body = whitelist(req.body || {}, CREATABLE_FIELDS);
      if (body.garment_profile_id) assertSafeId(body.garment_profile_id);
      const profile = await createGarmentProfile(body);
      res.json({ ok: true, profile });
    } catch (error) {
      const status = isClientError(error) ? 400 : 500;
      res.status(status).json({ ok: false, message: safeMessage(error) });
    }
  });

  // POST /api/garment-profiles/:id/revision —— 改版（生成 v<n+1>，旧版逐字不变）
  app.post("/api/garment-profiles/:id/revision", async (req, res) => {
    try {
      const id = assertSafeId(req.params.id);
      const patch = whitelist(req.body || {}, CREATABLE_FIELDS);
      const profile = await updateGarmentProfile(id, patch);
      res.json({ ok: true, profile });
    } catch (error) {
      const status = isClientError(error) ? 400 : 500;
      res.status(status).json({ ok: false, message: safeMessage(error) });
    }
  });

  // POST /api/garment-profiles/:id/baseline —— 确认基准资产（缺 assetId → 400）
  app.post("/api/garment-profiles/:id/baseline", async (req, res) => {
    try {
      const id = assertSafeId(req.params.id);
      const assetId = req.body && req.body.assetId;
      if (!assetId) return res.status(400).json({ ok: false, message: "缺少 assetId" });
      const profile = await setApprovedBaseline(id, String(assetId));
      res.json({ ok: true, profile });
    } catch (error) {
      const status = isClientError(error) ? 400 : 500;
      res.status(status).json({ ok: false, message: safeMessage(error) });
    }
  });

  // POST /api/garment-profiles/:id/assets —— 上传标准参考图（multipart，multer 内存存储）
  app.post("/api/garment-profiles/:id/assets", upload.single("file"), async (req, res) => {
    try {
      const id = assertSafeId(req.params.id);
      if (!req.file) return res.status(400).json({ ok: false, message: "缺少文件" });
      const assetId = req.body && req.body.asset_id ? String(req.body.asset_id) : undefined;
      const result = await saveGarmentAsset(id, req.file.buffer, req.file.mimetype, { asset_id: assetId });
      res.json({ ok: true, asset_id: result.asset_id, file: result.file });
    } catch (error) {
      const status = isClientError(error) ? 400 : 500;
      res.status(status).json({ ok: false, message: safeMessage(error) });
    }
  });
}
