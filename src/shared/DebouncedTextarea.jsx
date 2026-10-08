import { useEffect, useRef, useState } from "react";

export default function DebouncedTextarea({
  value = "",
  onChange,
  commitDelay = 260,
  onBlur,
  onCompositionStart,
  onCompositionEnd,
  ...props
}) {
  const [draft, setDraft] = useState(String(value ?? ""));
  const timerRef = useRef(null);
  const composingRef = useRef(false);
  const latestCommittedRef = useRef(String(value ?? ""));

  // 外部值回灌。⚠️ 用户输入过程中**任何一次回灌**都是有害的，这里挡两道（2026-10-05 实测「光标跳末尾」）：
  //
  // ① 输入法组字期间一律不回灌。组字中写 value 会打断组字：候选框消失、光标被甩到末尾，
  //    而**已经上屏的字一个都不会少** —— 这正是现象签名（只跳光标、不丢字）。
  // ② value 恰等于「我们自己最后提交出去的那一份」时也不回灌：那只是父组件的回声。
  //    提交是防抖的（默认 260ms），而父组件（App / OutfitWorkflow 这种几千行的巨物）
  //    重渲染可达上百毫秒；用户在这段窗口继续打字时 draft 已领先于 value，
  //    无条件回灌会把刚敲的字符抹掉、并把光标甩到末尾。
  //
  // 真外部变更（换装/精修的「按设置重新算」、草稿加载回写）其值既不等于最后一次提交、
  // 也不发生在组字中，照旧正常回灌，行为不变。
  useEffect(() => {
    const next = String(value ?? "");
    if (composingRef.current) return;
    if (next === latestCommittedRef.current) return;
    latestCommittedRef.current = next;
    setDraft((current) => (current === next ? current : next));
  }, [value]);

  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
  }, []);

  function clearTimer() {
    if (!timerRef.current) return;
    window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }

  function commit(nextValue) {
    const next = String(nextValue ?? "");
    clearTimer();
    if (next === latestCommittedRef.current) return;
    latestCommittedRef.current = next;
    onChange?.(next);
  }

  function scheduleCommit(nextValue) {
    clearTimer();
    timerRef.current = window.setTimeout(() => commit(nextValue), commitDelay);
  }

  return (
    <textarea
      {...props}
      value={draft}
      onChange={(event) => {
        const next = event.target.value;
        setDraft(next);
        if (!composingRef.current) scheduleCommit(next);
      }}
      onCompositionStart={(event) => {
        composingRef.current = true;
        clearTimer();
        onCompositionStart?.(event);
      }}
      onCompositionEnd={(event) => {
        composingRef.current = false;
        const next = event.currentTarget.value;
        setDraft(next);
        scheduleCommit(next);
        onCompositionEnd?.(event);
      }}
      onBlur={(event) => {
        commit(event.currentTarget.value);
        onBlur?.(event);
      }}
    />
  );
}
