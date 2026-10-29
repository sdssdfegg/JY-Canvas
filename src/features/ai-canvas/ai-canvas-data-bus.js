// src/features/ai-canvas/ai-canvas-data-bus.js
// V144：节点间图像数据总线（纯逻辑，零 import，便于无头断言）。
//
// 为什么需要它：V143 的「生成节点」只有单输入/单输出，上游图直接当输入。
// V144 的 outfit 节点有多端口（换装要 图1 人物 + 图2 服装），必须按「端口」归集上游输出。
// 本文件回答两件事：
//   1. nodeOutputImage(node) —— 任一出图节点的「当前选中版」输出图 URL（数据总线源）。
//   2. collectNodeInputs(current, node) —— 把本节点的上游边按 toPort 归集为 { 端口→图URL }，
//      并收集上游提示词节点的文本。
//
// 向前兼容：旧存档 / 旧连线不带 toPort，则回落为单端口口径（image→"in"，prompt 文本拼接）。

// 节点「当前选中版」的输出图 URL：下游节点吃的就是这一张（版本切换后跟着切）。
export function nodeOutputImage(node) {
  if (!node || !node.data) return null;
  const data = node.data;
  if (data.src) return data.src; // result 节点
  if (data.resultUrl) return data.resultUrl; // generation / outfit 节点（选中版）
  return null;
}

// 把上游边按 toPort 归集。返回 { imageInputs: [{port,url,fromType}], promptText }。
// imageInputs 每个元素对应一个上游出图节点的选中版；promptText 来自上游 prompt 节点。
export function collectNodeInputs(current, node) {
  if (!current || !node) return { imageInputs: [], promptText: "" };
  const byId = new Map((current.nodes || []).map((n) => [n.id, n]));
  const upstreamEdges = (current.edges || []).filter((edge) => edge.to === node.id);

  const imageInputs = [];
  const promptTexts = [];
  const seenPort = new Set();

  upstreamEdges.forEach((edge) => {
    const from = byId.get(edge.from);
    if (!from) return;
    const outKind = from.type === "prompt" ? "prompt" : "image";
    const url = nodeOutputImage(from);
    if (outKind === "prompt") {
      const text = String(from.data?.text || "").trim();
      if (text) promptTexts.push(text);
      return;
    }
    if (!url) return; // 上游还没出图，跳过（不污染下游）
    // 端口解析：显式 toPort 优先；无 toPort 的旧连线回落为 "in"。
    const port = String(edge.toPort || "").trim() || "in";
    if (seenPort.has(port)) return; // 同一端口只取一条上游（先到先得，稳定可复现）
    seenPort.add(port);
    imageInputs.push({ port, url, fromType: from.type });
  });

  const nodePrompt = String(node.data?.prompt || "").trim();
  const promptText = nodePrompt || promptTexts.join(" ") || "";
  return { imageInputs, promptText };
}

// 便捷：取某个端口名的图 URL（找不到回落 imageInputs[0]）。
export function imageForPort(inputs, port) {
  if (!inputs || !inputs.length) return null;
  const hit = inputs.find((i) => i.port === port);
  return hit ? hit.url : (inputs[0] ? inputs[0].url : null);
}
