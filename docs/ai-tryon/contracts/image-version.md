# 契约：ImageVersion（图片版本）

> 战略 §七 7.2 / 7.3 的落地版，对应 P2 第 1/4 项（确认图片版本数据结构 + 记录每一轮编辑要求与执行信息）。
> 版本：contract-v1（2026-11-05 起草，V170）｜ 状态：待 P2 施工评审。
> 本契约只定义数据层与字段口径；第 2/3/5/6/7/8 项（新生成结果保存为独立版本、保留原图、连续多轮编辑链路、前后版本比较、回退、界面展示）不属本单范围。

## 1. 字段定义

| 字段 | 类型/规则 |
|---|---|
| `version_id` | 稳定唯一 ID（UUID 或净化后的别名）；创建后不可变，由 `safeVersionId` 净化（拒绝 `/`、绝对路径、`..`、空字节、空串） |
| `version` | 整数序号，由索引推导（根为 1、子版本递增）；只作展示/顺序用途，不得替代 `version_id` |
| `task_id` | 对应 TryOnTask 标识，可空（沙盒数据可空，真实数据由后续单填） |
| `parent_version_id` | 父版本 ID；根版本为 `null`；只存指针，本单不实现树遍历/比较/回退 |
| `input_asset_refs[]` | 输入素材引用 `{type, ref, name?, bytes?}`；只存引用，不落 buffer |
| `result_asset_ref` | 生成结果路径或资源标识；🔴 注明引用可能因 TTL 清理失效 |
| `user_instruction` | 用户本轮指令（纯文本） |
| `structured_edit_goal` | 本轮结构化编辑目标（对象，可空）；结构化状态，不堆越长的对话历史 |
| `model_and_versions` | 模型名 / 模板版本 / 策略版本（对象，可空） |
| `execution_params` | 关键执行参数（对象）；🔴 写入前强制剥离敏感键（API Key / 口令 / 私钥 / token 等） |
| `created_at` | ISO 时间戳（服务端生成，拒绝外部覆盖） |
| `status` | 执行状态（`pending` / `succeeded` / `failed`），枚举值不改既有业务枚举 |
| `error` | 错误信息（纯文本，脱敏后可空） |
| `user_accepted` | 用户是否接受结果；🔴 只能由 `setUserAccepted` 显式设置，禁止静默覆盖/自动置 true |

## 2. 存储落点

- `data/ai-tryon/image-versions/<version_id>.json`（版本文件只增不改不删）；
- 索引 `data/ai-tryon/image-versions/index.json`：单写入器串行化 + 原子替换（同 tryon-task.md §3 / garment-profile.md §2）；
- 索引损坏时 `.bak` 回退，两者皆坏则扫目录重建；
- 🔴 用户资产红线：本目录属用户有意资产——任何清理/迁移/封装都不得删除（封装四红线④ + 档案同款纪律）；本模块不提供任何删除接口。

## 3. 与任务的关系（后续单接入，本单不实现）

- 后续生成出口单（V171-A）在 `settleTryOnTaskInBackground` 出口调用 `appendImageVersion` 写入真实轮次数据，并登记 `task_id`；
- 资产固化（把结果图复制到不清理的版本资产目录，脱离 TTL 缓存）归后续单，本单只存引用；
- 本数据层只读、可列举、可读父链，不修改已落盘版本。

## 4. 第一版（P2 第 1/4 项）边界

- 必须：版本创建/查询/列举/父子链读取、字段口径对齐 §七 7.2 十三项、敏感键剥离、version_id 净化、索引容错；
- 不做：新生成结果保存为独立版本（接生成链路）、保留原图与之前版本（资产固化）、连续多轮编辑 UI、前后版本比较、回退、界面展示当前编辑对象（均属战略 §九 P2 第 2/3/5/6/7/8 项，后续单）；
- 🔴 引用失效红线：本契约所有 `result_asset_ref` / `input_asset_refs` 只是引用，不承诺永久保留；`result-cache.js` 按 TTL `unlink` 清理，`/api/history-image/*` 也属用户可清理目录。

示例（单版本落盘形状）：

```json
{
  "version_id": "f47ac10b-...",
  "version": 1,
  "task_id": "task-001",
  "parent_version_id": null,
  "input_asset_refs": [{ "type": "image", "ref": "ref-a", "name": "a.png", "bytes": 10 }],
  "result_asset_ref": "res-1",
  "user_instruction": "make red dress",
  "structured_edit_goal": { "region": "dress", "goal": "red" },
  "model_and_versions": { "model": "nano", "template": "t1", "strategy": "s1" },
  "execution_params": { "model": "nano", "steps": 30 },
  "created_at": "2026-11-05T08:00:00.000Z",
  "status": "succeeded",
  "error": null,
  "user_accepted": false
}

## 5. 生成出口与资产固化（P2-4 · V171-R 落地）

> 本 § 在 V170 数据层之上补充「真实轮次写入」与「资产固化」实现口径，字段口径与 §1/§2 一致。

### 5.1 写入入口（server/ai-tryon/image-version-bridge.js）
- 在 `outfit.routes.js` 三个生成出口（`settleTryOnTaskInBackground` 成功出口 / 两个失败出口）之后，**后台**调用 `recordOutfitImageVersionInBackground`，不占响应时间、不阻断响应、失败全吞；
- 版本记录只增不改不删；`parent_version_id` 恒为 `null`（本单只写根版本，跨轮次父子关联另立单）；
- 字段口径：
  - `task_id` = `tryonTask.task_id`；**无 task_id 则不写**（版本必须绑定真实任务）；
  - `status` = `succeeded`（成功出口）/ `failed`（失败出口，避免「只有成功才有历史」的隐性缺口）；
  - `user_instruction` = 用户本轮指令（`payload.prompt`，纯文本，截断 2000）；
  - `model_and_versions` = `{ model, channel }`；
  - `execution_params` = 仅非敏感字段（`workflowMode / imageSize / aspectRatio`），**绝不传入 apiKey**；敏感键即便误传也被 store 的 `stripSensitiveKeys` 强制剥离；
  - `input_asset_refs` = 上传文件名字/大小（不落 buffer）；
  - `result_asset_ref` = 固化资产文件名（见 5.2），失败出口为 `null`。

### 5.2 资产固化结论（脱离 TTL 缓存）
- 现状：`result-cache.js` 仅按 TTL 清理 `resultDir`（`data/results`）；`storage.routes.js` 的 `/api/storage/clean` 只删 `STORAGE_TARGETS` 白名单内的目录；
- 方案：新增永久目录 `data/ai-tryon/image-version-assets/`（路径出口 `app-paths.js: aiTryonImageVersionAssetsDir`）；成功出口把**已落盘**的本地结果图**复制**进该目录（UUID 命名），`result_asset_ref` 写永久副本文件名；
- 🔴 红线：该目录**故意不加入任何清理白名单**（`storage-usage` / `result-cache` / `storage.routes`）——既不会被 TTL 清理，也不会被用户「清理存储」误删；既有 `data/results/*` **不删不迁**；
- 服务化读取：`GET /api/image-version/asset/:versionId` 从永久目录按 version 解析文件名后流式返回（路径穿越拒绝）；引用可能因极端情况失效时返回 404（前端「当前编辑对象」降级为无图）。

### 5.3 只读 API（server/routes/image-version.routes.js）
- `GET /api/image-version/list?taskId=`：列表（可选按 task_id 过滤；服务端按序号倒序）；**无 DELETE / 无写接口**；
- `GET /api/image-version/asset/:versionId`：固化资产只读流动；
- 前端一律经 `src/api/image-version.js`（client.js 准入层），禁裸 fetch；最小展示组件 `ImageVersionList.jsx` 纯只读、复用 Panel/ModuleHeader/Button、不新增弹窗组件（Modal）。

### 5.4 本单边界（不得宣称 P2 闭环）
- 只交付战略 §九 P2 第 2（新生成结果保存为独立版本）、3（保留原图与之前版本）、8（界面展示当前编辑对象与版本）最小切片；
- 不交付第 5/6/7 项（连续多轮父子树 / 前后版本比较 / 回退）；父子链 `parent_version_id` 本单恒为 `null`；
- 不碰 P0 生命线 payload、不改提示词、不碰用户态、不新增持久化键。
```
