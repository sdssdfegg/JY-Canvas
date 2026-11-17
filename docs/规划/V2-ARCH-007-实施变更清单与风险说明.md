# V2-ARCH-007 · 实施变更清单与风险说明（阶段 B–F 收口）

> 任务来源：V2-ARCH-001 任务书阶段 B–F 最终交付第 6 项。依据：`V2-ARCH-002~006`。
> 性质：**实施规划文档**，零业务代码改动。本文件把前五份设计落到"改哪些文件、什么顺序、什么风险"。
> 日期：2026-11-17　基准 HEAD：`ae786be`（本批文档提交后 HEAD 会前移，见 §7）。

---

## 0. 一句话现状

架构设计（B–F 六文档）已全部交付；**代码尚未实施**。本文件给出文件级变更清单、S2-C 重叠矩阵、统一排期、七项兼容风险落地、专业内容依赖与未完成项。任务书第八节明确：S2-C 可作第三/四层首批实现，但须先完成阶段 B 定义（✅ 已完成）并做重叠检查（见 §2），同一文件/核心数据结构并发修改由总控统一排期。

---

## 1. 阶段 B–F 交付物核对（任务书第十节）

| # | 要求文档 | 状态 | 路径 |
|---|---|---|---|
| — | 阶段 A（原有） | ✅ 已交付 | `V2-ARCH-001-现有架构映射与改造方案.md` |
| 1 | V2-ARCH-002 四层控制架构设计 | ✅ 已交付 | `docs/规划/V2-ARCH-002-四层控制架构设计.md` |
| 2 | V2-ARCH-003 数据契约与接口说明 | ✅ 已交付 | `docs/规划/V2-ARCH-003-数据契约与接口说明.md` |
| 3 | V2-ARCH-004 行业能力包接入规范 | ✅ 已交付 | `docs/规划/V2-ARCH-004-行业能力包接入规范.md` |
| 4 | V2-ARCH-005 任务准入与编译审计说明 | ✅ 已交付 | `docs/规划/V2-ARCH-005-任务准入与编译审计说明.md` |
| 5 | V2-ARCH-006 回归测试报告 | ✅ 已交付（分层，真实模型未跑） | `docs/规划/V2-ARCH-006-回归测试报告.md` |
| 6 | V2-ARCH-007 实施变更清单与风险 | ✅ 本文件 | `docs/规划/V2-ARCH-007-实施变更清单与风险说明.md` |

---

## 2. S2-C 与现有代码重叠矩阵（任务书第八节要求）

| 现有文件/结构 | S2-C 是否触碰 | 并发风险 | 处置 |
|---|---|---|---|
| `server/detail-middleware.js:602-624`（17 槽位） | ✅ 主改造点 | **高**（多批次都想改） | 总控统一排期，一个批次改完再开下一批 |
| `server/detail-middleware.js:91-112`（行业路由） | ✅ 改单一决策源 | 高（同文件） | 与上同批，不要分两个执行者 |
| `server/detail-middleware.js:148-210`（归一） | ✅ 扩字段 | 高（同文件） | 同上 |
| `server/detail-ai.js:24-50`（directive/映射） | ✅ 改三级口径说明 | 中 | 与 middleware 同批或紧邻，避免语义漂移 |
| `server/detail-ai.js:205-291`（outputSchema） | ✅ 扩字段 | 中 | 同上 |
| `prompts/server/detail-v2-planning/schemas/*.json` | ✅ 增字段 | 中 | 与 detail-ai outputSchema 同步 |
| `scripts/verify/detail-v2-planning-chain-check.mjs` 锚点（`:67-73`） | ⚠️ 只同步维护、强度不降 | 高（门禁冻结） | 每处改动配真实篡改负向对照 |
| `prompts/server/detail-skills.js`（G-2 词表） | ❌ 不改 | — | cleaning 走新增覆盖层 |
| 8 × `SKILL.md` + `index.js` 注册表 | ❌ 不返工（专业内容待 ChatGPT） | — | 不动 |
| `src/features/detail/**` 前端 | 🟡 视审计字段是否展示 | 低 | 默认不改，除非需展示 compilerAudit |
| `seed/manifest.json` / `data/**` | ❌ 不改 | — | planning 不落盘红线 |

**结论**：S2-C 与三处核心文件（`detail-ai.js`、`detail-middleware.js`、规划链门禁）高度重叠，且都是同一批数据结构。**必须由总控统一排期、一个执行者一批改完**，不得"S2-C 执行者 + 架构执行者"各改一半再合并（R1 串行互斥）。

### 2.1 可提前做的独立准备（不冲突）
- 建 `industry-packs/_template/` 目录骨架与 manifest 字段模板（不写专业内容）。
- 写统一跨层测试集骨架（合并 `product-cases.md` A–F + 本报告 7 案例）。
- 写新门禁脚本但**暂不注册**到 `run-all.mjs` 主线（待字段落地后注册，避免环境未就绪误判）。
- ChatGPT 并行交付专业内容（不碰代码）。

---

## 3. 文件级变更清单（S2-C 实施时）

| # | 文件 | 变更 | 依据 |
|---|---|---|---|
| 1 | `server/detail-ai.js` | 事实映射说明改 L1/L2/L3→三枚举（`:45`）；outputSchema 增字段（`:205-291`）；instruction 增四层约束（专业内容待 ChatGPT） | V2-ARCH-002 §2.3；V2-ARCH-003 §3 |
| 2 | `server/detail-middleware.js` | 行业单一决策源（`:91-112/481/422/427`）；归一扩字段（`:148-210`）；17 槽位授权+净化+四字段落槽+去截断（`:602-624`） | V2-ARCH-002 §3/§5；V2-ARCH-005 §4 |
| 3 | `prompts/server/detail-v2-planning/schemas/planning-result.schema.json` | 增字段（factType 分类、capabilityProfile、候选任务、审计、screens 7 字段），不改 9 顶层、不改枚举值 | V2-ARCH-003 §3 |
| 4 | `prompts/server/detail-v2-planning/schemas/quality-result.schema.json` | QC 三层区分字段（如需要） | V2-ARCH-005 §5.3 |
| 5 | `prompts/server/detail-v2-planning/industry-packs/`（新增） | cleaning + _template 目录骨架、manifest | V2-ARCH-004 §3 |
| 6 | `prompts/server/detail-v2-planning/registries/`（新增，建议） | 内容/视觉任务注册表结构（内容待 ChatGPT） | V2-ARCH-005 §2 |
| 7 | `scripts/verify/`（新增门禁） | 字段贯通断言、准入断言、编译审计断言、行业路由负向对照 | V2-ARCH-005；项目门禁纪律 |
| 8 | `scripts/verify/run-all.mjs` | 新门禁注册双数组（ORDER/FAST_ORDER） | 项目纪律（新 verify 必注册） |
| 9 | `docs/规划/README.md` / 执行单总表 | 状态回填 | 文档纪律 |

> 🟢 明确不改：`detail-skills.js`（G-2）、8 Skill 资产、`src/features/detail/**`（默认）、`seed`/`data`。

---

## 4. 统一排期建议（R1 串行）

| 批次 | 内容 | 前置 | 可并行 |
|---|---|---|---|
| P0 专业内容交付 | ChatGPT 交付 8 Skill 职责/策略/故事/行业正文/视觉标准/提示词质量标准 | 无 | ✅ 与 P1 并行（不碰代码） |
| P1 契约落地 | Schema 增字段 + detail-ai outputSchema + 事实映射口径 | 阶段 B/C 定义（✅） | 否（核心文件） |
| P2 路由与归一 | 行业单一决策源 + cleaning 覆盖层 + 归一扩字段 | P1 | 否（同 middleware） |
| P3 准入层 | 任务注册表结构 + 四态准入 + 准入记录 | P1/P2 | 否 |
| P4 编译与审计 | 17 槽位授权/净化/四字段落槽 + compilerAudit + 去截断 | P1–P3 | 否（同 middleware） |
| P5 门禁与测试集 | 新门禁注册 + 统一跨层测试集 + 负向对照 | P1–P4 | 部分（脚本骨架可提前） |
| P6 分层测试 | Schema→代码→Mock→API→真实模型（Owner KEY）→真实用户 | P5 + ChatGPT 内容 | 真实模型级需 Owner |

> 每批一 commit、精确 `git add`、禁 `--no-verify`；门禁锚点只同步维护、配负向对照；基线刷新须明文预授权。

---

## 5. 七项兼容风险逐项落地（阶段 A §6 → 改造计划）

| # | 风险 | 落地措施 |
|---|---|---|
| 1 | G-2 词表禁改 | cleaning 走新增覆盖层，旧 10 类表不动；门禁冻结哈希不破 |
| 2 | 8 Skill 已复核不返工 | 资产/注册表/phrase 不重写；ChatGPT 新内容到位后按四处同步流程替换，配门禁 |
| 3 | Schema 收窄决策（V219 四项） | 事实仍输出三枚举，L1/L2/L3 只在说明/适配层；不推翻 12→9 角色等收窄 |
| 4 | 测试集唯一一份 | 合并 A–F + 7 案例为一份跨层库，不建第二套（裁决 -03） |
| 5 | 旧版逐字节兼容 | 17 槽位文本格式、门禁锚点（`NEEDLE_SKILL` / `V1_LIGHT_LINE` / `NEEDLE_FILTER`）不动或强度不降 |
| 6 | 不落盘红线 | planning/selectedSections/审计均内存；禁进 group/preset/seed 三条持久化通道 |
| 7 | R1 串行互斥 | S2-C 与架构实施同一执行者统一排期（§2），禁并发改同文件 |

---

## 6. 专业内容依赖（第九节禁令边界）

### 6.1 总控 AI 不得自行定型（待 ChatGPT）
- 8 基础 Skill 的职责与推理规则；
- 消费者营销策划方法；
- 详情故事规划方法；
- 行业知识正文（含清洁日化 INDUSTRY.md）；
- 视觉艺术指导标准；
- 最终分屏提示词质量标准。

### 6.2 本批如何守界
六份文档只定：架构、字段、目录/接口、准入/审计机制、测试设计、变更清单。凡涉及"具体内容是什么"处均标注"ChatGPT 交付"或"待专业定型"，未写任何专业结论。

### 6.3 阻塞关系
P3（任务准入）注册表的 `allowedIndustries/requiredFacts/excludedConditions` 等值、P1（Schema）中 `factType` 具体枚举、P6 真实模型质量判定标准——**均依赖 ChatGPT 内容**，不能由工程自行填值。

---

## 7. 未完成事项清单（诚实标注）

1. **业务代码未改**：本批零代码改动，架构仍是设计态；S2-C 实施按 §4 排期。
2. **Schema 新字段未落**：仅设计，未写入 `*.schema.json`。
3. **行业包/任务注册表未创建**：仅目录与接口规范。
4. **统一跨层测试集未建**：仅测试设计（V2-ARCH-006）。
5. **真实模型测试未跑**：无 KEY、Owner 排期；不标生成质量通过。
6. **真实用户测试未做**：四层改造后未测。
7. **ChatGPT 专业内容未到位**：8 Skill 内容、行业正文、质量标准等（§6）。
8. **任务书原阶段 F 后半段**：补充裁决已给 7 案例，视为补全；如与外顾后续版本冲突，以外顾最新版为准并回填。
9. **未核实项**：cleaning 最终 ID 命名、globalVisualDNA 挂载点（规划 vs 顶层）、compilerAudit 持久化与否——均待 ChatGPT/代码落地时定。

---

## 8. 最终结论

阶段 B–F 六份文档按任务书全部交付（本文件为第 6 份），架构定义、字段契约、行业包机制、准入审计、分层测试、变更风险均已明确，且守住"专业内容不越权、代码统一排期、测试分层不虚标"三条红线。

**当前状态 = 架构设计完成、代码实施未开始、真实质量未验证。** 后续以 ChatGPT 专业内容到位为知识前置、以 §4 排期为工程路径，逐批落地并在阶段 F 分层验收。完成本批后提交整体成果，不逐小阶段反复请示。
