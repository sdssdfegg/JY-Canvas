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
```
