// src/features/detail-studio/intake/mode-c/DirectPromptPanel.jsx
// 阶段 2 §3 模式 C（完整提示词直接生成）四份边界录入。
//
// 四条边界（见执行单 §3，与 server/features/detail-studio/intake/mode-c.js 同源）：
//   - rawPrompt    只读：首次粘贴的完整提示词，落库后不可再改（store 侧 sanitizeModeC 保持不覆盖）。
//   - tidyVersion  可选，默认关闭：对 rawPrompt 做确定性排版归一得到的「整理版」，生成可二选一。
//   - diff         可看可改：rawPrompt 与 tidyVersion 的行级差异，供用户核对整理结果。
//   - frozenPrompt 仅用户确认后写入：生成只认这一份，保证「所见即所生成」。
//
// 红线：本面板禁止 import 任何 planner / skill / 策划模块；整理只调服务端纯函数 parse 端点，不做语义改写。

import { useEffect, useState } from "react";
import { Lock, CheckSquare } from "lucide-react";
import { Button } from "../../../../shared/ui/Button.jsx";
import { Field } from "../../../../shared/ui/Field.jsx";
import { ModuleHeader } from "../../../../shared/ui/ModuleHeader.jsx";
import { Panel } from "../../../../shared/ui/Panel.jsx";
import { Toolbar } from "../../../../shared/ui/Toolbar.jsx";

export function DirectPromptPanel({ state }) {
  const current = state.currentProject || {};
  const modeC = current.modeC || {};
  const savedRaw = String(modeC.rawPrompt || "");
  const frozen = String(modeC.frozenPrompt || "");

  const [rawDraft, setRawDraft] = useState(savedRaw);
  const [tidyEnabled, setTidyEnabled] = useState(false);
  const [tidyText, setTidyText] = useState("");

  // 切换项目时重置本地录入态（rawPrompt 已落库则锁定，不再回退）。
  useEffect(() => {
    setRawDraft(savedRaw);
    setTidyEnabled(false);
    setTidyText("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current.id]);

  const parse = state.modeCParse && state.modeCParse.ok !== false ? state.modeCParse : null;
  const diff = parse && parse.diff ? parse.diff : null;
  const rawLocked = savedRaw.trim().length > 0;

  async function handleSaveRaw() {
    const text = rawDraft.trim();
    if (!text) return;
    const project = await state.saveModeCRawPrompt(text);
    if (project && project.modeC) setRawDraft(project.modeC.rawPrompt);
  }

  async function handleParse() {
    const res = await state.parseModeC(savedRaw);
    if (res && res.tidyVersion != null) setTidyText(res.tidyVersion);
  }

  function activePrompt() {
    if (tidyEnabled && tidyText.trim()) return tidyText;
    return savedRaw;
  }

  async function handleFreeze() {
    const text = activePrompt();
    if (!text.trim()) return;
    await state.freezeModeC(text);
  }

  return (
    <Panel className="detailStudioPanel">
      <ModuleHeader
        icon={<CheckSquare size={15} />}
        title="C · 完整提示词直接生成"
        subtitle="只识别边界、切分屏幕、组织生成任务，不擅自增加营销内容"
      />

      {/* 边界一：rawPrompt 只读 */}
      <Field label="原始提示词（粘贴后落库即只读，不可再改）">
        {rawLocked ? (
          <div className="detailStudioRawLocked">
            <pre className="detailStudioRawText">{savedRaw}</pre>
            <span className="detailStudioRawBadge"><Lock size={12} /> 已保存（只读）</span>
          </div>
        ) : (
          <textarea
            className="detailStudioTextarea detailStudioRawInput"
            value={rawDraft}
            placeholder="粘贴你的完整详情生成提示词（一屏一镜、空行分隔或序号标记均可）"
            onChange={(event) => setRawDraft(event.target.value)}
          />
        )}
      </Field>
      {!rawLocked ? (
        <Toolbar align="end">
          <Button size="sm" tone="primary" loading={state.busy} disabled={!rawDraft.trim()} onClick={handleSaveRaw}>
            <span>保存原始提示词</span>
          </Button>
        </Toolbar>
      ) : null}

      {/* 边界二 + 三：tidyVersion 可选（默认关闭）+ diff 可看可改 + screens 结构识别 */}
      {rawLocked ? (
        <div className="detailStudioModeCTidy">
          {/* 阶段 2 解析范畴：整理版 + 屏结构识别（不调 AI、不改原文），一次点击即出 screens */}
          <Toolbar align="start">
            <Button size="sm" tone="ghost" loading={state.busy} onClick={handleParse}>
              <span>生成整理版并识别屏结构</span>
            </Button>
          </Toolbar>

          {/* 屏结构：按空行 / 序号 / /// 屏 N 约定切出 screens[]，展示结构差异 */}
          {parse && Array.isArray(parse.screens) ? (
            <div className="detailStudioScreens">
              <div className="detailStudioScreensHead">屏结构识别（按空行 / 序号 / /// 屏 N 约定切分，原文不改）</div>
              <div className="detailStudioScreensList">
                {parse.screens.map((screen) => (
                  <div className="detailStudioScreenChip" key={screen.index}>
                    <span className="detailStudioScreenIndex">屏 {screen.index}</span>
                    {screen.title ? <span className="detailStudioScreenTitle">{screen.title}</span> : null}
                    <span className="detailStudioScreenLines">{screen.lines.length} 行</span>
                  </div>
                ))}
              </div>
              {parse.structure ? (
                tidyEnabled && parse.structure.boundaryShift ? (
                  <p className="detailStudioScreenWarn">
                    注意：整理版合并空行后屏边界变化 —— 原文切 {parse.structure.rawScreenCount} 屏，整理版切 {parse.structure.tidyScreenCount} 屏。若以整理版生成请留意此差异。
                  </p>
                ) : tidyEnabled ? (
                  <p className="detailStudioScreenNote">屏结构一致：原文与整理版均切 {parse.structure.rawScreenCount} 屏。</p>
                ) : (
                  <p className="detailStudioScreenNote">已识别 {parse.structure.rawScreenCount} 屏（启用整理版可对比边界变化）。</p>
                )
              ) : null}
            </div>
          ) : null}

          {diff ? (
            <div className="detailStudioDiff">
              <div className="detailStudioDiffHead">
                行级差异（equal {diff.summary.equal} · add {diff.summary.add} · remove {diff.summary.remove}）
              </div>
              <div className="detailStudioDiffBody">
                {diff.lines.map((line, idx) => (
                  <div className={"detailStudioDiffLine detailStudioDiff_" + line.type} key={idx}>
                    <span className="detailStudioDiffSign">
                      {line.type === "add" ? "+" : line.type === "remove" ? "-" : " "}
                    </span>
                    <span className="detailStudioDiffText">
                      {line.type === "remove" ? line.raw : line.tidy}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* 整理版可选编辑（默认关闭，用于生成二选一） */}
          <label className="detailStudioToggle">
            <input
              type="checkbox"
              checked={tidyEnabled}
              disabled={state.busy}
              onChange={(event) => setTidyEnabled(event.target.checked)}
            />
            <span>启用整理版用于生成（确定性排版归一，默认关闭）</span>
          </label>
          {tidyEnabled ? (
            <Field label="整理版（可编辑，与原始提示词二选一用于生成）">
              <textarea
                className="detailStudioTextarea"
                value={tidyText}
                placeholder="点击「生成整理版并识别屏结构」后在此呈现，可手动微调"
                onChange={(event) => setTidyText(event.target.value)}
              />
            </Field>
          ) : null}
        </div>
      ) : null}

      {/* 边界四：frozenPrompt 仅确认后写入 */}
      {rawLocked ? (
        <div className="detailStudioModeCFreeze">
          <Toolbar align="end">
            <Button size="sm" tone="primary" loading={state.busy} onClick={handleFreeze}>
              <span>{frozen ? "重新冻结用于生成" : "冻结并用于生成"}</span>
            </Button>
          </Toolbar>
          {frozen ? (
            <div className="detailStudioFrozen">
              <span className="detailStudioFrozenBadge"><Lock size={12} /> 已冻结，生成时仅使用此版本</span>
              <pre className="detailStudioFrozenText">{frozen}</pre>
            </div>
          ) : (
            <p className="detailStudioNote">尚未冻结：生成前请确认「当前将用于生成」的版本（整理版优先于原始提示词）。</p>
          )}
        </div>
      ) : null}

      <p className="detailStudioModeNote">
        模式 C 严守四份边界：原始提示词只读、整理版可选、差异可核对、冻结仅在你确认后写入。生成阶段将只读取 frozenPrompt。
      </p>
    </Panel>
  );
}

export default DirectPromptPanel;
