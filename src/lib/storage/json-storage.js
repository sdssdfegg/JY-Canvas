export function readJsonStorage(key, fallback = null) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") || fallback;
  } catch {
    return fallback;
  }
}

export function writeJsonStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

// 与 writeJsonStorage 同一套写入，**但把异常带出来**（返回 { ok, error }）。
// 加它的原因：writeJsonStorage 吞异常只回 false，调用方拿不到"为什么失败"，
// 于是配额写满这类故障会变成**静默丢数据**（画布以为存成功了，刷新后全没了）。
// 这里只新增函数、不改 writeJsonStorage 的既有语义，老调用点行为不变。
export function writeJsonStorageDetailed(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return { ok: true, error: null };
  } catch (error) {
    return { ok: false, error };
  }
}

export function removeStorageItem(key) {
  try {
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
