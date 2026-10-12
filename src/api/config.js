import { apiJson } from "./client.js";

export function getAppConfig() {
  return apiJson("/api/config", {}, "读取配置失败");
}

// 切换网关目标（老 / 新服务器）。服务端只接受登记过的线路 id。
export function setGatewayTarget(targetId) {
  return apiJson(
    "/api/gateway-target",
    { method: "POST", body: JSON.stringify({ id: targetId }) },
    "切换服务器失败"
  );
}
