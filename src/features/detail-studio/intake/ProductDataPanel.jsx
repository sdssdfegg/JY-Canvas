// src/features/detail-studio/intake/ProductDataPanel.jsx
// 阶段 2 §4：商品资料录入（商品身份与卖点），随当前项目落 project.productData。
//
// 只做录入 / 保存 / 展示；事实分级（已提供 / 合理推导 / 待补充 / 禁止虚构）留阶段 3。
// 组件零业务逻辑：本地维护字段行与描述，保存一律经 props.onSave → state.saveProductData → 服务端。

import { useEffect, useState } from "react";
import { Package } from "lucide-react";
import { Button } from "../../../shared/ui/Button.jsx";
import { Field } from "../../../shared/ui/Field.jsx";
import { ModuleHeader } from "../../../shared/ui/ModuleHeader.jsx";
import { Panel } from "../../../shared/ui/Panel.jsx";
import { Toolbar } from "../../../shared/ui/Toolbar.jsx";

export function ProductDataPanel({ state }) {
  const current = state.currentProject;
  const [rows, setRows] = useState([{ key: "", value: "" }]);
  const [text, setText] = useState("");

  // 打开 / 切换到另一个项目时，用已保存商品资料同步字段行与描述（避免 typing 期间被回写打断）。
  useEffect(() => {
    if (!current) return;
    const pd = current.productData || {};
    const fields = pd.fields && typeof pd.fields === "object" ? pd.fields : {};
    const entries = Object.entries(fields).map(([k, v]) => ({ key: k, value: String(v == null ? "" : v) }));
    setRows(entries.length ? entries : [{ key: "", value: "" }]);
    setText(pd.text || "");
    // 仅在项目切换时同步。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  function updateRow(index, field, value) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  }

  function addRow() {
    setRows((prev) => [...prev, { key: "", value: "" }]);
  }

  function removeRow(index) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSave() {
    const fields = {};
    for (const row of rows) {
      const k = row.key.trim();
      if (k) fields[k] = row.value;
    }
    await state.saveProductData({ fields, text });
  }

  return (
    <Panel className="detailStudioPanel">
      <ModuleHeader
        icon={<Package size={15} />}
        title="商品资料"
        subtitle="商品身份与卖点，随项目保存"
      />

      <div className="detailStudioFieldRows">
        {rows.map((row, i) => (
          <div className="detailStudioFieldRow" key={i}>
            <input
              className="detailStudioInput detailStudioFieldKey"
              value={row.key}
              placeholder="字段名（如：品牌 / 品类）"
              onChange={(event) => updateRow(i, "key", event.target.value)}
            />
            <input
              className="detailStudioInput"
              value={row.value}
              placeholder="字段值"
              onChange={(event) => updateRow(i, "value", event.target.value)}
            />
            <button
              type="button"
              className="detailStudioRowRemove"
              onClick={() => removeRow(i)}
              aria-label="删除字段"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <Toolbar align="start">
        <Button size="sm" tone="ghost" onClick={addRow}>
          <span>＋ 添加字段</span>
        </Button>
      </Toolbar>

      <Field label="商品描述 / 补充说明">
        <textarea
          className="detailStudioTextarea"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="商品定位、目标人群、使用场景、核心卖点等"
        />
      </Field>

      <Toolbar align="end">
        <Button size="sm" tone="primary" loading={state.busy} onClick={handleSave}>
          <span>保存商品资料</span>
        </Button>
      </Toolbar>

      <p className="detailStudioNote">
        商品资料与三类参考图（商品图 / 视觉风格 / 内容结构）共同构成生成依据；事实分级留阶段 3。
      </p>
    </Panel>
  );
}

export default ProductDataPanel;
