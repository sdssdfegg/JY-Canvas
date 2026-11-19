# V2-SKILL-AGENT-ENHANCEMENT-001 · 专业能力升级与智能策划优化报告

> 日期：2026-11-19　基线：`2d80c03`+`82c661f`。前置架构审查：`V2-INTELLIGENCE-AUDIT-001`（判断 C 为主/B 为辅）。
> 边界遵守：保留八项 Skill（未新增第九项）、单 Planner、四层控制、前端流程、Provider/KEY/调用链、QC 已关闭机制；未为任何单品建专属模板；未加 Agent/模型调用。
> 证据等级：已证实（代码/运行/真实链路）｜部分证实｜待验证（无 KEY）｜未实现。

---

# 交付 1：V2 专业能力升级报告

## 升级前后核心问题与改动
架构审查（已证实）指出核心断裂：SKILL.md 正文运行时不读取，只有 `detail-ai.js` 的 8 句 directive 进 AI 规划请求。因此本轮升级遵循"**正文融合 + directive 同步**"双写，确保正文真正生效，而非只存档。

| 能力 | 升级前 | 升级后 | 生效机制 |
|---|---|---|---|
| SKILL02 营销策划 | 四层法（事实→需求→利益→表达） | 增**五层价值链**（补属性/特征、功能/作用、购买理由）+购买驱动力判断（非行业固定映射）+证据利益匹配+信息优先级 | 正文 §判断方法 + directive |
| SKILL03 叙事规划 | 屏数约束/九要素 | 增**完整内容地图**（非固定清单）+禁止一条卖点/一个使用动作一屏+内容地图与取舍理由内部保留 | 正文 §判断方法/输出字段 + directive |
| SKILL04 视觉导演 | 视觉概念/六维差异 | 增**商品展示角色**（Primary/Secondary/Detail/Contextual/Absent 内部标签，逐屏判断）+ 文案画面语义对应 | 正文 §规则2b/输出字段 + directive |
| 商品理解（代码层） | 结构化仅成分/适用范围/使用方法 | 词表扩至材质/颜色/版型/洗涤/场景/效果/规格；分类与切分同源 | `parseStructuredFacts` |
| 内容组织（代码层） | 任务不足时多屏卖点重复 | 按维度独立任务；资料不足屏诚实标注"无新增独立信息"，不重复卖点 | `buildLocalScreenTasks`+兜底逻辑 |

**没有做的事**：未重写八项 Skill 架构、未新增 Skill/Agent/模型调用/Provider/KEY、未改前端流程/QC、未加负面词堆砌、未为单品硬编码、未改接口/Schema（新增均为正文内部小节与局部变量/纯函数增强）。

## 回答"是否真正提高能力"
- **商品理解**：是（已证实）——升级前跨商品测试服装/家居只识别 2 类且多为 other；升级后服装识别 material/color/care/spec、家居识别 material/effect/applicableScope/color/spec，来源/等级/原文保留。
- **营销策划**：部分提高（已证实工程层 / 待验证模型层）——正文与 directive 有了五层价值链与证据匹配规则；无 KEY 无法证明 AI 规划模型是否据此产出更优表达。
- **详情叙事**：是（已证实工程层）——本地兜底使用方法不再拆成三碎片屏（上一轮）+内容地图/禁止一条卖点一屏进入正文与 directive；完整规划仍依赖 AI（待验证）。
- **视觉导演**：部分提高（正文与 directive 有展示角色；实际视觉差异待 G4）。
- **判断依据**：以三商品真实案例升级前后对照（交付4），不以"加了几条规则"替代质量证明。

---

# 交付 2：八项 Skill 修改差异与接入证据

修改差异（三份正文，均为补充融合、不替换旧有效规则）：
| 文件 | 差异 | 回链 phrase 保留 |
|---|---|---|
| `skills/consumer-marketing-strategy/SKILL.md` | +12 行：五层价值链/价值翻译/购买驱动力/信息优先级/证据利益匹配/下游策略摘要 | 「空洞参数罗列不算营销表达」 |
| `skills/detail-story-planning/SKILL.md` | +6 行：完整内容地图/禁止一条卖点一屏/内容地图与取舍理由 | 「禁止固定标题轮转」（上一轮） |
| `skills/visual-art-direction/SKILL.md` | +4/-2 行：商品展示角色判断 2b + 输出字段 4b | 「禁止仅背景/颜色变化」 |

四件套：
1. **修改差异**：见上表与 git diff（6 文件 +91/-25）。
2. **实际运行读取证据**：`detail-ai.js:173-179` 的 `V2_REGISTERED_SKILLS.map(skill=>skill.directive)` 把更新后的 8 句 directive 送进 AI 规划请求；实测新增概念"五层价值链/完整内容地图/展示角色"在 SKILL 正文与 directive 双命中（Z1-Z6）。
3. **触发测试**：planning-chain 76/76（回链 phrase 逐字校验通过）；control-chain 386/386（Z 组 12 项）。
4. **提示词污染测试**：更新 directive 不含 Skill 正文全文；`qualityChecklist` 仍只在审计层；三商品测试未见无关 Skill 规则进入生图 text。

**诚实边界**：正文写入 SKILL.md 本身对运行时无直接作用（bundle 后不读 md，架构审查已证实）；真正生效的是同步更新的 directive。SKILL.md 的作用是正式存档 + 门禁回链取证。

---

# 交付 3：AGENT 智能策划与动态调度优化报告

架构审查核心缺陷是"判定与执行断开"（activeIds 除 model-pose 外零消费、`compileWithAuthorization` 死代码）。本轮**未做架构级打通**——因为那需要给八项 Skill 的执行侧新增消费点，接近"重新设计调度"，超出本次"最小改造+不动接口"边界，且审查报告 P0 建议已单独列出等待确认。

本轮做的是**不改架构的真实能力优化**：
- 商品事实画像传递：统一到 `parseStructuredFacts` 产出的 `{category,label,content,source,level}` 结构，从商品理解贯穿到本地任务分配与视觉组装（已证实，Z12）。
- 营销→叙事传递：本地路径由 `buildLocalScreenTasks` 按事实维度生成屏级任务（不再是原始资料轮流取），等价于把"营销信息优先级"落到内容分配（已证实）。
- 叙事→视觉传递：`compositionHint` 随每屏任务传入 `buildScreenVisual`，各屏画面任务因内容不同而不同（已证实）。
- 动态调度：仍维持现状（判定层存在但执行侧仅 model-pose 消费）——**这是待改造项，不是本轮成果**，见"未完成事项"。

---

# 交付 4：跨商品质量评测报告

三商品本地真实链路（无 KEY，ST=结构化类别，P=prompts，人物=按屏 active）：
| 商品 | 升级前类别 | 升级后类别 | 屏数 | 人物 | 卖点重复 | 关键观察 |
|---|---|---|---|---|---|---|
| A 日化清洁剂 | ingredient/scope/usage | ingredient/scope/usage | 4 | 全 false | 0 | 使用方法整段进一屏；"窗帘"豁免 |
| B 服装 T恤 | other/spec（2类） | material/spec/color/care（4类） | 5 | [T,T,F,F,F] | 前3屏各异，后2屏诚实标注无新增信息 | 版型/洗涤被结构化；人物仅授权2屏 |
| C 家居保温杯 | other/spec（2类） | material/scope/effect/color/spec（5类） | 3 | 全 false | 0 | 场景/保温效果独立成屏 |

升级前后差异结论：B/C 从"几乎全屏重复同一句原始资料"变为"各屏不同维度"——这是本轮最实质的质量提升（已证实，本地工程层）。**非"增加屏数"或"加长提示词"，而是同一屏承载的信息更准确、更不重复。**

每能力五类评测基线（实测）：
| 能力 | 正常 | 不应触发 | 边界模糊 | 信息不全 | 跨行业干扰 |
|---|---|---|---|---|---|
| 商品理解 | 3类事实识别 ✓ | — | — | 0屏+planningError ✓ | 服装词入日化如实解析为 material（非套行业规则）✓ |
| 营销事实边界 | 已确认事实放行 ✓ | "奶渍/快速去渍不伤"拦截/不扩写 ✓ | — | — | — |
| 人物授权 | use-model usage=1→[T,F,F,F] ✓ | no-model 全 false ✓ | "不要人物"→全 false ✓ | — | 日化未误触人物 ✓ |

---

# 交付 5：最终提示词污染与注入检查报告

- 未触发专项不注入专项全文：qualityChecklist 仅在 `internalAudit`，生图 text 用精简固定句（已证实，middleware:1006-1008）。
- 未触发人物不注入人物指令：未授权屏 text 为"本屏无模特，禁止出现真人、人体局部…"（Z11 + 评测基线）。
- 商品资料不跨商品污染：每次调用以本屏 localTask 为准，三商品测试无交叉卖点。
- Skill 正文不进生图 text：text 由 17 槽位拼接，不含 SKILL.md 摘录（架构审查已证实；本轮未改变）。
- directive 进的是 AI 规划请求（非生图 text），且不含完整正文（已证实）。
- 其他八项 Skill 无回归：planning 76/76、control 386/386、全量 85/85。

---

# 交付 6：修改文件清单及 Commit 列表

修改文件（6）：
1. `prompts/server/detail-v2-planning/skills/consumer-marketing-strategy/SKILL.md`
2. `prompts/server/detail-v2-planning/skills/detail-story-planning/SKILL.md`
3. `prompts/server/detail-v2-planning/skills/visual-art-direction/SKILL.md`
4. `server/detail-ai.js`（directive 同步生效）
5. `server/detail-middleware.js`（结构化词表 + 任务分配 + 兜底去重）
6. `scripts/verify/detail-v2-control-chain-check.mjs`（Z 组 12 项）

Commit：
- 本次升级 commit：（提交后回填）
- 基线：`2d80c03`（核心修复）、`82c661f`（状态同步）

门禁：control 386/386（Z 组12 + 原有374）、planning 76/76、sections 25/25、assets 冻结未破、`run-all --fast` 85/85、`vite build` EXIT=0（4.48s）。

---

# 交付 7：未完成事项与真实模型待验收事项

1. **架构级"判定→执行"打通未实施**：activeIds 零消费、compileWithAuthorization 死代码仍是审查 P0 待改造项；本轮按边界未动，需 Owner 确认后再做（影响执行侧、接近架构调整）。
2. **无 API KEY，G4/G5 未验证**：五层价值链/内容地图/展示角色是否让 AI 规划模型产出更优营销与视觉、效果是否扩写、出图质量——全部待验证，**不标通过、不用 Mock**。
3. **AI 自主规划屏数未实现**：系统仍完全遵从用户 count；任务书目标5"自主规划屏数"属架构级，未在本轮实现。
4. **商品图片视觉理解未接入**：本地路径只读图片文件名/尺寸；真实图片理解需视觉模型（新增调用，禁止），保持待验证。
5. **图片角色到模型层拍平**：见素材隔离排查报告；本轮未改模型请求层。
6. **服装资料不足时后2屏标注"无新增独立信息"**：诚实但视觉任务不丰满，需 AI 规划增强（待 KEY）。
7. 本轮**不改 SKILL01/05/07 正文**（审查显示已有规则覆盖，按"不重复堆叠"原则只检查未重写）；QC 保持已关闭机制未动。

**本次任务到报告与提交为止；超出既定架构与产品边界的改造（P0 打通执行、图片视觉理解、自主屏数）单独报告，未自行扩大授权。**
