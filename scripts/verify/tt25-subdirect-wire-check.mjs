import assert from "node:assert/strict";
import { buildImageRequestVariants } from "../../server/channel.js";

// V148（2026-10-31）：带图请求已统一改走 JSON + image_urls。
// 原因：new-api 的计费表达式只能从 **JSON 请求体** 读 channelId；multipart 请求体读不到，
// 于是所有渠道都会塌进兜底档位（实测全塌成「默认(最低价)」0.1，真实档位不生效）。
// 全局 routeModes 只有 manual 是 ACTIVE、price_first 长期 DISABLED，所以没有合法 channelId 就报错，
// 不能靠自动兜底补救，只能让带图请求也走 JSON。
// 契约变更点：Origin（line-06）原先走 multipart + /images/edits，现改为 JSON + /images/generations
// （与 V3.7 里 Subdirect 的做法一致）。实测（2026-10-31）：line-06 经本通道 200 出图，扣费 $0.10 正常。
const files = [{ name: "reference.png", type: "image/png", arrayBuffer: async () => new ArrayBuffer(4) }];
const base = {
  model: "tt-image-2.5",
  prompt: "wire check",
  n: 1,
  imageSize: "2K",
  aspectRatio: "3:4",
  dispatchMode: "manual",
  referenceDataUrls: ["data:image/png;base64,AAAA"]
};

const subdirect = buildImageRequestVariants({ ...base, channelId: "silent-tt25-line-07" }, files);
assert.equal(subdirect.length, 1);
assert.equal(subdirect[0].protocol, "json");
assert.equal(subdirect[0].path, "/images/generations");
const body = JSON.parse(await subdirect[0].createBody());
assert.equal(body.channelId, "silent-tt25-line-07");
assert.deepEqual(body.image_urls, base.referenceDataUrls);

const origin = buildImageRequestVariants({ ...base, channelId: "silent-tt25-line-06" }, files);
assert.equal(origin.length, 1);
assert.equal(origin[0].protocol, "json");
assert.equal(origin[0].path, "/images/generations");
const originBody = JSON.parse(await origin[0].createBody());
assert.equal(originBody.channelId, "silent-tt25-line-06");
assert.deepEqual(originBody.image_urls, base.referenceDataUrls);

console.log("tt25-subdirect-wire-check: 10/10 passed");
