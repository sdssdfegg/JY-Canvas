import { postJson } from "./client.js";

// V143 MVP-3：AI 无限画布 Agent —— 把自然语言指令 + 画布快照交给服务端，取回动作清单。
export function requestCanvasAgentPlan(payload) {
  return postJson("/api/ai-canvas-agent", payload, "画布 Agent 请求失败");
}
