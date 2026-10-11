// TankGauge: a block water tank that fills row by row — the boot loader for City3D (no spinners).
// Each filled row is one completed boot step; here it animates with CSS as a calm
// placeholder while the 3D bundle and scene load. Static under prefers-reduced-motion.
import type { JSX } from "react";
import styles from "./TankGauge.module.css";

export function TankGauge({ label = "Loading the city…" }: { label?: string }): JSX.Element {
  return (
    <div className={styles.wrap} role="status" aria-live="polite">
      <div className={styles.tank} aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} className={styles.row} style={{ animationDelay: `${i * 0.18}s` }} />
        ))}
      </div>
      <span className={styles.label}>{label}</span>
    </div>
  );
}
