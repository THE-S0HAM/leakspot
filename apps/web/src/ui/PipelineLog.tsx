// PipelineLog: a truthful progress log. Each line is one real stage
// with a state — done [ ok ], active [ >> ] (blinks at 1 Hz, static under reduced motion), or pending
// [    ] (dim). The caller passes only stages that have actually happened; nothing here fakes progress.
import type { JSX } from "react";
import styles from "./PipelineLog.module.css";

export type LogLine = { text: string; state: "done" | "active" | "pending"; detail?: string };

export function PipelineLog({ lines }: { lines: LogLine[] }): JSX.Element {
  return (
    <div className={styles.log} role="status" aria-live="polite">
      {lines.map((line, i) => (
        <div key={i} className={`${styles.line} ${line.state === "pending" ? styles.pending : ""}`}>
          <span className={styles.marker}>
            {line.state === "done" ? (
              "[ ok ]"
            ) : line.state === "active" ? (
              <span className={styles.blink}>[ &gt;&gt; ]</span>
            ) : (
              "[    ]"
            )}
          </span>
          <span className={styles.text}>{line.text}</span>
          {line.detail && <span className={styles.detail}>{line.detail}</span>}
        </div>
      ))}
    </div>
  );
}

export function SegmentBar({ fraction }: { fraction: number }): JSX.Element {
  const total = 10;
  const filled = Math.round(Math.max(0, Math.min(1, fraction)) * total);
  return (
    <div className={styles.segbar} aria-label={`${Math.round(fraction * 100)} percent uploaded`}>
      <span className={styles.segcells}>
        {[...Array(total).keys()].map((i) => (
          <span key={i} className={`${styles.seg} ${i < filled ? styles.segOn : ""}`} />
        ))}
      </span>
      <span className={styles.segpct}>{Math.round(fraction * 100)}%</span>
    </div>
  );
}
