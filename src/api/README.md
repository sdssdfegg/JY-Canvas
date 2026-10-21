# src/api API 调用层

这个目录是前端唯一 API 调用层。页面组件不要直接散写 `fetch("/api/...")`，应该先在这里建一个薄封装，再由页面调用。

## 文件分工

| 文件 | 负责接口 | 说明 |
| --- | --- | --- |
| `client.js` | 所有请求底座 | `ApiError`、`apiJson`、`postJson`、`postForm`，统一 JSON/FormData 提交、错误读取和本机 requestId |
| `config.js` | `/api/config` | 读取模型、渠道策略、是否已有服务器 KEY |
| `images.js` | `/api/images` | 快捷生成、参考生图、详情分段、批量页内快捷生图共用 |
| `outfit.js` | `/api/generate-outfit`、`/api/outfit-master-fit-analysis`、`/api/outfit-quality-check` | 批量换装/姿态/背景/改色/白底/换脸/设计稿主链路 |
| `videos.js` | `/api/videos/generations`、`/api/videos/status` | 视频提交和轮询 |
| `prompts.js` | `/api/quick-prompt-rewrite`、`/api/reference-prompt-rewrite`、`/api/detail-prompts` | 提示词重写和详情提示词生成 |
| `save.js` | `/api/save-directory`、`/api/pick-directory`、`/api/open-save-directory`、`/api/save-image`、`/api/save-processed-image` | 保存目录的读取/设置/选择/打开，以及把结果图片落盘（P7-6 从 feature 侧收口进来，见下方「返回原始 Response 的例外」） |
| `history.js` | `/api/history` | 历史记录读取、保存、删除、清空 |
| `assets.js` | `/api/image-proxy`、`/api/cache-result-image` | 图片代理读取、结果图缓存；另含两个本地取流的 `fetchBlobWithTimeout`（带超时+强制缓存）与 `fetchLocalBlob`（data:/blob: URL 本地读取，非后端请求） |
| `debug.js` | `/api/debug/image-request-params` | 传参自检，不调用上游、不扣费 |
| `seed.js` | `/api/seed-sync` | V123 封装配置同步：薄封装 `syncSeedManifest`（POST，internal 模式设置页「同步到封装配置」按钮用）与 `fetchSeedSyncStatus`（GET，新鲜度提示用）。仅非 public 模式由 `server/routes/seed.routes.js` 注册，客户版无此出口 |

## 维护规则

1. 新增接口先改 `client.js` 或对应业务文件，不要在页面里直接写请求细节。
2. JSON 请求用 `postJson()`，图片/文件上传用 `postForm()`。**例外**：`saveImageRequest` / `saveProcessedImageRequest` / `cacheResultImageRequest` 刻意**返回原始 `Response`**、不走 `ApiError`，原因见下方同名小节——别"好心"把它们统一回 `postJson`。
3. `ApiError` 会带 `status`、`payload`、`url`、`method`、`requestId`，排查接口时优先看这些字段。
4. API Key 不在这里硬编码；页面只把用户 KEY 放进请求体，本地服务再交给中转站。
5. 错误文案需要统一时，先看 `client.js` 和调用方的错误归一函数。
6. API 返回结构一旦变更，要同步检查 `server/index.js` 对应路由。

## 返回原始 Response 的例外（P7-6 收口时定下的口径）

`save.js` 的 `saveImageRequest` / `saveProcessedImageRequest` 和 `assets.js` 的 `cacheResultImageRequest`
是 2026-10-16 P7-6 从各 feature 里收口进来的。它们**只搬请求本身**（URL / method / headers / body 与改动前逐字一致），
**响应处理留在调用方原地**，因此返回原始 `Response` 而不是走 `client.js` 的错误通道。

为什么这么定：这三处的调用方容错和错误文案各不相同——有的 `response.json()` 带 `.catch(() => null)`、
有的不 catch；失败文案分别是「保存图片失败」「保存长图失败」「自动保存失败」，还各自夹着
`setSaveDirectory` / `addEvent` / `flashDownloadFeedback` 之类的副作用。一旦统一到 `ApiError`，
网络异常时用户看到的会从原始 `TypeError` 变成「保存图片失败：xxx」，那是行为改动，不在收口范围内。

**要统一错误通道是一个独立改动**：得先逐个评估三处文案的影响面，别顺手做。

## API 出问题时发给 Codex

优先发这些小文件：

```text
V11维护文档/04-API调用与登录系统地图.md
src/api/README.md
src/api/client.js
src/api/<出问题的接口文件>.js
server/features/api-gateway/README.md
```

如果是具体生成慢或失败，再附：

```text
logs/generation.jsonl 里本次 requestId 对应的 5-20 行
http://127.0.0.1:8787/api/health 的返回
```
