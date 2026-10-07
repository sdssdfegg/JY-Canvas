// RF-081 四处 grep：对补齐的小函数逐个查裁决记录。
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(".");
const cleared = new Set([
  "prepareOutpaintUploadCanvas","makeOutfitPage","composeOutpaintOriginalRegionBlob","ensureWorkflowPages",
  "themeToVars","composeOutfitLocalEditBlob","composeCropReturnBlob","workflowModeFromPage","localPasteDiagnosticSummary",
  "hydrateDraftImageItem","readSettings","serializeDraftImageItem","normalizeOutfitPageSettings","dedupeSingletonWorkflowPages",
  "createAsyncLimiter","hydrateDraftPage","cropReturnDiagnosticSummary","readOutfitPages","ensureOutfitUploadCanvasRatio",
  "createImageItem","makeRecolorPage"
]);
const flagged = new Set(["processImageFileWithMeta","loadOutfitPromptPresets","buildTasks","modelForIndex"]);

// 读取 87 真顶层名字
const data = JSON.parse(readFileSync("scripts/dev/rf081-result.json","utf8"));
const candidates = data.trueTop.map(t => t.name).filter(n => !cleared.has(n) && !flagged.has(n));

// 四处来源
const docFiles = ["REFACTOR_TICKETS.md","REFACTOR-冷启动.md",".workbuddy/memory/MEMORY.md","MEMORY.md"].map(f => join(ROOT,f)).filter(f => { try{readFileSync(f);return true;}catch{return false;} });

function walkShared(dir, out=[]) {
  let ents; try{ents=readdirSync(dir);}catch{return out;}
  for(const e of ents){ const p=join(dir,e); let st; try{st=statSync(p);}catch{continue;}
    if(st.isDirectory()){ if(e==="node_modules"||e===".git") continue; walkShared(p,out);}
    else if(/\.js$/.test(e)) out.push(p);
  } return out;
}
const sharedFiles = walkShared(join(ROOT,"src/shared"));

function grepIn(file, name) {
  let txt; try{txt=readFileSync(file,"utf8");}catch{return 0;}
  const re = new RegExp("(^|[^A-Za-z0-9_$])"+name.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"($|[^A-Za-z0-9_$])","g");
  const m = txt.match(re); return m ? m.length : 0;
}

console.log(`待查候选: ${candidates.length} 个`);
console.log(`契约文档: ${docFiles.length} 个 | src/shared js: ${sharedFiles.length} 个\n`);

const hits = [];
for(const name of candidates) {
  const docHits = docFiles.map(f => ({f, n: grepIn(f,name)})).filter(x=>x.n>0);
  const sharedHits = sharedFiles.map(f => ({f, n: grepIn(f,name)})).filter(x=>x.n>0);
  if(docHits.length || sharedHits.length) hits.push({name, docHits, sharedHits});
}

if(hits.length===0) {
  console.log("✅ 四处 grep 全部零命中 —— 64 个小函数均为真新债，无裁决记录。");
} else {
  console.log(`⚠ 命中 ${hits.length} 个，需停手报统筹:\n`);
  for(const h of hits){
    console.log(`  ${h.name}:`);
    for(const d of h.docHits) console.log(`    doc  ${d.n}  ${d.f.split("\\").pop()}`);
    for(const s of h.sharedHits) console.log(`    shared ${s.n}  ${s.f.split("\\").pop()}`);
  }
}

// 输出候选清单便于核对
console.log(`\n== 候选全清单（${candidates.length}）==`);
console.log(candidates.join(", "));
