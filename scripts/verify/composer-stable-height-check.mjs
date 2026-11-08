// 批量生成底栏高度一致性验收（P1-001）。
//
// 两路验证：
//   A. 源码级（不打浏览器）：切换成功提示已删、拦截提示保留、三个布局固定点已落地（min-height + 占位）。
//   B. 浏览器级（真实页面）：5 档窗口尺寸 × 动态枚举的所有功能页，
//      逐页量 .composerPanel 高度/顶/底、.composerStickyControls 的 top/bottom、.rightTools 顶、
//      .generateBtn 可见性；断言切页不跳动（各量档内极差 ≤ 2px）、生成按钮不被遮挡/隐藏、
//      真实滚动容器数 ≤ 4、无整页滚动、dock 整块贴底可见。
//      2026-11-04（用户明确要求「100% 缩放」）：tabbit 浏览器 dpr=0.8，setViewportSize 需按
//      目标CSS尺寸×dpr 反算，并用探针回传的 vw/vh 硬断言校准（±2px）。否则名义 1024 实为
//      1280 CSS 像素，窄屏从未被测到 —— 这类「全绿但没测到真状态」是最危险的假绿。
//
// 服务与浏览器走独立端口（8822）/ 独立 origin，不影响用户 8787 实例，也不写 history.json。
// 用法：node scripts/verify/composer-stable-height-check.mjs
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { installExitCleanup, stopChild } from "./lib/sandbox.mjs";

const ROOT = process.cwd();
const NODE = path.join(ROOT, "runtime", "node", "node.exe");
const APP_PORT = 8822;
const CLI = path.join(process.env.LOCALAPPDATA || "", "Tabbit", "LocalAgent", "bin", "tabbit-cli.exe");

const results = [];
function check(name, pass, detail = "") {
  results.push({ name, pass: Boolean(pass), detail: String(detail) });
}

// ---------------------------------------------------------------- A. 源码级
const pagesSrc = readFileSync(path.join(ROOT, "src", "features", "outfit", "use-outfit-pages.js"), "utf8");
const composerSrc = readFileSync(path.join(ROOT, "src", "features", "outfit", "panels", "OutfitComposer.jsx"), "utf8");
const intentCssSrc = readFileSync(path.join(ROOT, "src", "features", "outfit", "outfit-intent.css"), "utf8");
const workflowCssSrc = readFileSync(path.join(ROOT, "src", "outfit-workflow.css"), "utf8");
const stylesCssSrc = readFileSync(path.join(ROOT, "src", "styles.css"), "utf8");

check("源码：切换成功提示已删除（use-outfit-pages.js 不再含「已切换到」）",
  !pagesSrc.includes("已切换到"), "已切换到");
check("源码：生成中拦截提示保留（use-outfit-pages.js 仍含「当前正在生成，完成后再切换页面」）",
  pagesSrc.includes("当前正在生成，完成后再切换页面"), "拦截提示");
check("源码：composerStatus 改为常驻渲染（不再用 {inlineMessage && …}）",
  !/\{inlineMessage\s*&&\s*<div className="composerStatus"/.test(composerSrc)
    && composerSrc.includes('<div className={`composerStatus'), "常驻");
check("源码：outfitIntentBar 改为常驻渲染（不再用 {isOutfitWorkflow && …} 整段）",
  !/\{isOutfitWorkflow\s*&&\s*\(?\s*\n?\s*<div className="outfitIntentBar"/.test(composerSrc)
    && composerSrc.includes('<div className={`outfitIntentBar'), "常驻");
check("CSS：.rightTools 单阶 min-height: var(--control-h-md)（V76 归阶后口径）",
  /\.outfitWorkflowEmbedded \.rightTools\s*\{[^}]*min-height:\s*var\(--control-h-md\)/.test(workflowCssSrc), "var(--control-h-md)");
check("CSS：.rightTools nowrap 单行策略（V77 参数条高度与板块无关）",
  /\.outfitWorkflowEmbedded \.rightTools\s*\{[^}]*flex-wrap:\s*nowrap/.test(workflowCssSrc), "nowrap");
check("CSS：.composerStatus min-height 且含 --placeholder 不可见占位",
  /\.outfitWorkflowEmbedded \.composerStatus\s*\{[^}]*min-height:\s*36px/.test(workflowCssSrc)
    && workflowCssSrc.includes(".composerStatus--placeholder"), "36px+占位");
check("CSS：.outfitIntentBar min-height 且含 --placeholder 不可见占位",
  /\.outfitWorkflowEmbedded \.outfitIntentBar\s*\{[^}]*min-height:\s*32px/.test(intentCssSrc)
    && intentCssSrc.includes(".outfitIntentBar--placeholder"), "32px+占位");
// 2026-11-04：dock 改为 flex:1 填满剩余空间（填空白），不再给固定 clamp 高度；
// 真正的反跳动保证是「底边恒定贴视口底」（浏览器级断言）。此处只校验关键 CSS 已落地。
check("CSS：.composerPanel 改为 flex:1 1 auto 填满剩余空间（无固定 clamp 高度）",
  /\.outfitWorkflowEmbedded \.composerPanel\s*\{[^}]*flex:\s*1 1 auto/.test(workflowCssSrc)
    && !/height:\s*clamp\(/.test(workflowCssSrc.match(/\.outfitWorkflowEmbedded \.composerPanel\s*\{[^}]*\}/)?.[0] || ""), "flex:1 填满");
check("CSS：.outfitScrollArea 改为 flex:0 1 auto（结果区不再撑满、留白交给 dock）",
  /\.outfitWorkflowEmbedded \.outfitScrollArea\s*\{[^}]*flex:\s*0 1 auto/.test(workflowCssSrc), "flex:0 1 auto");
check("CSS：.composerStickyControls 加 margin-top: auto（内容不足时推底，置于 margin 简写之后）",
  /\.outfitWorkflowEmbedded \.composerStickyControls\s*\{[^}]*margin-top:\s*auto/.test(workflowCssSrc), "margin-top:auto");
check("CSS：.composerStickyControls 单列约束 grid-template-columns: minmax(0,1fr)（防窄屏按钮溢出）",
  /\.outfitWorkflowEmbedded \.composerStickyControls\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/.test(workflowCssSrc), "minmax(0,1fr)");
// 2026-11-04（追加修复）：生成按钮原来是 .rightTools（nowrap+overflow-x:auto）的最后一个子元素，
// 窄屏参数行内部横滚时按钮被顶出视口右侧裁切（「下方模块显示不全」）。现用 .footerTools 把
// 参数行与按钮拆成两列：参数行 flex:1 内部自滚、按钮 flex:0 0 auto 常驻右侧，永不被裁。
const ftOpen = composerSrc.indexOf('<div className="footerTools">');
const rtOpen = composerSrc.indexOf('<div className="rightTools">');
const btnAt = composerSrc.indexOf('<Button className="generateBtn"');
check("源码：OutfitComposer 用 .footerTools 把参数行与生成按钮分成两列",
  ftOpen > -1 && rtOpen > ftOpen && btnAt > rtOpen, "footerTools 包裹层存在且顺序正确");
check("源码：.generateBtn 已移出 .rightTools（参数行闭合 </div> 在按钮之前、行内不含生成按钮）",
  rtOpen > -1 && btnAt > rtOpen
    && !composerSrc.slice(rtOpen, btnAt).includes("generateBtn")
    && composerSrc.slice(rtOpen, btnAt).includes("</div>"), "按钮在参数行外");
check("CSS：.composerFooter .footerTools flex 分列、.generateBtn 独立成列 flex:0 0 auto",
  /\.outfitWorkflowEmbedded \.composerFooter \.footerTools\s*\{[^}]*display:\s*flex/.test(workflowCssSrc)
    && /\.outfitWorkflowEmbedded \.composerFooter \.generateBtn\s*\{[^}]*flex:\s*0 0 auto/.test(workflowCssSrc), "分列+按钮 flex:0 0 auto");
check("CSS：.rightTools 隐藏横滚条但保留 overflow-x:auto（参数行高度恒定、切页不跳）",
  /\.outfitWorkflowEmbedded \.composerFooter \.rightTools\s*\{[^}]*scrollbar-width:\s*none/.test(workflowCssSrc)
    && /\.outfitWorkflowEmbedded \.composerFooter \.rightTools::-webkit-scrollbar\s*\{[^}]*display:\s*none/.test(workflowCssSrc)
    && /\.outfitWorkflowEmbedded \.rightTools\s*\{[^}]*overflow-x:\s*auto/.test(workflowCssSrc), "scrollbar-width:none + overflow-x:auto");

// ---- T4-a（V190）：快捷生成侧现状事实断言（契约 §10「Workspace Frame 三段语义契约」） ----
// 仅断言当前已成立的事实，不新增尚未落地的要求（如 min-height:280px / margin-top:auto / flex:1 1 auto），
// 否则 A 路当场判红；B 路（FORCED_SIZES / OBSERVE_SIZES / assertSize / dpr 校准）与既有 16 条批量侧断言逐字不动。
// 快捷生成侧为固定定位悬浮面板：外壳/画板均无纵滚、唯一纵向滚动容器为 .galleryStrip、.composer 无内部纵滚
// ⇒ 现状满足「整页仅一条主滚动条」（与批量侧待 T4-b 改造对照，见契约 §10.3）。
check("源码：快捷侧外壳无纵向滚动（.appShell 含 overflow:hidden）",
  /\.appShell\s*\{[^}]*overflow:\s*hidden/.test(stylesCssSrc), "overflow:hidden");
check("源码：快捷侧主体区无纵滚（.quickgenArea 含 overflow:hidden）",
  /\.quickgenArea\s*\{[^}]*overflow:\s*hidden/.test(stylesCssSrc), "overflow:hidden");
check("源码：快捷侧画板区无纵滚且三段 grid（.canvasBoard 含 overflow:hidden + grid-template-rows:minmax(0,1fr) auto）",
  /\.canvasBoard\s*\{[^}]*overflow:\s*hidden/.test(stylesCssSrc)
    && /\.canvasBoard\s*\{[^}]*grid-template-rows:\s*minmax\(0,\s*1fr\)\s+auto/.test(stylesCssSrc), "两段 grid + hidden");
check("源码：快捷侧结果区唯一主滚（.galleryStrip 含 min-height:0 + overflow-y:auto + scrollbar-gutter:stable）",
  /\.galleryStrip\s*\{[^}]*min-height:\s*0/.test(stylesCssSrc)
    && /\.galleryStrip\s*\{[^}]*overflow-y:\s*auto/.test(stylesCssSrc)
    && /\.galleryStrip\s*\{[^}]*scrollbar-gutter:\s*stable/.test(stylesCssSrc), "唯一主滚");
check("源码：快捷侧结果区顶部对齐（.galleryStrip 含 align-content:flex-start）",
  /\.galleryStrip\s*\{[^}]*align-content:\s*flex-start/.test(stylesCssSrc), "flex-start");
check("源码：快捷侧操作区不内滚（.composer 主规则不含 overflow-y:auto）",
  !/\.composer\s*\{[^}]*overflow-y:\s*auto/.test(stylesCssSrc), "无内部纵滚");

// ---------------------------------------------------------------- B. 浏览器级
// P1-001 §8.2：4 档强制 + 1024×768 观察档（观察档不纳入强制失败，仅记录溢出/按钮可见性）
const FORCED_SIZES = [[1920, 1080], [1600, 900], [1366, 768], [1280, 720]];
const OBSERVE_SIZES = [[1024, 768]];

let child = null;
let facts = null;          // { "1920x1080": {...}, ... }
let browserReason = "";
try {
  child = spawn(NODE, [path.join("server", "index.js")], {
    cwd: ROOT,
    stdio: ["ignore", "ignore", "ignore"],
    env: {
      ...process.env,
      // 显式 dev：dist/.release-mode（secure-win-release.mjs:208 构建时写入）会经 server/index.js:13-21 把实例强制成 production，测试实例必须免疫（V122）
      NODE_ENV: "development",
      JINGYIN_VITE_CACHE_DIR: path.join(process.cwd(), "tmp", `vite-cache-verify-${APP_PORT}`),
      PORT: String(APP_PORT),
      JINGYIN_PORT_FALLBACK_LIMIT: "0",
      JINGYIN_NO_BROWSER: "1"
    }
  });
  installExitCleanup({ getChild: () => child });
  const deadline = Date.now() + 30000;
  let healthy = false;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${APP_PORT}/api/health`);
      if (res.ok) { healthy = true; break; }
    } catch { /* 还没起来 */ }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  if (!healthy) throw new Error("V11 测试实例未起来");

  if (!existsSync(CLI)) {
    browserReason = "tabbit-cli 不存在，跳过浏览器部分";
  } else {
    // P1-001：逐档尺寸分别发起一次 CLI 调用。每档独立进程、独立 playwright 实例，
    // 各自冷加载（dev 首次 Vite 编译 + React 挂载 + 标签页渲染），确保 tab 枚举完整。
    // 单档回执体量小（run() 已压缩为紧凑对象）可被 tabbit-cli 内联返回，解析稳定。
    // 注意：5 档合并进同一次 CLI 调用会触发 180s 硬超时被杀（EVALUATION_TIMEOUT）。
    const allSizes = [...FORCED_SIZES, ...OBSERVE_SIZES];
    const runSingle = async ([w, h]) => {
      const program = `
page.setDefaultNavigationTimeout(150000);
await page.goto("http://127.0.0.1:${APP_PORT}/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(5000);
// 2026-11-04（消除假绿）：tabbit 浏览器 devicePixelRatio=0.8，setViewportSize 传的是设备像素，
// 直接传 (${w},${h}) 会得到 ${w}/0.8 × ${h}/0.8 CSS 像素（窄屏档被放大 25%，从未真正测到窄屏）。
// 先读 dpr，按 目标CSS尺寸 × dpr 反算设备像素，再用探针回传的 vw/vh 硬断言校准结果，
// 确保「100% 缩放」是真实被测状态，而不是名义尺寸。
const dpr = await page.evaluate(() => window.devicePixelRatio || 1);
await page.setViewportSize({ width: Math.round(${w} * dpr), height: Math.round(${h} * dpr) });
await page.goto("http://127.0.0.1:${APP_PORT}/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(6000);
return await page.evaluate(async () => {
  const mod = await import("/scripts/verify/composer-stable-height-page.jsx?v=" + Date.now());
  return await mod.run();
});
`;
      const stdout = await new Promise((resolve) => {
        const cli = spawn(CLI, [
          "nodejs",
          "--task", `V11 composer height ${w}x${h}`,
          "--request-id", `composerheight-${process.pid}-${w}x${h}`,
          "--timeout-ms", "180000"
        ], { windowsHide: true });
        let buffer = "";
        cli.stdout.on("data", (c) => { buffer += String(c); });
        cli.stderr.on("data", (c) => { buffer += String(c); });
        cli.on("error", () => resolve(""));
        cli.on("close", () => resolve(buffer));
        try { cli.stdin.write(program); cli.stdin.end(); } catch { resolve(""); }
      });
      const start = stdout.indexOf("{\"result\"");
      if (start < 0) return { sizeKey: `${w}x${h}`, raw: stdout.slice(0, 200) };
      const tail = stdout.slice(start);
      for (let cut = tail.lastIndexOf("}"); cut > 0; cut -= 1) {
        if (tail[cut] !== "}") continue;
        try {
          const v = JSON.parse(tail.slice(0, cut + 1))?.result?.value;
          return { sizeKey: `${w}x${h}`, value: v };
        } catch { /* 继续往前找 */ }
      }
      return { sizeKey: `${w}x${h}`, raw: stdout.slice(0, 200) };
    };
    const sizeFacts = {};
    for (const size of allSizes) {
      const r = await runSingle(size);
      if (r.value && typeof r.value === "object") sizeFacts[r.sizeKey] = r.value;
      else browserReason = `浏览器回执无法解析（${r.sizeKey}，${(r.raw || "空").trim()}）`;
    }
    facts = sizeFacts;
  }
} catch (error) {
  browserReason = error instanceof Error ? error.message : String(error);
} finally {
  await stopChild(child);
}

function assertSize(sizeKey, f, forced, wantW, wantH, module) {
  const tag = forced ? `[${sizeKey}-强制]` : `[${sizeKey}-观察]`;
  if (!f || typeof f !== "object") { check(`浏览器${tag}：探针未返回`, false, "无数据"); return; }
  // V192（T4 第三刀）：快捷侧字段归一化，使下方 8 条断言逐字不动；仅 :223/:224 名称按模块分流。
  // 快捷侧无 .outfitWorkflowEmbedded / 无动态页签，用「切到批量再切回快捷」的 switchBackCanvasVisible 等价替代。
  const ef = module === "quick"
    ? {
        ...f,
        foundEmbed: f.switchBackCanvasVisible === true,
        tabCount: f.switchBackCanvasVisible === true ? 1 : 0,
        stickyTopSpread: f.quickRightToolsSpread,
        stickyBottomSpread: f.quickRightToolsSpread,
        rightToolsSpread: f.quickRightToolsSpread,
        composerVisible: f.quickComposerVisible,
        btnBad: f.quickBtnBad
      }
    : f;
  const {
    foundEmbed, tabCount, stickyTopSpread, stickyBottomSpread,
    rightToolsSpread, scrollContainerCount, pageScroll, btnBad, composerVisible, vw, vh, dpr
  } = ef;

  // 2026-11-04：先证明这一档真的在「100% 缩放的目标 CSS 视口」上跑，否则后面全绿也是假绿。
  check(`浏览器${tag}：真实 CSS 视口已校准到 100% 缩放 ${wantW}×${wantH}（±2px）`,
    typeof vw === "number" && typeof vh === "number"
      && Math.abs(vw - wantW) <= 2 && Math.abs(vh - wantH) <= 2,
    `vw=${vw} vh=${vh} dpr=${dpr} 目标=${wantW}×${wantH}`);
  if (module === "quick") {
    check(`浏览器${tag}：[快捷] 模块已切换且 .canvasBoard 可见（替代 foundEmbed）`,
      foundEmbed === true, `switchBackCanvasVisible=${f.switchBackCanvasVisible} quickFoundCanvas=${f.quickFoundCanvas}`);
    check(`浏览器${tag}：[快捷] 切到批量再切回快捷（模块切换断言替代 tabCount>0）`,
      tabCount > 0, `switchBackCanvasVisible=${f.switchBackCanvasVisible}`);
  } else {
    check(`浏览器${tag}：进入批量生成并找到 .outfitWorkflowEmbedded`, foundEmbed === true, `foundEmbed=${foundEmbed}`);
    check(`浏览器${tag}：动态枚举到功能页（共 ${tabCount} 页）`, tabCount > 0, `tabCount=${tabCount}`);
  }

  // 2026-11-04：dock 改为 flex:1 填满剩余空间，高度本就应随结果区内容伸缩（填空白）。
  // 反跳动的真正保证是「底边恒定贴视口底」，故此处断言底边极差 ≤ 2px，不再断言高度恒定。
  check(`浏览器${tag}：切页操作条底边恒定贴视口底（.composerStickyControls.bottom 极差 ≤ 2px）`,
    stickyBottomSpread !== null && stickyBottomSpread <= 2, `spread=${stickyBottomSpread}`);
  check(`浏览器${tag}：切页操作条顶边恒定（.composerStickyControls.top 极差 ≤ 2px）`,
    stickyTopSpread !== null && stickyTopSpread <= 2, `spread=${stickyTopSpread}`);
  check(`浏览器${tag}：切页 .rightTools 顶边恒定（极差 ≤ 2px）`,
    rightToolsSpread !== null && rightToolsSpread <= 2, `spread=${rightToolsSpread}`);
  // 用户核心诉求：100% 缩放下 dock 整块贴底、生成按钮无需滚动条即可见。
  check(`浏览器${tag}：dock 整块可见、无需滚动（底边 ≤ 视口高 vh=${vh}）`,
    composerVisible === true, `composerVisible=${composerVisible}`);

  check(`浏览器${tag}：各页 .generateBtn 在视口内、不被遮挡、未隐藏`,
    btnBad === 0, `btnBad=${btnBad}`);

  check(`浏览器${tag}：内部滚动容器数 ≤ 4（结果区 + 配置区 + 嵌套文本域，dock 填满后自滚属正常）`,
    scrollContainerCount <= 4, `count=${scrollContainerCount}`);
  if (forced) {
    check(`浏览器${tag}：无整页滚动`, pageScroll === false, `pageScroll=${pageScroll}`);
  } else {
    // 观察档：横向溢出/双滚动条属预期，仅记录不判红；仅当生成按钮真正被隐藏/遮挡才算回归
    check(`浏览器${tag}：生成按钮仍可见（观察档允许横向溢出）`,
      btnBad === 0, `scrollContainerCount=${scrollContainerCount} pageScroll=${pageScroll} btnBad=${btnBad}`);
  }
}

if (facts) {
  // V192（T4 第三刀）：5 档窗口 × 两模块（批量侧 / 快捷侧）矩阵。
  const allSizes = [...FORCED_SIZES, ...OBSERVE_SIZES];
  for (const [w, h] of allSizes) {
    const forced = FORCED_SIZES.some(([fw, fh]) => fw === w && fh === h);
    assertSize(`${w}x${h}`, facts[`${w}x${h}`], forced, w, h, "batch");
    assertSize(`${w}x${h}`, facts[`${w}x${h}`], forced, w, h, "quick");
  }
} else {
  check("浏览器探针未执行", false, browserReason || "未知原因");
}

const failed = results.filter((item) => !item.pass);
console.log(JSON.stringify({
  ok: failed.length === 0,
  total: results.length,
  passed: results.length - failed.length,
  failed: failed.length,
  browser: facts ? "ran" : `skipped: ${browserReason}`,
  results
}, null, 2));
if (failed.length > 0) process.exitCode = 1;
