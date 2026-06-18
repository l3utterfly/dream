import { useEffect, useRef, useState } from "react";

export function useCountUp(value: number, ms = 700): number {
  const [n, setN] = useState(0);
  const prev = useRef(0);

  useEffect(() => {
    const from = prev.current;
    const to = value;
    const start = performance.now();
    let raf = 0;

    const tick = (time: number) => {
      const progress = Math.min(1, (time - start) / ms);
      const eased = 1 - Math.pow(1 - progress, 3);

      setN(from + (to - from) * eased);

      if (progress < 1) raf = requestAnimationFrame(tick);
      else prev.current = to;
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);

  return n;
}
