// prompts/detail-studio/core/fact-grading.js
//
// 商品事实分级：程序强制枚举 + 「unconfirmed 不得 publish / 禁止虚构」规则。
//
// 真相源：V4.0-详情创作工作区-阶段3A设计报告.md §3.6.1（四类，可枚举）。
// 执行单 V202 §3 B1 的 shorthand「user / inferred / needConfirm / forbidden」把「分级」与「规则」
// 混写在了一起——本模块按真相源落地为四类可枚举分级 + 一条独立程序强制规则（forbidden 语义），
// 而非第五个 grade。这样既满足「事实分级四类可枚举」验收，又不丢失「禁止擅自编造」红线。
//
// 纯函数、零依赖：只被服务端 planning 模块与本仓单测引用，不会进入 public 启动链。

/** 事实分级枚举（3A §3.6.1）。 */
export const FACT_GRADE = Object.freeze({
  USER: "user", // 用户明确提供
  VISIBLE: "visible", // 商品图可见、可合理推断
  INFERRED: "inferred", // 合理推断、需标注来源
  UNCONFIRMED: "unconfirmed" // 待用户确认，禁止擅自编造 / 发布
});

export const FACT_GRADES = Object.freeze(Object.values(FACT_GRADE));

/** 敏感字段：未经确认不得当作事实写进对外提示词（功效 / 参数 / 认证 / 材料 / 性能）。 */
export const SENSITIVE_FACT_FIELDS = Object.freeze([
  "efficacy",
  "parameter",
  "certification",
  "material",
  "performance"
]);

/** 一个事实项的结构约定（模型输出与程序校验共用）。 */
export function makeFact(key, value, grade, source = "", field = "") {
  return {
    key: String(key || ""),
    value: String(value == null ? "" : value),
    grade: FACT_GRADES.includes(grade) ? grade : FACT_GRADE.UNCONFIRMED,
    source: String(source || ""),
    field: String(field || "")
  };
}

/** 该分级能否进入「对外展示 / 生成提示词」的事实清单（unconfirmed 一律不能）。 */
export function isPublishableGrade(grade) {
  return grade === FACT_GRADE.USER || grade === FACT_GRADE.VISIBLE || grade === FACT_GRADE.INFERRED;
}

/** 单条事实是否合规：unconfirmed 一律不得 publish；已确认（user/visible/inferred）的敏感字段可作为事实。 */
export function isFactAllowed(fact) {
  if (!fact || typeof fact !== "object") return false;
  if (!FACT_GRADES.includes(fact.grade)) return false;
  // 敏感字段（功效/参数/认证/材料/性能）只有被标记为 unconfirmed 时才被禁——即「未确认不得包装成事实」；
  // 已确认（user 明确提供 / visible 商品图可见 / inferred 合理推断并已标注来源）的敏感字段是合法事实。
  if (fact.grade === FACT_GRADE.UNCONFIRMED) return false;
  return true;
}

/**
 * 校验一批事实，返回被禁止发布 / 违规的条目（供质检与落库前拦截）。
 * @param {Array} facts 事实项数组
 * @returns {{ blocked: Array, allowed: Array }}
 */
export function checkFactGrades(facts = []) {
  const list = Array.isArray(facts) ? facts : [];
  const blocked = [];
  const allowed = [];
  for (const fact of list) {
    if (isFactAllowed(fact)) allowed.push(fact);
    else blocked.push(fact);
  }
  return { blocked, allowed };
}

/** 校验一批事实的 grade 是否全部落在四类枚举内（防御模型乱写）。 */
export function validateFactGrades(facts = []) {
  const list = Array.isArray(facts) ? facts : [];
  const invalid = list.filter((fact) => !FACT_GRADES.includes(fact && fact.grade));
  return { valid: invalid.length === 0, invalid };
}
