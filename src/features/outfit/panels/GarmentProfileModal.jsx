// 服装档案管理模态（P2-2）：独立组件，内部用共享 <Modal> 外壳。
//
// 纪律（执行单 §3.1/§3.2/§4.3）：
//   - 本文件是**唯一**承载服装档案 UI 的组件；outfit-workflow.jsx 只允许挂载
//     <GarmentProfileModal/>（组件引用），不得在本文件写 <Modal> 字面量（modal-shell 硬计数）。
//   - 只调 src/api/garment-profile.js（绝不在组件里裸 fetch，api-layering 门禁）。
//   - 所有错误经 notify(title, detail)（= 调用方下发的 addEvent）回显，不抛裸错。
//   - 「关联」选择态只存本组件 state，绝不进入任何生成请求 / 提示词（执行单 §1.2 红线）。
//   - 不新建含 hex 的 .css（hardcoded-color 门禁）；复用共享 UI 类。
import { useCallback, useEffect, useState } from "react";
import { Shirt, Plus, Pencil, Eye, Check, X, Link2, RefreshCw } from "lucide-react";
import { Button } from "../../../shared/ui/Button";
import { Modal } from "../../../shared/ui/Modal";
import { Panel } from "../../../shared/ui/Panel";
import { Field } from "../../../shared/ui/Field";
import { ModuleHeader } from "../../../shared/ui/ModuleHeader";
import {
  listGarmentProfiles,
  getGarmentProfile,
  createGarmentProfile,
  reviseGarmentProfile,
  setApprovedBaseline,
  uploadGarmentAsset
} from "../../../api/garment-profile.js";

// value 保持英文契约值（与 VALID_STATUS / CREATABLE_FIELDS 对齐），label 仅用于界面显示。
const STATUS_OPTIONS = [["draft", "草稿"], ["confirmed", "已确认"], ["archived", "已归档"]];
const FIT_OPTIONS = [["unknown", "未知"], ["fitted", "修身"], ["regular", "常规"], ["loose", "宽松"], ["oversized", "廓形"]];

function garmentOptionLabel(options, value) { // 未知枚举兜底显示原值，避免空白
  const hit = options.find(([v]) => v === value);
  return hit ? hit[1] : value;
}

// 服务端英文 Error 原样保留（4xx 判定依赖英文子串），仅在展示层本地映射；未知错误保留原文便于排查。
function zhGarmentError(message) {
  if (!message) return "";
  const pairs = [
    ["path traversal not allowed", "参考图 ID 含非法字符"],
    ["profile already exists", "该档案 ID 已存在，请换一个"],
    ["profile not found", "服装档案不存在"],
    ["invalid garment_profile_id", "档案 ID 不合法"],
    ["invalid asset_id", "参考图 ID 不合法"],
    ["requires a non-empty assetId", "请填写基准资产 ID"],
    ["缺少 assetId", "请填写基准资产 ID"]
  ];
  const hit = pairs.find(([needle]) => message.includes(needle));
  return hit ? hit[1] : message;
}

// 仅当 L/a/b 三项都填了才构造 solid color_profile，否则留空（由数据层默认）。
function buildColor(form) {
  const L = parseFloat(form.colorL);
  const a = parseFloat(form.colorA);
  const b = parseFloat(form.colorB);
  if (Number.isNaN(L) || Number.isNaN(a) || Number.isNaN(b)) return null;
  return { mode: "solid", lab: { L, a, b }, algorithmVersion: "v1", confidence: 0.9 };
}

function emptyForm() {
  return {
    garment_profile_id: "",
    status: "draft",
    notes: "",
    colorL: "",
    colorA: "",
    colorB: "",
    fitType: "unknown"
  };
}

export function GarmentProfileModal({ isOpen, onClose, addEvent }) {
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState(emptyForm());
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null); // { id, form }
  const [snapshot, setSnapshot] = useState(null); // 只读快照 profile
  const [baselineTarget, setBaselineTarget] = useState(null); // { id, assetId }
  const [uploading, setUploading] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [linked, setLinked] = useState(null); // { id, version } 仅界面状态

  const notify = (title, detail) => {
    if (typeof addEvent === "function") addEvent(title, detail);
  };

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await listGarmentProfiles();
      setProfiles(Array.isArray(data.profiles) ? data.profiles : []);
    } catch (err) {
      const msg = err && err.message ? zhGarmentError(err.message) : "读取列表失败";
      setError(msg);
      if (typeof addEvent === "function") addEvent("服装档案", msg);
    } finally {
      setLoading(false);
    }
  }, [addEvent]);

  useEffect(() => {
    if (isOpen) {
      setSnapshot(null);
      setEditing(null);
      setBaselineTarget(null);
      void refresh();
    }
  }, [isOpen, refresh]);

  if (!isOpen) return null;

  async function handleCreate() {
    setCreating(true);
    setError("");
    try {
      const body = {};
      if (form.garment_profile_id.trim()) body.garment_profile_id = form.garment_profile_id.trim();
      if (form.status) body.status = form.status;
      if (form.notes.trim()) body.notes = form.notes.trim();
      const color = buildColor(form);
      if (color) body.color_profile = color;
      if (form.fitType && form.fitType !== "unknown") {
        body.fit_type = { value: form.fitType, autoDetected: false, humanCorrected: true, correctedBy: "user", correctedAt: new Date().toISOString() };
      }
      await createGarmentProfile(body);
      notify("服装档案", `已创建档案 ${body.garment_profile_id || "(自动 ID)"}`);
      setForm(emptyForm());
      await refresh();
    } catch (err) {
      const msg = err && err.message ? zhGarmentError(err.message) : "创建失败";
      setError(msg);
      notify("服装档案创建失败", msg);
    } finally {
      setCreating(false);
    }
  }

  async function handleRevise() {
    if (!editing) return;
    setCreating(true);
    setError("");
    try {
      const patch = {};
      if (editing.form.notes.trim()) patch.notes = editing.form.notes.trim();
      const color = buildColor(editing.form);
      if (color) patch.color_profile = color;
      if (editing.form.fitType && editing.form.fitType !== "unknown") {
        patch.fit_type = { value: editing.form.fitType, autoDetected: false, humanCorrected: true, correctedBy: "user", correctedAt: new Date().toISOString() };
      }
      await reviseGarmentProfile(editing.id, patch);
      notify("服装档案", `已改版 ${editing.id}`);
      setEditing(null);
      await refresh();
    } catch (err) {
      const msg = err && err.message ? zhGarmentError(err.message) : "改版失败";
      setError(msg);
      notify("服装档案改版失败", msg);
    } finally {
      setCreating(false);
    }
  }

  async function handleViewSnapshot(id, version) {
    setError("");
    try {
      const data = await getGarmentProfile(id, version);
      setSnapshot(data.profile);
    } catch (err) {
      const msg = err && err.message ? zhGarmentError(err.message) : "读取快照失败";
      setError(msg);
      notify("服装档案读取失败", msg);
    }
  }

  async function handleSetBaseline() {
    if (!baselineTarget) return;
    setError("");
    try {
      await setApprovedBaseline(baselineTarget.id, baselineTarget.assetId.trim());
      notify("服装档案", `已确认基准 ${baselineTarget.id}`);
      setBaselineTarget(null);
      await refresh();
    } catch (err) {
      const msg = err && err.message ? zhGarmentError(err.message) : "设置基准失败";
      setError(msg);
      notify("基准设置失败", msg);
    }
  }

  async function handleUpload(id) {
    if (!uploadFile) return;
    setUploading(true);
    setError("");
    try {
      await uploadGarmentAsset(id, uploadFile, uploadFile.name ? uploadFile.name.replace(/\.[^.]+$/, "") : undefined);
      notify("服装档案", `已上传参考图 ${id}`);
      setUploadFile(null);
      await refresh();
    } catch (err) {
      const msg = err && err.message ? zhGarmentError(err.message) : "上传失败";
      setError(msg);
      notify("参考图上传失败", msg);
    } finally {
      setUploading(false);
    }
  }

  function openEdit(profile) {
    setEditing({
      id: profile.garment_profile_id,
      form: {
        ...emptyForm(),
        notes: profile.notes || "",
        fitType: profile.fit_type && profile.fit_type.value ? profile.fit_type.value : "unknown",
        colorL: profile.color_profile && profile.color_profile.lab ? String(profile.color_profile.lab.L) : "",
        colorA: profile.color_profile && profile.color_profile.lab ? String(profile.color_profile.lab.a) : "",
        colorB: profile.color_profile && profile.color_profile.lab ? String(profile.color_profile.lab.b) : ""
      }
    });
  }

  return (
    <Modal layerClassName="modalLayer garmentProfileLayer" panelClassName="garmentProfileModal" onClose={onClose}>
      <header>
        <div>
          <h2>服装档案</h2>
          <span>同款衣服跨模特 / 跨批次复用一份标准约束</span>
        </div>
        <Button size="md" iconOnly aria-label="关闭" onClick={onClose}>
          <X size={16} />
        </Button>
      </header>

      <div className="garmentProfileBody">
        {error && <p className="garmentProfileError">{error}</p>}

        {/* 新建表单 */}
        <Panel>
          <ModuleHeader icon={<Plus size={15} />} title="新建档案" />
          <div className="garmentProfileForm">
            <Field label="档案 ID（留空自动生成）">
              <input
                value={form.garment_profile_id}
                onChange={(e) => setForm((f) => ({ ...f, garment_profile_id: e.target.value }))}
                placeholder="如 夏季T恤-001"
              />
            </Field>
            <Field label="状态">
              <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
                {STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Field>
            <Field label="备注">
              <input
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="如 主推款 / 夏季新色"
              />
            </Field>
            <Field label="颜色 L / a / b（可选）">
              <div className="garmentProfileLab">
                <input value={form.colorL} onChange={(e) => setForm((f) => ({ ...f, colorL: e.target.value }))} placeholder="L" inputMode="decimal" />
                <input value={form.colorA} onChange={(e) => setForm((f) => ({ ...f, colorA: e.target.value }))} placeholder="a" inputMode="decimal" />
                <input value={form.colorB} onChange={(e) => setForm((f) => ({ ...f, colorB: e.target.value }))} placeholder="b" inputMode="decimal" />
              </div>
            </Field>
            <Field label="版型">
              <select value={form.fitType} onChange={(e) => setForm((f) => ({ ...f, fitType: e.target.value }))}>
                {FIT_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Field>
            <div className="garmentProfileFormActions">
              <Button size="md" tone="primary" loading={creating} disabled={creating} onClick={() => void handleCreate()}>
                <Plus size={15} />
                <span>创建</span>
              </Button>
            </div>
          </div>
        </Panel>

        {/* 列表 */}
        <Panel>
          <ModuleHeader
            icon={<Shirt size={15} />}
            title="档案列表"
            action={<Button size="sm" onClick={() => void refresh()}><RefreshCw size={13} /><span>刷新</span></Button>}
          />
          {loading && <p className="garmentProfileHint">读取中…</p>}
          {!loading && profiles.length === 0 && (
            <p className="garmentProfileEmpty">还没有档案，先在上方创建一个。</p>
          )}
          <ul className="garmentProfileList">
            {profiles.map((p) => (
              <li key={p.id} className={`garmentProfileItem${linked && linked.id === p.id ? " isLinked" : ""}`}>
                <div className="garmentProfileItemMain">
                  <strong>{p.id}</strong>
                  <span className="garmentProfileMeta">v{p.version} · {garmentOptionLabel(STATUS_OPTIONS, p.status)}</span>
                  {p.approved_baseline_asset_id && (
                    <span className="garmentProfileBaseline">基准 {p.approved_baseline_asset_id}</span>
                  )}
                  <span className="garmentProfileMeta">参考图 {p.reference_asset_count || 0}</span>
                </div>
                <div className="garmentProfileItemActions">
                  <Button size="sm" onClick={() => void handleViewSnapshot(p.id)}><Eye size={13} /><span>快照</span></Button>
                  <Button size="sm" onClick={() => openEdit(p)}><Pencil size={13} /><span>改版</span></Button>
                  <Button size="sm" onClick={() => setBaselineTarget({ id: p.id, assetId: "" })}><Check size={13} /><span>基准</span></Button>
                  <Button
                    size="sm"
                    tone={linked && linked.id === p.id ? "primary" : "default"}
                    onClick={() => setLinked({ id: p.id, version: p.version })}
                  >
                    <Link2 size={13} />
                    <span>{linked && linked.id === p.id ? "已关联" : "关联"}</span>
                  </Button>
                </div>
                <div className="garmentProfileUpload">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const f = e.target.files && e.target.files[0];
                      if (f) void (async () => { setUploadFile(f); await handleUpload(p.id); })();
                    }}
                  />
                  {uploading && <span className="garmentProfileHint">上传中…</span>}
                </div>
              </li>
            ))}
          </ul>
        </Panel>

        {/* 改版子视图 */}
        {editing && (
          <Panel>
            <ModuleHeader icon={<Pencil size={15} />} title={`改版 ${editing.id}`} />
            <div className="garmentProfileForm">
              <Field label="备注">
                <input
                  value={editing.form.notes}
                  onChange={(e) => setEditing((s) => ({ ...s, form: { ...s.form, notes: e.target.value } }))}
                  placeholder="改版备注"
                />
              </Field>
              <Field label="颜色 L / a / b（可选）">
                <div className="garmentProfileLab">
                  <input value={editing.form.colorL} onChange={(e) => setEditing((s) => ({ ...s, form: { ...s.form, colorL: e.target.value } }))} placeholder="L" inputMode="decimal" />
                  <input value={editing.form.colorA} onChange={(e) => setEditing((s) => ({ ...s, form: { ...s.form, colorA: e.target.value } }))} placeholder="a" inputMode="decimal" />
                  <input value={editing.form.colorB} onChange={(e) => setEditing((s) => ({ ...s, form: { ...s.form, colorB: e.target.value } }))} placeholder="b" inputMode="decimal" />
                </div>
              </Field>
              <Field label="版型">
                <select value={editing.form.fitType} onChange={(e) => setEditing((s) => ({ ...s, form: { ...s.form, fitType: e.target.value } }))}>
                  {FIT_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </Field>
              <div className="garmentProfileFormActions">
                <Button size="md" onClick={() => setEditing(null)}>取消</Button>
                <Button size="md" tone="primary" loading={creating} disabled={creating} onClick={() => void handleRevise()}>保存改版</Button>
              </div>
            </div>
          </Panel>
        )}

        {/* 基准子视图 */}
        {baselineTarget && (
          <Panel>
            <ModuleHeader icon={<Check size={15} />} title={`确认基准 ${baselineTarget.id}`} />
            <Field label="基准资产 ID（asset_id）">
              <input
                value={baselineTarget.assetId}
                onChange={(e) => setBaselineTarget((s) => ({ ...s, assetId: e.target.value }))}
                placeholder="如 标准参考图-001"
              />
            </Field>
            <div className="garmentProfileFormActions">
              <Button size="md" onClick={() => setBaselineTarget(null)}>取消</Button>
              <Button size="md" tone="primary" disabled={!baselineTarget.assetId.trim()} onClick={() => void handleSetBaseline()}>确认基准</Button>
            </div>
          </Panel>
        )}

        {/* 快照只读视图 */}
        {snapshot && (
          <Panel>
            <ModuleHeader
              icon={<Eye size={15} />}
              title={`快照 ${snapshot.garment_profile_id} v${snapshot.version}`}
              action={<Button size="sm" onClick={() => setSnapshot(null)}>返回</Button>}
            />
            <pre className="garmentProfileSnapshot">{JSON.stringify(snapshot, null, 2)}</pre>
          </Panel>
        )}
      </div>
    </Modal>
  );
}
