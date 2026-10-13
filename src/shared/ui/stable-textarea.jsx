// V46.3 输入 memo 下沉：受控 textarea 用 ref 持有最新 onChange / onPointerDown，
// 渲染时改用 useMemo([]) 产出的「稳定包装函数」，并配自定义 memo 比较器刻意忽略
// 函数 prop 身份。这样父级（main.jsx 巨石）因其它 state 变动重渲时，value 未变的
// 输入框可跳过重渲，缓解「别的输入框打字也拖着本框重渲」的卡顿。
// 若只套 React.memo 而不忽略 handler 身份，inline arrow 每次都是新引用、memo 永远
// 失效（零收益陷阱），故必须 ref + 自定义比较器双管齐下。
//
// 原定义位于 src/main.jsx（V46.3 引入）。V46 低端机降配阶段把它抽到 src/shared/ui/，
// 作为 main.jsx 巨石拆分的「第一块砖」：纯展示、零闭包依赖，任何父级可安全复用。
import React, { useMemo, useRef } from "react";

const StableTextarea = React.memo(
  function StableTextarea({
    value,
    onChange,
    onPointerDown,
    className,
    placeholder,
    disabled,
    readOnly,
    rows,
    ...rest
  }) {
    const onChangeRef = useRef(onChange);
    const onPointerDownRef = useRef(onPointerDown);
    onChangeRef.current = onChange;
    onPointerDownRef.current = onPointerDown;

    const stableOnChange = useMemo(
      () => (event) => { if (onChangeRef.current) onChangeRef.current(event); },
      []
    );
    const stableOnPointerDown = useMemo(
      () => (event) => { if (onPointerDownRef.current) onPointerDownRef.current(event); },
      []
    );

    return (
      <textarea
        className={className}
        placeholder={placeholder}
        disabled={disabled}
        readOnly={readOnly}
        rows={rows}
        value={value}
        onChange={stableOnChange}
        onPointerDown={onPointerDownRef.current ? stableOnPointerDown : undefined}
        {...rest}
      />
    );
  },
  (prev, next) => {
    // 仅当「非 handler 的渲染相关 prop」真正变化时才重渲；
    // onChange / onPointerDown 身份变化被刻意忽略（已通过 ref 持有最新实现）。
    // 其余 prop（含未来可能新增的 style / maxLength 等）一律做值比较，保证行为正确。
    const prevKeys = Object.keys(prev);
    if (prevKeys.length !== Object.keys(next).length) return false;
    for (const key of prevKeys) {
      if (key === "onChange" || key === "onPointerDown") continue;
      if (prev[key] !== next[key]) return false;
    }
    return true;
  }
);

export { StableTextarea };
