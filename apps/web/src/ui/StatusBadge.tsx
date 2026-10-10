// Status badge: a colour dot plus a word, so status is never conveyed by colour alone.
import type { JSX } from "react";
import type { SectorStatus } from "../state/view-types";
import { STATUS_COLOR, STATUS_WORD } from "../world/status";
import styles from "./ui.module.css";

export function StatusBadge({ status }: { status: SectorStatus }): JSX.Element {
  return (
    <span className={styles.badge} style={{ color: STATUS_COLOR[status] }}>
      <span className={styles.badgeDot} style={{ background: STATUS_COLOR[status] }} aria-hidden />
      {STATUS_WORD[status]}
    </span>
  );
}

export function SimLabel(): JSX.Element {
  return <span className={styles.simLabel}>Simulated city</span>;
}

export function Panel({ children }: { children: React.ReactNode }): JSX.Element {
  return <div className={styles.panel}>{children}</div>;
}
