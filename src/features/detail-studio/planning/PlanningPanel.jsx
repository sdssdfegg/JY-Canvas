// src/features/detail-studio/planning/PlanningPanel.jsx
// 阶段 3 规划面板：商品分析展示 + A 模式 completeness>0.8 停追问 + 导演分屏 ScreenSpec[] 结构化审阅 + 编译冻结。
// 红线：本面板只调用 state 动作与 src/api/detail-studio.js，禁止 import planner / skill / 策划模块。
// 布局沿用 V201 §2 契约（右列版块内网格堆叠，不回退卡片墙）。

import { useState } from "react";
import { CheckCircle, Clapperboard, FileText, Sparkles } from "lucide-react";
import { Button } from "../../../shared/ui/Button.jsx";
import { ModuleHeader } from "../../../shared/ui/ModuleHeader.jsx";
import { Panel } from "../../../shared/ui/Panel.jsx";

const GRADE_LABELS = {
  user: "用户提供",
  visible: "图可见",
  inferred: "合理推断",
  unconfirmed: "待确认"
};

function FactChip({ fact }) {
  const grade = fact.grade || "unconfirmed";
  return (
    <span className={`dsFactChip dsFactChip--${grade}`}>
      <span className="dsFactChipKey">{fact.key}</span>
      <span className="dsFactChipValue">{fact.value}</span>
      <span className="dsFactChipGrade">{GRADE_LABELS[grade] || grade}</span>
    </span>
  );
}

function AnalyzeSection({ state, planning }) {
  const analyze = planning.analyze;
  const completeness = analyze ? Number(analyze.completeness || 0) : 0;
  const ready = completeness >= 0.8;
  return (
    <Panel>
      <ModuleHeader
        icon={<FileText size={16} />}
        title="① 商品分析"
        subtitle="事实分级 · 消费者逻辑 · 信息缺口"
        action={
          <Button size="sm" tone="primary" loading={state.busy} onClick={state.analyzeProject}>
            运行商品分析
          </Button>
        }
      />
      {!analyze ? (
        <p className="dsPlanHint">点击「运行商品分析」调用 1 次模型，输出结构化事实分级与购买逻辑。</p>
      ) : (
        <div className="dsPlanBody">
          <div className="dsCompleteness">
            <span className="dsCompletenessLabel">信息完整度</span>
            <span className="dsCompletenessValue">{Math.round(completeness * 100)}%</span>
            <span className={`dsCompletenessTag ${ready ? "isReady" : "isGap"}`}>
              {ready ? "可进入分屏" : "仍有缺口，建议补充"}
            </span>
          </div>

          <div className="dsField">
            <span className="dsFieldLabel">事实分级</span>
            <div className="dsFactList">
              {(analyze.facts || []).map((f, i) => <FactChip key={i} fact={f} />)}
              {(analyze.facts || []).length === 0 ? <span className="dsPlanHint">（无已确认事实）</span> : null}
            </div>
          </div>

          <div className="dsField">
            <span className="dsFieldLabel">目标人群</span>
            <span className="dsFieldText">{analyze.consumerLogic?.targetAudience || "（未明确）"}</span>
          </div>

          <div className="dsField">
            <span className="dsFieldLabel">核心卖点</span>
            <div className="dsTagList">
              {(analyze.sellingPoints || []).map((s, i) => <span key={i} className="dsTag">{s}</span>)}
            </div>
          </div>

          {!ready ? (
            <div className="dsGapBox">
              <span className="dsFieldLabel">信息缺口（A 模式引导补全）</span>
              <ul className="dsGapList">
                {(analyze.infoGaps || []).map((g, i) => (
                  <li key={i}><b>{g.field}</b>：{g.why}</li>
                ))}
                {(analyze.infoGaps || []).length === 0 ? <li>暂无明确缺口，但完整度偏低，可补充商品描述。</li> : null}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </Panel>
  );
}

function ScreenCard({ screen }) {
  const composition = screen.composition || {};
  const copy = screen.copy || {};
  return (
    <div className="dsScreenCard">
      <div className="dsScreenCardHead">
        <span className="dsScreenIndex">#{screen.index + 1}</span>
        <span className="dsScreenRole">{screen.role}</span>
        <span className="dsScreenModule">{screen.moduleName}</span>
      </div>
      <p className="dsScreenGoal">{screen.goal || "（无目标描述）"}</p>
      <div className="dsScreenMeta">
        <span><b>构图</b>：{composition.layout || "（无）"}</span>
        <span><b>视觉占比</b>：{composition.visualWeight ?? 0.6}</span>
        <span><b>参考图</b>：{composition.referenceNeed || "product"}</span>
      </div>
      <div className="dsScreenCopy">
        <span><b>主文案</b>：{copy.headline || "（无）"}</span>
        <span><b>副文案</b>：{copy.subcopy || "（无）"}</span>
      </div>
      {copy.tags && copy.tags.length ? (
        <div className="dsTagList">{copy.tags.map((t, i) => <span key={i} className="dsTag">{t}</span>)}</div>
      ) : null}
      <div className="dsFactList">
        {(screen.productFacts || []).map((f, i) => <FactChip key={i} fact={f} />)}
      </div>
    </div>
  );
}

function DirectorSection({ state, planning }) {
  const screens = planning.screens || [];
  return (
    <Panel>
      <ModuleHeader
        icon={<Clapperboard size={16} />}
        title="② 导演分屏"
        subtitle={`结构化 ScreenSpec · ${screens.length} 屏`}
        action={
          <Button size="sm" tone="primary" loading={state.busy} disabled={!planning.analyze} onClick={state.directorProject}>
            生成分屏方案
          </Button>
        }
      />
      {!screens.length ? (
        <p className="dsPlanHint">先完成商品分析，再生成分屏方案（1 次模型调用，产出结构化屏数组）。</p>
      ) : (
        <div className="dsScreenList">
          {screens.map((s) => <ScreenCard key={s.id} screen={s} />)}
        </div>
      )}
    </Panel>
  );
}

function FreezeSection({ state, planning }) {
  const [compiled, setCompiled] = useState({});
  const frozen = planning.frozenPrompts || {};
  const screens = planning.screens || [];
  const hasFrozen = Object.keys(frozen).length > 0;

  const handleCompile = async () => {
    const res = await state.compilePrompts();
    if (res && res.frozenPrompts) setCompiled(res.frozenPrompts);
  };
  const handleFreeze = async () => {
    const res = await state.freezePrompts();
    if (res && res.frozenPrompts) setCompiled(res.frozenPrompts);
  };

  return (
    <Panel>
      <ModuleHeader
        icon={<Sparkles size={16} />}
        title="③ 提示词冻结"
        subtitle="确定性编译 · 用户确认后冻结"
        action={
          <>
            <Button size="sm" onClick={handleCompile} loading={state.busy} disabled={!screens.length}>
              编译提示词
            </Button>
            <Button size="sm" tone="primary" onClick={handleFreeze} loading={state.busy} disabled={!screens.length}>
              冻结提示词
            </Button>
          </>
        }
      />
      {!screens.length ? (
        <p className="dsPlanHint">尚无分屏方案，无法编译。</p>
      ) : (
        <>
          <p className="dsPlanHint">
            编译为确定性纯函数（零模型调用）：你在此看到的提示词 == 生成端实际发送 == 落库冻结值。
          </p>
          <div className="dsCompileList">
            {screens.map((s) => {
              const prompt = (compiled[s.id] || frozen[s.id] || "").trim();
              return (
                <div key={s.id} className="dsCompileBox">
                  <span className="dsCompileTitle">#{s.index + 1} {s.role} · {s.moduleName}</span>
                  <textarea className="dsCompileText" readOnly value={prompt} rows={Math.max(3, Math.ceil(prompt.length / 60))} />
                </div>
              );
            })}
          </div>
          {hasFrozen ? <p className="dsPlanReady">✓ 已冻结 {Object.keys(frozen).length} 屏提示词，生成时仅使用此版本。</p> : null}
        </>
      )}
    </Panel>
  );
}

function QualitySection({ state, planning }) {
  const report = state.qcReport;
  const screens = planning.screens || [];
  const CAT_LABELS = {
    fact: "商品事实",
    purchaseLogic: "购买逻辑",
    completeness: "内容完整性",
    visual: "视觉设计",
    prompt: "提示词",
    options: "用户选项"
  };
  const run = async () => { await state.qualityReview(); };

  return (
    <Panel>
      <ModuleHeader
        icon={<CheckCircle size={16} />}
        title="④ 质量审查"
        subtitle="六类检查 · 定向修正封顶"
        action={
          <Button size="sm" tone="primary" loading={state.busy} disabled={!screens.length} onClick={run}>
            运行质检
          </Button>
        }
      />
      {!screens.length ? (
        <p className="dsPlanHint">尚无分屏方案，无法质检。</p>
      ) : !report ? (
        <p className="dsPlanHint">
          运行质检：六类检查（商品事实 / 购买逻辑 / 内容完整性 / 视觉设计 / 提示词 / 用户选项），最多 1 次定向修正 + 再审查。
        </p>
      ) : (
        <div className="dsQcBody">
          <div className="dsQcSummary">
            <span className="dsQcCount">共 {report.findings ? report.findings.length : 0} 项</span>
            <span className="dsQcFixed">修正 {report.fixedCount || 0} 次</span>
            {report.needsHuman
              ? <span className="dsQcHuman">需人工确认</span>
              : <span className="dsQcOk">通过</span>}
          </div>
          <ul className="dsQcList">
            {(report.findings || []).map((f, i) => (
              <li key={i} className={`dsQcItem dsQcItem--${f.severity}`}>
                <span className="dsQcCat">{CAT_LABELS[f.category] || f.category}</span>
                <span className="dsQcMsg">{f.message}</span>
                {f.screenId ? <span className="dsQcScreen">{f.screenId}</span> : null}
              </li>
            ))}
            {(report.findings || []).length === 0 ? <li className="dsQcOk">未发现质量问题</li> : null}
          </ul>
        </div>
      )}
    </Panel>
  );
}

export function PlanningPanel({ state }) {
  const planning = (state.currentProject && state.currentProject.planning) || {};
  if (!state.currentProject) {
    return (
      <Panel>
        <ModuleHeader icon={<Sparkles size={16} />} title="方案规划" subtitle="请先选择或新建项目" />
      </Panel>
    );
  }
  return (
    <div className="dsPlanColumn">
      <AnalyzeSection state={state} planning={planning} />
      <DirectorSection state={state} planning={planning} />
      <FreezeSection state={state} planning={planning} />
      <QualitySection state={state} planning={planning} />
    </div>
  );
}

export default PlanningPanel;
