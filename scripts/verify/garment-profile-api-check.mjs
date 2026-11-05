// 服装档案 API 路由级验收（P2-2）：起最小 express 实例、只挂本路由，用真实 HTTP 打进去。
//
// 为什么单独有它：garment-profile-check.mjs 只验数据层函数；本脚本验「路由真的挂上了 +
// 响应字段对不对 + 拒绝口径对不对」那一层（与 ai-canvas-agent-route-check 同款定位）。
//
// 数据隔离（纪律，照 garment-profile-check / ai-canvas-agent-route-check）：
//   路由会写 data/ai-tryon/garments，必须在 import 之前把 JINGYIN_RELEASE_ROOT 指到临时沙盒，
//   结束后 rmSync 沙盒，并断言真实 data 未被创建。
import { mkdtempSync, rmSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";

const sandbox = mkdtempSync(path.join(tmpdir(), "garment-profile-api-"));
process.env.JINGYIN_RELEASE_ROOT = sandbox;

const express = (await import("express")).default;
const { registerGarmentProfileRoutes } = await import("../../server/routes/garment-profile.routes.js");
const { aiTryonGarmentsDir } = await import("../../server/core/app-paths.js");

const results = [];
function check(name, pass, detail = "") {
  results.push({ name, pass: Boolean(pass), detail: String(detail) });
  console.log(`  ${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}

const app = express();
app.use(express.json({ limit: "10mb" }));
registerGarmentProfileRoutes(app);

const server = app.listen(0);
await new Promise((resolve) => server.once("listening", resolve));
const port = server.address().port;
const origin = `http://127.0.0.1:${port}`;

async function call(method, urlPath, body, isForm) {
  const init = { method, headers: {} };
  if (isForm) {
    init.body = body; // FormData
  } else if (body !== undefined) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const response = await fetch(`${origin}${urlPath}`, init);
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: response.status, json };
}

const E = (err) => (err && err.message ? err.message : String(err));

try {
  // 1) 列表初始为空
  const list0 = await call("GET", "/api/garment-profiles");
  check("GET 列表初始为空数组",
    list0.status === 200 && list0.json.ok === true && Array.isArray(list0.json.profiles) && list0.json.profiles.length === 0,
    `len=${list0.json.profiles ? list0.json.profiles.length : "?"}`);

  // 2) 创建
  const created = await call("POST", "/api/garment-profiles", {
    garment_profile_id: "sku-tee-001",
    status: "draft",
    notes: "测试档案",
    fit_type: { value: "regular", autoDetected: true, humanCorrected: false, correctedBy: null, correctedAt: null }
  });
  check("POST 创建返回 ok=true + profile",
    created.status === 200 && created.json.ok === true && created.json.profile && created.json.profile.garment_profile_id === "sku-tee-001",
    `status=${created.status}`);
  check("创建 version=1 / status=draft",
    created.json.profile.version === 1 && created.json.profile.status === "draft",
    `v=${created.json.profile.version} status=${created.json.profile.status}`);

  // 3) 详情读取
  const detail = await call("GET", "/api/garment-profiles/sku-tee-001");
  check("GET 详情命中",
    detail.status === 200 && detail.json.ok === true && detail.json.profile.notes === "测试档案",
    `notes=${detail.json.profile && detail.json.profile.notes}`);

  // 4) 改版 → v2
  const revised = await call("POST", "/api/garment-profiles/sku-tee-001/revision", { notes: "改版备注" });
  check("POST 改版 version=2",
    revised.status === 200 && revised.json.ok === true && revised.json.profile.version === 2 && revised.json.profile.notes === "改版备注",
    `v=${revised.json.profile.version}`);

  // 5) 旧版本快照逐字不变
  const v1 = await call("GET", "/api/garment-profiles/sku-tee-001?version=1");
  check("GET version=1 快照仍为旧备注（逐字不变）",
    v1.status === 200 && v1.json.ok === true && v1.json.profile.version === 1 && v1.json.profile.notes === "测试档案",
    `v1.notes=${v1.json.profile && v1.json.profile.notes}`);

  // 6) 非法字段注入被白名单剥离（approved_baseline_asset_id / version 不接受）
  const injected = await call("POST", "/api/garment-profiles", {
    garment_profile_id: "sku-inject",
    approved_baseline_asset_id: "hacked",
    version: 99,
    notes: "注入测试"
  });
  check("POST 创建剥离非法系统字段（基线仍空 / version=1）",
    injected.status === 200 && injected.json.ok === true
      && injected.json.profile.approved_baseline_asset_id === null
      && injected.json.profile.version === 1,
    `baseline=${injected.json.profile.approved_baseline_asset_id} v=${injected.json.profile.version}`);

  // 7) 基准只能经 /baseline（且版本升版）
  const baseline = await call("POST", "/api/garment-profiles/sku-tee-001/baseline", { assetId: "ref-standard-001" });
  check("POST /baseline 设基准 + 升版",
    baseline.status === 200 && baseline.json.ok === true
      && baseline.json.profile.approved_baseline_asset_id === "ref-standard-001"
      && baseline.json.profile.version === 3,
    `baseline=${baseline.json.profile.approved_baseline_asset_id} v=${baseline.json.profile.version}`);
  // 改版带 approved_baseline_asset_id 应被剥离（不静默覆盖）
  const rev2 = await call("POST", "/api/garment-profiles/sku-tee-001/revision", { approved_baseline_asset_id: "hacked2" });
  check("改版注入基线被拒绝（基线不变）",
    rev2.status === 200 && rev2.json.ok === true && rev2.json.profile.approved_baseline_asset_id === "ref-standard-001",
    `baseline=${rev2.json.profile.approved_baseline_asset_id}`);
  // 缺 assetId → 400
  const noAsset = await call("POST", "/api/garment-profiles/sku-tee-001/baseline", {});
  check("POST /baseline 缺 assetId → 400",
    noAsset.status === 400 && noAsset.json.ok === false, `status=${noAsset.status}`);

  // 8) 上传参考图（multipart）
  const form = new FormData();
  form.append("file", new Blob([Buffer.from("fake-bytes")], { type: "image/png" }), "ref.png");
  form.append("asset_id", "ref-upload-1");
  const uploaded = await call("POST", "/api/garment-profiles/sku-tee-001/assets", form, true);
  check("POST /assets 上传返回 ok=true + asset_id",
    uploaded.status === 200 && uploaded.json.ok === true && typeof uploaded.json.asset_id === "string" && uploaded.json.asset_id.length > 0,
    `asset_id=${uploaded.json.asset_id}`);

  // 9) id 路径穿越拒绝
  const traverse = await call("GET", "/api/garment-profiles/a..b");
  check("GET 含 .. 的 id → 400 拒绝",
    traverse.status === 400 && traverse.json.ok === false, `status=${traverse.status}`);
  const slashId = await call("POST", "/api/garment-profiles", { garment_profile_id: "a/b" });
  check("POST 创建含 / 的 id → 400 拒绝",
    slashId.status === 400 && slashId.json.ok === false, `status=${slashId.status}`);

  // 10) 不存在 → 404
  const missing = await call("GET", "/api/garment-profiles/does-not-exist");
  check("GET 不存在档案 → 404",
    missing.status === 404 && missing.json.ok === false, `status=${missing.status}`);

  // 11) 🔴 无 DELETE 端点（任何 DELETE 都 404，证明删除接口不存在）
  const delAttempt = await call("DELETE", "/api/garment-profiles/sku-tee-001");
  check("DELETE 端点不存在（返回 404，无删除接口）",
    delAttempt.status === 404, `status=${delAttempt.status}`);
} catch (error) {
  check("脚本执行未抛异常", false, E(error));
}

server.close();

// 清理：双保险删除沙盒，并断言真实 data/ai-tryon/garments 未被创建。
rmSync(sandbox, { recursive: true, force: true });
const realRoot = path.resolve(process.cwd(), "data", "ai-tryon", "garments");
check("真实 data/ai-tryon/garments 未被创建/改动", !existsSync(realRoot), `意外存在：${realRoot}`);

const failed = results.filter((item) => !item.pass);
console.log(`\n[garment-profile-api-check] ${failed.length === 0 ? "全部通过" : `${failed.length} 项失败`}`);
if (failed.length > 0) {
  console.error(`失败项：\n- ${failed.map((i) => `${i.name} (${i.detail})`).join("\n- ")}`);
  process.exit(1);
}
console.log("✅ garment-profile-api-check 全部通过（6 端点 + 穿越拒绝 + 非法字段 + 快照 + 基准 + 无 DELETE）");
