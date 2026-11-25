# JY-Canvas 阶段 B · RequestContract 与 ProductBrief 契约统一实施报告

> 日期：2026-11-21　基线：HEAD `852a952` → 本阶段业务 commit（见第五节）。性质：**契约统一实施**——只做 RequestContract / ProductBrief 两项契约，复用现有结构、不重复建设。
> 🔴 边界：未改 ScreenPlan 逐屏实现、未接入 Studio 视觉导演、未实施多组对比、未改写八 Skill 职责体系；保留 P1 全部治理、五态审计、跨行业冲突保护、真实性锁、提示词一致性；未启动真实模型调用、未产生 API 费用。

---

## 一、实际修改文件与代码证据
| 文件 | 位置 | 修改 |
|---|---|---|
| `server/detail-v2-control/index.js` | :35-44 | 新增 `FACT_CATEGORY` 五类事实信息类别枚举（product-confirmed/industry-knowledge/competitor/user-review/ai-inference）+ 类别集合常量 |
| 同上 | :72-113 | 新增 `DETAIL_REQUEST_CONTRACT`：22 项参数的 semantic/defaultValue/explicitFlag/appliesTo/scope；modelUsage 语义=整套目标屏数（非前N屏）、reverseScreens=painReverse 保留、copywriting need/none 两值 |
| 同上 | :115-145 | 新增 `normalizeDetailRequest(input)`：返回规范化 values + 逐参数 trace（source=user/default、explicit、appliesTo、scope）+ `targetModelScreens` 语义别名 |
| 同上 | :147-177 | 新增 `classifyProductFacts(facts)`：识别"行业知识/推断冒充商品事实"；旧数据（无 category）兼容旧判定 |
| 同上 | :179-180 | 新增 `confirmedFactClaims(facts)`：middleware 统一消费入口 |
| 同上 | default 导出 | 追加 6 个新契约接口 |
| `server/detail-middleware.js` | import | 引入 classifyProductFacts/confirmedFactClaims/normalizeDetailRequest |
| 同上 | :957 附近、:1281 附近、:1469/:1497/:1515/:1546 | 6 处 visible 事实消费统一改走 `confirmedFactClaims`（旧数据逐项等价、新数据防冒充） |
| 同上 | 函数开头 | 调用 `normalizeDetailRequest(input)` 生成契约视图 |
| 同上 | return 前 | 非枚举挂 `requestContract` + `productBriefAudit`（不污染序列化/逐字节门禁） |
| `scripts/verify/detail-v2-control-chain-check.mjs` | CB 组 7 项 | CB1-CB7 契约断言（详见第四节） |

**未改（明确保留）**：`modelPolicy` 的 `index < min(modelUsage,count)` 运行时分配——按任务书"具体屏位分配属于阶段 C"，本阶段只在契约层定义正确语义（targetModelScreens），不改运行时。

## 二、字段契约
### RequestContract（22 项，类别/语义/默认值/明确标志/适用范围）
- 创作策略：workflow(taobao-detail)、analysisMode(ai)、copywriting(need|none)、richness(simple)、fontStyle(heiti)、lang(中文)
- 内容规划：count(10, explicitFlag=countTouched)、countTouched(false)、modelUsage(4→语义别名 targetModelScreens)、reverseScreens(2=painReverse)
- 视觉表达：modelMode(use-model)、modelPose(regular)、stylePackId(auto)
- 生图执行：model(tt-image-2)、channelId、dispatchMode(manual)、ratio(9:16)、imageSize(2K)
- 商品事实：productName/productFeature/userInstruction/sellingPoints
- **用户明确选择优先级**：trace[].source=user|default、trace[].explicit（present 或 explicitFlag）；countTouched=true 时 count 标为 explicit。
- **状态追踪**：contractVersion=`stage-b-1.0`；PARAM_CLOSURE_STATUS 枚举 passed/failed/unverified/not_applicable（七层闭环状态口径，本阶段只定义不逐项判定）。

### ProductBrief（事实分类与溯源）
- 五类信息类别：product-confirmed / industry-knowledge / competitor / user-review / ai-inference。
- 规则：仅 product-confirmed 可作为商品事实（visible 消费）；industry-knowledge/ai-inference 等即使标 visible 也判为冒充、拒绝并留痕 misuse。
- 溯源：facts[].source 透传（如"商品图标签"），confirmedClaims 保留 source。
- **兼容**：无 category 字段的旧 aiPlan 与旧逻辑 `level==="visible".map(claim)` 逐项等价（CB4 断言 + 端到端探针验证）。

## 三、行为影响与兼容
- **零行为回归**：旧 aiPlan（无 category）在 6 处消费点结果与改动前一致；契约视图非枚举挂载，不进 JSON 序列化、不污染前端 payload 与逐字节门禁。
- **仅新数据生效**：当模型输出显式 category 且非 product-confirmed 却标 visible 时，才拒绝其作为商品事实——落实"不允许行业知识或 AI 推断冒充商品事实"。
- **modelUsage 语义**：契约层定义为整套目标屏数（targetModelScreens 别名），运行时 modelPolicy 未动（阶段 C 改屏位）。

## 四、测试结果
| 门禁 | 结果 |
|---|---|
| 控制链（含 CB1-CB7） | **561/561**（原 554 + 7） |
| planning | 78/78 |
| source-hygiene | dirtyFiles 0 |
| 全量 run-all --fast | **86/86** |
| vite build | EXIT=0 |
| eslint | 0 errors（8 存量 warning，无新增） |
| node --check（3 文件） | 通过 |
| 旧数据端到端探针 | visible 事实进 text、inferred 不冒充、misuse 空 ✅ |
| 未改 modelPolicy 核对 | git diff 零命中 ✅ |

**CB 断言要点**：CB1 契约字段齐全；CB2 modelUsage 非前N屏语义 + reverseScreens painReverse + copywriting 两值；CB3 用户/默认溯源 + targetModelScreens 别名 + copywriting 归一；CB4 旧数据兼容逐项等价；CB5 行业知识/推断冒充被拒且留痕；CB6 追踪非枚举不污染序列化；CB7 reverseScreens/modelUsage 进入 V2 规划输入白名单。

## 五、Commit 与变更清单
- 业务实施 commit：`e76a605`（3 文件，全部代码与测试变更；本报告作为交付物留工作区未提交）。
- HEAD：`e76a605`；工作区无已跟踪改动。
- 变更清单：3 文件（index.js +139、middleware.js +23/-11、chain-check.mjs +65），无新增文件（零基线漂移）。

## 六、未解决事项与边界说明
1. **modelUsage 运行时**：契约语义已改为整套目标屏数，但 `modelPolicy` 仍按前 N 屏分配——按任务书"屏位分配属于阶段 C"，本阶段不改运行时。若顾问要求阶段 B 即移除前 N 屏运行时行为，需另行授权。
2. **PARAM_CLOSURE_STATUS** 仅定义口径，未对 22 参数逐项填 passed/failed/unverified——逐项判定属于后续阶段（需真实请求/图片证据）。
3. **ProductBrief 事实来源**目前依赖模型输出 category/source 字段（outputSchema 未强制）——模型是否稳定输出 category **[未验证]**（无 KEY）；旧数据兼容保证不误导。
4. 未启动真实模型、未产生 API 费用；真实模型与图片验收留待单独授权阶段。

**停止点**：阶段 B 完成后提交本报告，停止等待顾问验收，不自行进入阶段 C。
