// V49 任务计时下沉：自管 500ms 局部 tick，替换原先顶层的 setNowTick（outfit-workflow 侧的 clockNow 由 V49 收口），
// 避免「有任务在跑时每 500ms 强制巨石全树重渲染」导致的打字/交互卡顿。
//
// 原定义位于 src/main.jsx（V46.1 引入）。V46 低端机降配阶段把它抽到 src/shared/ui/，
// 作为 main.jsx 巨石拆分的「第一块砖」：纯计时展示、仅依赖共享的 formatMs，零闭包依赖。
import { useEffect, useState } from "react";
import { formatMs } from "../../lib/format/index.js";

function ElapsedTimer({ startedAt }) {
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    setTick(Date.now());
    const timer = window.setInterval(() => setTick(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [startedAt]);
  const started = startedAt || tick;
  return <>{formatMs(tick - started)}</>;
}

export { ElapsedTimer };
