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

  // 外部值回灌。⚠️ 这里必须挡住一个时序陷阱（2026-10-05 用户实测的「光标跳到末尾」）：
  // 提交是防抖的（默认 260ms）：commit() 把文本交给父组件后，父组件要重渲染才把新 value 传回来；
  // 而本项目父组件是 App / OutfitWorkflow 这种几千行的巨物，重渲染可能耗时上百毫秒。
  // 用户在这段窗口里继续打字时 draft 已经领先于 value —— 无条件回灌就会抹掉刚敲的字符、
  // 并把光标甩到末尾（用户看到的就是「打字打到一半突然跳到最后一个位置」）。
  // 判据：value 等于「我们自己最后提交出去的那一份」⇒ 只是父组件的回声，不回灌。
  useEffect(() => {
    const next = String(value ?? "");
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
