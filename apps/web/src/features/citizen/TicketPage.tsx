// /t/:runId/:reportId: the citizen ticket. Big code, type, sector, time, AI label in words (or
// self-reported), the 5-block tracker (derived purely, unit-tested), and the merged-neighbours note.
// Polls every 3 s while visible, stops at a terminal state. Deep-link reload works on CloudFront (SPA
// rewrite). Neel Limewash, phone-first.

import { useEffect, useRef, useState, type JSX } from "react";
import { useParams } from "react-router";
import { getTicket } from "../../api/client";
import type { TicketView } from "../../state/view-types";
import { SimLabel } from "../../ui/StatusBadge";
import { labelWord } from "../../ui/words";
import { LangContext, useT, type Lang } from "../../i18n/t";
import { loadLang } from "./storage";
import { deriveTracker, type Tracker } from "./tracker";
import styles from "./ticket.module.css";

const POLL_MS = 3000;
const BLOCK_KEYS = [
  "received",
  "checked",
  "crewAssigned",
  "repaired",
  "confirmedByMeters",
] as const;

export function TicketPage(): JSX.Element {
  const lang: Lang = loadLang() ?? "en";
  return (
    <LangContext.Provider value={lang}>
      <div data-theme="limewash">
        <TicketBody />
      </div>
    </LangContext.Provider>
  );
}

function TicketBody(): JSX.Element {
  const t = useT();
  const { runId, reportId } = useParams();
  const [ticket, setTicket] = useState<TicketView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    document.documentElement.lang = loadLang() ?? "en";
  }, []);

  useEffect(() => {
    if (!runId || !reportId) return;
    let stopped = false;
    const poll = async (): Promise<void> => {
      try {
        const next = await getTicket(runId, reportId);
        if (stopped) return;
        setTicket(next);
        if (deriveTracker(next).terminal && timer.current) {
          clearInterval(timer.current);
          timer.current = null;
        }
      } catch {
        if (!stopped) setError(t("runEnded"));
      }
    };
    void poll();
    timer.current = setInterval(() => {
      if (!document.hidden) void poll();
    }, POLL_MS);
    return () => {
      stopped = true;
      if (timer.current) clearInterval(timer.current);
    };
  }, [runId, reportId, t]);

  if (error) return <div className={styles.page}>{error}</div>;
  if (!ticket) return <div className={styles.page}>…</div>;

  const tracker = deriveTracker(ticket);
  const ai = ticket.selfReported || !ticket.label ? "self-reported" : labelWord(ticket.label);

  return (
    <div className={styles.page}>
      <div className={styles.topbar}>
        <span className={styles.brand}>LeakSpot</span>
        <SimLabel />
      </div>

      <h1 className={styles.code}>{ticket.ticketCode}</h1>
      <div className={styles.meta}>
        {ticket.type === "leak_photo" ? "💧" : "🚰"} {ticket.sectorId ?? ""} · {ai}
      </div>

      {ticket.mergedCount > 0 && (
        <div className={styles.merged}>
          {t("addedToExisting")} · {ticket.mergedCount} {t("neighbours")}
        </div>
      )}

      <TrackerBlocks tracker={tracker} />

      {tracker.rejected && <p className={styles.rejected}>{t("reportRejected")}</p>}
    </div>
  );
}

function TrackerBlocks({ tracker }: { tracker: Tracker }): JSX.Element {
  const t = useT();
  return (
    <ol className={styles.tracker}>
      {tracker.blocks.map((block, i) => {
        const lastLogged = i === 4 && tracker.loggedNotVerified;
        const key = BLOCK_KEYS[i] ?? "received";
        const label = lastLogged ? "Repair logged" : t(key);
        return (
          <li key={block.key} className={`${styles.block} ${styles[block.state]}`}>
            <span className={styles.blockDot} aria-hidden />
            <span>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}
