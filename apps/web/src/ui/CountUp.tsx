// A number that counts up (ease-out, 600 ms) from its previous value. Static under reduced motion.
import { useEffect, useRef, useState, type JSX } from "react";

const reducedMotion =
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function CountUp({
  value,
  format,
  className,
  from: start,
}: {
  value: number;
  format?: (n: number) => string;
  className?: string;
  /** first value to count from (default: the value itself, so nothing animates on mount) */
  from?: number;
}): JSX.Element {
  const [shown, setShown] = useState(start ?? value);
  // Count from what is on screen (not the last target), so a re-run effect (React dev mode runs
  // effects twice) still animates to the new value.
  const onScreen = useRef(start ?? value);
  useEffect(() => {
    const from = onScreen.current;
    if (from === value) return;
    if (reducedMotion) {
      const raf = requestAnimationFrame(() => {
        onScreen.current = value;
        setShown(value);
      });
      return () => cancelAnimationFrame(raf);
    }
    const t0 = performance.now();
    const DURATION = 600;
    let raf = 0;
    const stepFrame = (now: number): void => {
      const k = Math.min(1, (now - t0) / DURATION);
      const next = Math.round(from + (value - from) * (1 - Math.pow(1 - k, 3)));
      onScreen.current = next;
      setShown(next);
      if (k < 1) raf = requestAnimationFrame(stepFrame);
    };
    raf = requestAnimationFrame(stepFrame);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span className={className}>{format ? format(shown) : shown}</span>;
}
