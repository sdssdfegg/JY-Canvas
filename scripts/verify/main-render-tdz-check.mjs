// 渲染期 TDZ 门禁（BUG02 同源防护）。
//
// 为什么需要它：build / 语法检查 / react/jsx-no-undef 都抓不到「const/let 的前向引用（TDZ）」。
// 这类代码在浏览器首次执行 App() 时才抛 ReferenceError，导致整页白屏、#root 留空，
// 而 check-launcher 只验证启动脚本与 /api/health，发现不了。BUG02 就是 useSettingsState 在
// 其依赖的 addEvent（由 useMainHandlers 解构产出）声明之前被调用，首屏必崩。
//
// 做什么：用仓库已有的 espree 解析 src/main.jsx，定位 App() 函数体，收集其直接作用域里的
// const/let 绑定（含解构），然后**只扫描渲染期立即求值的表达式**里对这些绑定的前向引用：
//   - hook / 普通函数调用的参数里直接读取后置 const；
//   - 对象 / 数组字面量里直接读取后置 const（含 useMemo/useEffect/useCallback 的**依赖数组**，
//     因为依赖数组在渲染期求值，是真实 TDZ 来源）；
//   - JSX 属性 / 条件表达式里读取后置 const。
// 不进入嵌套的普通函数、箭头函数、class 方法体（那里是延迟执行的闭包，如 useEffect 回调体）。
//
// 不误报：function declaration 的提升语义（声明前调用不报）；非 computed 的对象 key、成员属性名、
// JSX 标签名不算变量引用；仅在空依赖 effect 回调体内读取后声明 const 不误报。
//
// 自证：每次运行内置 4 条负向对照（见 SELF_TESTS），自测不过则门禁自身判红。
//
// 用法：node scripts/verify/main-render-tdz-check.mjs

import { parse as espreeParse } from "espree";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
// 默认扫描 src/main.jsx；可用 TDZ_TARGET 指向临时夹具做负向对照（不影响 run-all 正常调用）。
const TARGET = process.env.TDZ_TARGET ? path.resolve(process.env.TDZ_TARGET) : path.join(ROOT, "src", "main.jsx");

const results = [];
function check(name, pass, detail = "") {
  results.push({ name, pass: Boolean(pass), detail: String(detail) });
}

// ---------- espree 解析 ----------
function parseCode(code) {
  return espreeParse(code, {
    ecmaVersion: "latest",
    sourceType: "module",
    ecmaFeatures: { jsx: true },
    loc: true
  });
}

// ---------- 找到 App 函数 ----------
function findApp(ast) {
  let found = null;
  const visit = (node) => {
    if (!node || typeof node.type !== "string" || found) return;
    if (node.type === "FunctionDeclaration" && node.id && node.id.name === "App") { found = node; return; }
    if (node.type === "VariableDeclarator" && node.id && node.id.name === "App" && node.init && /Function/.test(node.init.type)) { found = node.init; return; }
    for (const key of Object.keys(node)) {
      if (["parent", "loc", "range", "start", "end"].includes(key)) continue;
      const child = node[key];
      if (Array.isArray(child)) child.forEach((c) => c && typeof c.type === "string" && visit(c));
      else if (child && typeof child.type === "string") visit(child);
    }
  };
  visit(ast);
  return found;
}

const FUNCTION_TYPES = new Set(["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"]);
const isFunctionNode = (n) => FUNCTION_TYPES.has(n.type);

/**
 * 在 App 函数体里收集：① 直接作用域的 const/let 绑定（含解构），② 渲染期标识符引用。
 * 关键：遇到嵌套函数节点**不再下钻**（函数体是延迟执行的闭包，不扫描），但依赖数组等
 * 函数参数之外的表达式仍会被扫到（它们是调用点的直接子节点，不是函数体）。
 * function declaration 视为声明行之前也可用（提升），声明位记为 0，避免误报。
 */
function analyzeAppBody(appNode) {
  const bindings = new Map(); // name -> 最早声明位置 {line, column}
  const references = [];      // { name, line, column }

  const recordBinding = (name, line, column) => {
    const prev = bindings.get(name);
    if (prev === undefined || line < prev.line || (line === prev.line && column < prev.column)) {
      bindings.set(name, { line, column });
    }
  };

  // 收集解构/数组模式里的所有绑定名
  const collectPatternNames = (pattern, line, column) => {
    if (!pattern) return;
    if (pattern.type === "Identifier") {
      recordBinding(pattern.name, line, column);
    } else if (pattern.type === "ObjectPattern") {
      for (const prop of pattern.properties) {
        if (prop.type === "RestElement") collectPatternNames(prop.argument, line, column);
        else collectPatternNames(prop.value, line, column);
      }
    } else if (pattern.type === "ArrayPattern") {
      for (const el of pattern.elements) {
        if (el && el.type === "RestElement") collectPatternNames(el.argument, line, column);
        else collectPatternNames(el, line, column);
      }
    } else if (pattern.type === "AssignmentPattern") {
      collectPatternNames(pattern.left, line, column);
    } else if (pattern.type === "RestElement") {
      collectPatternNames(pattern.argument, line, column);
    }
  };

  const onEnter = (node, parent) => {
    if (!node || typeof node.type !== "string") return;
    // 绑定收集（仅 const/let；var 提升、function 提升另算）。
    // 注意：kind 在父节点 VariableDeclaration 上，VariableDeclarator 自身无 kind。
    if (node.type === "VariableDeclarator") {
      const vd = parent && parent.type === "VariableDeclaration" ? parent : null;
      if (vd && (vd.kind === "const" || vd.kind === "let")) {
        const s = node.loc.start;
        collectPatternNames(node.id, s.line, s.column);
      }
    } else if (node.type === "FunctionDeclaration" && node.id) {
      recordBinding(node.id.name, 0, 0); // 提升：声明前可用
    }
    // 引用收集（仅 Identifier；JSXIdentifier 是标签/属性名，不算）
    if (node.type === "Identifier") {
      if (parent) {
        // 绑定声明位置（整个 const 模式 / 函数名）
        if (parent.type === "VariableDeclarator" && parent.id === node) return;
        if (parent.type === "FunctionDeclaration" && parent.id === node) return;
        // 非 computed 对象 key
        if (parent.type === "Property" && parent.computed === false && parent.key === node) return;
        // 非 computed 成员属性名
        if (parent.type === "MemberExpression" && parent.computed === false && parent.property === node) return;
        // import 说明符里的名字
        if (parent.type === "ImportSpecifier" || parent.type === "ImportDefaultSpecifier" || parent.type === "ImportNamespaceSpecifier") return;
        if (parent.type === "ImportAttribute") return;
      }
      const s = node.loc.start;
      references.push({ name: node.name, line: s.line, column: s.column });
    }
  };

  // 递归下钻，但遇到函数节点不再下钻其子女（函数体/参数均为延迟执行）
  const walk = (node, parent) => {
    if (!node || typeof node.type !== "string") return;
    onEnter(node, parent);
    if (isFunctionNode(node)) return; // 不下钻嵌套函数
    for (const key of Object.keys(node)) {
      if (["parent", "loc", "range", "start", "end"].includes(key)) continue;
      const child = node[key];
      if (Array.isArray(child)) child.forEach((c) => c && typeof c.type === "string" && walk(c, node));
      else if (child && typeof child.type === "string") walk(child, node);
    }
  };

  if (appNode.body && appNode.body.type === "BlockStatement") {
    for (const stmt of appNode.body.body) walk(stmt, appNode.body);
  }

  // 计算违规：渲染期引用早于绑定声明位置（按 行→列 排序）
  const violations = [];
  for (const ref of references) {
    if (!bindings.has(ref.name)) continue;
    const decl = bindings.get(ref.name);
    const before = ref.line < decl.line || (ref.line === decl.line && ref.column < decl.column);
    if (before) {
      violations.push({ name: ref.name, refLine: ref.line, refColumn: ref.column, declLine: decl.line });
    }
  }
  return { violations, bindingCount: bindings.size, refCount: references.length };
}

// ---------- 负向对照（内置自测，必须用多行以体现行序） ----------
const SELF_TESTS = [
  {
    label: "自测1：渲染期直接调用读取后置 const 必须红",
    code: "function App(){\n  consume(late);\n  const late = 1;\n}",
    expectViolation: true
  },
  {
    label: "自测2：依赖数组里读取后置 const 必须红（渲染期求值）",
    code: "function App(){\n  useEffect(() => consume(late), [late]);\n  const late = 1;\n}",
    expectViolation: true
  },
  {
    label: "自测3：仅在空依赖 effect 回调体内读取后声明 const 不得误报",
    code: "function App(){\n  useEffect(() => consume(late), []);\n  const late = 1;\n}",
    expectViolation: false
  },
  {
    label: "自测4：function declaration 提升，声明前调用不得误报",
    code: "function App(){\n  function helper() {}\n  helper();\n}",
    expectViolation: false
  }
];

function runSelfTests() {
  let allPass = true;
  for (const t of SELF_TESTS) {
    let got;
    try {
      const ast = parseCode(t.code);
      const app = findApp(ast);
      got = app ? analyzeAppBody(app).violations.length > 0 : null;
    } catch (e) {
      got = `解析异常: ${e.message}`;
    }
    const pass = got === t.expectViolation;
    if (!pass) allPass = false;
    check(t.label, pass, `期望 ${t.expectViolation ? "红" : "不报"}，实际 ${got === null ? "未找到 App" : got}`);
  }
  return allPass;
}

// ---------- 主流程 ----------
check("自测整体通过", runSelfTests(), "4/4 负向对照");

let realViolations = [];
if (!existsSync(TARGET)) {
  check("目标文件 src/main.jsx 存在", false, TARGET);
} else {
  check("目标文件 src/main.jsx 存在", true);
  let app = null;
  try {
    const ast = parseCode(readFileSync(TARGET, "utf8"));
    app = findApp(ast);
  } catch (e) {
    check("src/main.jsx 可被 espree 解析", false, e.message);
  }
  if (app) {
    check("在 src/main.jsx 中找到 App()", true);
    const { violations } = analyzeAppBody(app);
    realViolations = violations;
    if (violations.length === 0) {
      check("生产扫描：App() 渲染期无 const/let 前向引用（TDZ）", true, "violations=0");
    } else {
      const detail = violations
        .map((v) => `${v.name} 在 ${v.refLine} 行引用，声明于 ${v.declLine} 行`)
        .join("；");
      check("生产扫描：App() 渲染期无 const/let 前向引用（TDZ）", false, detail);
    }
  } else {
    check("在 src/main.jsx 中找到 App()", false, "未定位到 App 函数");
  }
}

const failed = results.filter((r) => !r.pass);
console.log(JSON.stringify({
  ok: failed.length === 0,
  total: results.length,
  passed: results.length - failed.length,
  failed: failed.length,
  violations: realViolations,
  failures: failed,
  results
}, null, 2));
process.exitCode = failed.length === 0 ? 0 : 1;
