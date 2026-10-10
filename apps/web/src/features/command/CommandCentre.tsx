// Command Centre: the full command loop over the CityView as a game HUD. Guides the player with a
// mission briefing, a derived "Next move" bar, map event pop-ups, hover tooltips, a camera that eases
// to a clicked sector, and a Day report at 20:00. All data from the API; Play ticks every 3 s at the
// chosen speed. Errors → toast, never the feed.

import { useCallback, useEffect, useRef, useState, type JSX } from "react";
import { FACILITIES, SECTOR_BY_ID, type SectorId } from "@leakspot/core/world";
import {
  ApiCallError,
  createRun,
  dispatchCrew,
  getState,
  repairIncident,
  setAutopilot,
  tickRun,
} from "../../api/client";
import type { RunStateView, SectorStatus } from "../../state/view-types";
import { CityView, type CrewMarker } from "../../world/CityView";
import { BASE_VIEWBOX, project, VIEW_H, VIEW_W } from "../../world/iso";
import { PixelButton } from "../../ui/PixelButton";
import { SimLabel, healthColor } from "../../ui/StatusBadge";
import { lakh, litres, tankers } from "../../ui/format";
import { incidentStatusWord, verdictWord } from "../../ui/words";
import { CodeGate } from "./CodeGate";
import { QuestCard } from "./QuestCard";
import { QrJoin } from "./QrJoin";
import { WithWithout } from "./WithWithout";
import { nextMove, type NextAction } from "./next-move";
import styles from "./command.module.css";

const TICK_MS = 3000;
const DEPOT = FACILITIES.find((f) => f.kind === "depot")?.at ?? { x: 14, z: 102 };
const CREW_ON_DUTY_SLOT = 4;

function statusMap(state: RunStateView): Record<SectorId, SectorStatus> {
  const map = {} as Record<SectorId, SectorStatus>;
  for (const s of state.sectors) map[s.id] = s.status;
  return map;
}

function crewMarker(state: RunStateView): CrewMarker {
  const { crew } = state;
  if (crew.status === "idle" || !crew.incidentId) return null;
  const target = state.incidents.find((i) => i.id === crew.incidentId);
  if (!target) return null;
  if (crew.status === "onsite") return { x: target.pin.x, z: target.pin.z, repairing: true };
  const eta = crew.etaSlots ?? 2;
  const t = Math.max(0, Math.min(1, (2 - eta) / 2));
  return {
    x: DEPOT.x + (target.pin.x - DEPOT.x) * t,
    z: DEPOT.z + (target.pin.z - DEPOT.z) * t,
    repairing: false,
  };
}

function dispatchReason(state: RunStateView, incidentId: string): string | null {
  if (state.simClock.slotIndex >= 0 && state.simClock.slotIndex < CREW_ON_DUTY_SLOT) {
    return "Crew starts at 07:00";
  }
  if (state.crew.status !== "idle" && state.crew.incidentId !== incidentId) return "Crew busy";
  return null;
}

type Tab = "incidents" | "impact";
type Popup = { id: number; text: string; kind: "info" | "confirmed" | "verified" };

export function CommandCentre(): JSX.Element {
  const [code, setCode] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [state, setState] = useState<RunStateView | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<1 | 2 | 4>(1);
  const [xray, setXray] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>("incidents");
  const [selected, setSelected] = useState<SectorId | null>(null);
  const [hover, setHover] = useState<SectorId | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [popups, setPopups] = useState<Popup[]>([]);
  const [viewBox, setViewBox] = useState(BASE_VIEWBOX);
  const [showBriefing, setShowBriefing] = useState(true);
  const [dayOver, setDayOver] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seenEvents = useRef(0);
  const popupId = useRef(0);
  const rafRef = useRef<number | null>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  // Surface new engine events as map pop-ups (max 3), separate from error toasts.
  const absorbEvents = useCallback((next: RunStateView) => {
    const total = next.recentEvents.length;
    if (seenEvents.current === 0) {
      seenEvents.current = total;
      return;
    }
    const fresh = next.recentEvents.slice(seenEvents.current);
    seenEvents.current = total;
    for (const e of fresh) {
      if (!/suspected|confirmed|verified|photo|burst/i.test(e.label)) continue;
      const kind: Popup["kind"] = /verified/i.test(e.label)
        ? "verified"
        : /confirmed|burst/i.test(e.label)
          ? "confirmed"
          : "info";
      const id = (popupId.current += 1);
      setPopups((p) => [...p.slice(-2), { id, text: `${e.at.label} · ${e.label}`, kind }]);
      setTimeout(() => setPopups((p) => p.filter((x) => x.id !== id)), 4000);
    }
  }, []);

  const apply = useCallback(
    (next: RunStateView) => {
      absorbEvents(next);
      setState(next);
    },
    [absorbEvents],
  );

  const start = useCallback(async (accessCode: string) => {
    setCode(accessCode);
    const { runId: id } = await createRun(accessCode);
    setRunId(id);
    seenEvents.current = 0;
    const s = await getState(id, accessCode);
    seenEvents.current = s.recentEvents.length;
    setState(s);
  }, []);

  const doTick = useCallback(
    async (count = 1) => {
      if (!runId || !code) return;
      try {
        apply(await tickRun(runId, code, count));
      } catch (error) {
        if (error instanceof ApiCallError && /day is over/i.test(error.message)) {
          setPlaying(false);
          setDayOver(true);
        }
        // other transient errors: next tick retries
      }
    },
    [runId, code, apply],
  );

  useEffect(() => {
    if (!playing) return;
    timer.current = setInterval(() => {
      if (!document.hidden) void doTick(speed);
    }, TICK_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [playing, speed, doTick]);

  const action = useCallback(
    async (fn: () => Promise<RunStateView>) => {
      setBusy(true);
      try {
        apply(await fn());
      } catch (error) {
        showToast(error instanceof ApiCallError ? error.message : "Something went wrong");
      } finally {
        setBusy(false);
      }
    },
    [apply, showToast],
  );

  // Ease the camera to a sector's projected centre (viewBox tween, ~400 ms).
  const easeTo = useCallback((sectorId: SectorId | null) => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const fromParts = (prev: string) =>
      prev.split(" ").map(Number) as [number, number, number, number];
    const target: [number, number, number, number] = (() => {
      if (!sectorId) return BASE_VIEWBOX.split(" ").map(Number) as [number, number, number, number];
      const c = project(SECTOR_BY_ID[sectorId].centroid.x, SECTOR_BY_ID[sectorId].centroid.z, 0);
      const w = VIEW_W * 0.5;
      const h = VIEW_H * 0.5;
      return [c.sx - w / 2, c.sy - h / 2, w, h];
    })();
    setViewBox((prev) => {
      const from = fromParts(prev);
      const t0 = performance.now();
      const DURATION = 400;
      const stepFrame = (now: number) => {
        const k = Math.min(1, (now - t0) / DURATION);
        const e = 1 - Math.pow(1 - k, 3);
        const cur = from.map((v, i) => v + ((target[i] ?? v) - v) * e);
        setViewBox(cur.join(" "));
        if (k < 1) rafRef.current = requestAnimationFrame(stepFrame);
      };
      rafRef.current = requestAnimationFrame(stepFrame);
      return prev;
    });
  }, []);

  const selectSector = useCallback(
    (id: SectorId | null) => {
      setSelected(id);
      easeTo(id);
    },
    [easeTo],
  );

  // Keyboard: Space play/pause, S step, X X-ray.
  useEffect(() => {
    if (!state) return;
    function onKey(e: KeyboardEvent): void {
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === "Space") {
        e.preventDefault();
        setPlaying((v) => !v);
      } else if (e.key === "s" || e.key === "S") {
        void doTick(speed);
      } else if (e.key === "x" || e.key === "X") {
        setXray((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, doTick, speed]);

  if (!code || !runId || !state) return <CodeGate onPass={(c) => void start(c)} />;

  const sectors = statusMap(state);
  const incidents = [...state.incidents].sort((a, b) => b.score.P - a.score.P);
  const active = incidents.filter((i) => i.status !== "verified" && i.status !== "closed_logged");
  const closed = incidents.filter((i) => i.status === "verified" || i.status === "closed_logged");
  const crew = crewMarker(state);
  const move = nextMove(state);

  function runAction(a: NextAction): void {
    if (!runId || !code) return;
    if (a.kind === "play") setPlaying(true);
    else if (a.kind === "dispatch") void action(() => dispatchCrew(runId, code, a.incidentId));
    else void action(() => repairIncident(runId, code, a.incidentId));
  }

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <span className={styles.brand}>LeakSpot</span>
        <SimLabel />
        <span className={styles.clock}>
          Day {state.simClock.day} {state.simClock.label} ·{" "}
          {state.supplyOn ? "supply on" : "supply off"}
        </span>
        <span className={styles.spacer} />
        <span className={styles.hudStat}>
          City water health
          <span className={styles.healthBar}>
            <span
              className={styles.healthFill}
              style={{ width: `${state.cityHealth}%`, background: healthColor(state.cityHealth) }}
            />
          </span>
          <CountUp className={styles.healthNum} value={state.cityHealth} />
        </span>
        <span className={styles.hudStat}>
          Water recovered <CountUp value={state.waterRecoveredLitres} format={lakh} />
        </span>
        <PixelButton variant="secondary" onClick={() => setPhoneOpen(true)}>
          Phone
        </PixelButton>
      </header>

      {phoneOpen && (
        <div className={styles.modalWrap} onClick={() => setPhoneOpen(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2>Report from a phone</h2>
            <p className={styles.why}>Scan or open this on a phone to report into run {runId}.</p>
            <QrJoin runId={runId} />
            <PixelButton onClick={() => setPhoneOpen(false)}>Close</PixelButton>
          </div>
        </div>
      )}

      <div className={styles.mapArea}>
        <div className={styles.nextMove}>
          <span className={styles.nextMoveText}>{move.text}</span>
          {move.action && move.label && (
            <PixelButton onClick={() => move.action && runAction(move.action)}>
              {move.label}
            </PixelButton>
          )}
        </div>

        <div className={styles.popups}>
          {popups.map((p) => (
            <div
              key={p.id}
              className={`${styles.popup} ${p.kind === "confirmed" ? styles.popupConfirmed : ""} ${p.kind === "verified" ? styles.popupVerified : ""}`}
            >
              {p.text}
            </div>
          ))}
        </div>

        {hover && <SectorTooltip state={state} sectorId={hover} />}

        <CityView
          sectorStatus={sectors}
          incidents={state.incidents}
          crew={crew}
          supplyOn={state.supplyOn}
          xray={xray}
          viewBox={viewBox}
          onSelectSector={selectSector}
          onHoverSector={setHover}
        />

        {showBriefing && <MissionBriefing onStart={() => setShowBriefing(false)} />}
        {dayOver && <DayReport state={state} onNewRun={() => window.location.reload()} />}
      </div>

      <aside className={styles.rail}>
        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${tab === "incidents" ? styles.tabActive : ""}`}
            onClick={() => setTab("incidents")}
          >
            Incidents
          </button>
          <button
            className={`${styles.tab} ${tab === "impact" ? styles.tabActive : ""}`}
            onClick={() => setTab("impact")}
          >
            Impact
          </button>
        </div>
        <div className={styles.railBody}>
          {tab === "incidents" ? (
            <>
              {selected && (
                <SectorPanel state={state} sectorId={selected} onClose={() => selectSector(null)} />
              )}
              {active.length === 0 && closed.length === 0 && (
                <p className={styles.why}>No incidents yet. Press Play.</p>
              )}
              {active.map((inc) => (
                <QuestCard
                  key={inc.id}
                  incident={inc}
                  selected={selected === inc.sectorId}
                  busy={busy}
                  crewEtaSlots={state.crew.incidentId === inc.id ? (state.crew.etaSlots ?? 0) : 0}
                  dispatchDisabledReason={dispatchReason(state, inc.id)}
                  onDispatch={() => void action(() => dispatchCrew(runId, code, inc.id))}
                  onRepair={() => void action(() => repairIncident(runId, code, inc.id))}
                  onSelect={() => selectSector(inc.sectorId)}
                />
              ))}
              {closed.map((inc) => (
                <span key={inc.id} className={styles.collapsed}>
                  ✓ {inc.sectorId} {inc.status === "verified" ? "verified" : "logged"}
                  {inc.recoveredLitresPerDay ? ` · ${lakh(inc.recoveredLitresPerDay)}/day` : ""}
                </span>
              ))}
              <div className={styles.sectionTitle} style={{ marginTop: 12 }}>
                Event feed
              </div>
              <div className={styles.feed}>
                {[...state.recentEvents]
                  .reverse()
                  .slice(0, 8)
                  .map((e, i) => (
                    <div key={i} className={styles.feedLine}>
                      <span className={styles.feedDot} style={{ background: feedColor(e.kind) }} />
                      {e.at.label} · {e.label}
                    </div>
                  ))}
              </div>
            </>
          ) : (
            <>
              <QrJoin runId={runId} />
              <WithWithout incidents={state.incidents} sectors={state.sectors} />
            </>
          )}
        </div>
      </aside>

      <footer className={styles.dock}>
        <PixelButton onClick={() => setPlaying((v) => !v)} disabled={dayOver}>
          {playing ? "Pause" : "Play"}
        </PixelButton>
        <PixelButton
          variant="secondary"
          onClick={() => void doTick(speed)}
          disabled={playing || dayOver}
        >
          Step
        </PixelButton>
        <span className={styles.speedGroup}>
          {([1, 2, 4] as const).map((x) => (
            <PixelButton
              key={x}
              variant="secondary"
              className={`${styles.speedBtn} ${speed === x ? styles.toggleOn : ""}`}
              onClick={() => setSpeed(x)}
            >
              {x}×
            </PixelButton>
          ))}
        </span>
        <PixelButton
          variant="secondary"
          className={state.autopilot ? styles.toggleOn : undefined}
          onClick={() => void action(() => setAutopilot(runId, code, !state.autopilot))}
        >
          Autopilot {state.autopilot ? "on" : "off"}
        </PixelButton>
        <PixelButton
          variant="secondary"
          className={xray ? styles.toggleOn : undefined}
          onClick={() => setXray((v) => !v)}
        >
          {xray ? "Hide pipes" : "X-ray"}
        </PixelButton>
        <PixelButton variant="secondary" onClick={() => selectSector(null)}>
          Fit city
        </PixelButton>
        <span className={styles.spacer} />
        <span className={styles.why}>Space play · S step · X x-ray</span>
      </footer>

      {toast && (
        <div className={styles.toast} role="alert">
          {toast}
        </div>
      )}
    </div>
  );
}

function feedColor(kind: string): string {
  if (kind === "incident") return "var(--sindoor)";
  if (kind === "crew") return "var(--neel)";
  if (kind === "sector") return "var(--haldi)";
  return "var(--ink-dim)";
}

function CountUp({
  value,
  format,
  className,
}: {
  value: number;
  format?: (n: number) => string;
  className?: string;
}): JSX.Element {
  const [shown, setShown] = useState(value);
  const prev = useRef(value);
  useEffect(() => {
    const from = prev.current;
    prev.current = value;
    if (from === value) return;
    const t0 = performance.now();
    const DURATION = 600;
    let raf = 0;
    const stepFrame = (now: number): void => {
      const k = Math.min(1, (now - t0) / DURATION);
      setShown(Math.round(from + (value - from) * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(stepFrame);
    };
    raf = requestAnimationFrame(stepFrame);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span className={className}>{format ? format(shown) : shown}</span>;
}

function MissionBriefing({ onStart }: { onStart: () => void }): JSX.Element {
  return (
    <div className={styles.modalWrap}>
      <div className={styles.modal}>
        <h2>Your shift</h2>
        <p>You run Jaldhara&apos;s water for one day.</p>
        <p>Meters flag losses, citizens send photos, you have one crew.</p>
        <p>Recover the most water by 20:00.</p>
        <PixelButton onClick={onStart}>Start</PixelButton>
      </div>
    </div>
  );
}

function DayReport({
  state,
  onNewRun,
}: {
  state: RunStateView;
  onNewRun: () => void;
}): JSX.Element {
  const verified = state.incidents.filter((i) => i.status === "verified");
  const hidden = state.incidents.filter((i) => i.kind === "hidden").length;
  const recovered = state.waterRecoveredLitres;
  return (
    <div className={styles.modalWrap}>
      <div className={styles.modal}>
        <h2>Day report</h2>
        <SimLabel />
        <div className={styles.reportGrid}>
          <span>Incidents verified</span>
          <span className={styles.reportNum}>{verified.length}</span>
          <span>Water recovered</span>
          <span className={styles.reportNum}>{lakh(recovered)}/day</span>
          <span>Tanker-loads saved / month</span>
          <span className={styles.reportNum}>{tankers(recovered * 30)}</span>
          <span>Hidden leaks found</span>
          <span className={styles.reportNum}>{hidden}</span>
        </div>
        <PixelButton onClick={onNewRun}>New run</PixelButton>
      </div>
    </div>
  );
}

function SectorTooltip({
  state,
  sectorId,
}: {
  state: RunStateView;
  sectorId: SectorId;
}): JSX.Element | null {
  const r = state.sectors.find((s) => s.id === sectorId);
  if (!r) return null;
  return (
    <div className={styles.tooltip} style={{ top: 44, left: 12 }}>
      {sectorId}: in {litres(r.inflowLitres)} · used {litres(r.usedLitres)} · unaccounted{" "}
      {Math.round(r.lossRatio * 100)}% (usual {Math.round(r.baselineRatio * 100)}%)
    </div>
  );
}

function SectorPanel({
  state,
  sectorId,
  onClose,
}: {
  state: RunStateView;
  sectorId: SectorId;
  onClose: () => void;
}): JSX.Element {
  const runtime = state.sectors.find((s) => s.id === sectorId);
  const sectorIncidents = state.incidents.filter((i) => i.sectorId === sectorId);
  const loss = runtime?.lossRatio ?? 0;
  const baseline = runtime?.baselineRatio ?? 0;
  const usedPct = Math.max(0, Math.min(100, (1 - loss) * 100));
  const lostPct = Math.max(0, Math.min(100, loss * 100));
  return (
    <div className={styles.card}>
      <div className={styles.cardTop}>
        <strong>{sectorId}</strong>
        <span className={styles.spacer} />
        <PixelButton variant="secondary" onClick={onClose}>
          Close
        </PixelButton>
      </div>
      <div className={styles.why}>
        In {litres(runtime?.inflowLitres ?? 0)} · used {litres(runtime?.usedLitres ?? 0)} ·
        unaccounted {Math.round(loss * 100)}% (usual {Math.round(baseline * 100)}%)
      </div>
      <div className={styles.balanceBar} aria-label="Water balance: used vs unaccounted">
        <span className={styles.balanceUsed} style={{ width: `${usedPct}%` }} />
        <span className={styles.balanceLost} style={{ width: `${lostPct}%` }} />
        <span className={styles.balanceBaseline} style={{ left: `${(1 - baseline) * 100}%` }} />
      </div>
      {sectorIncidents.length === 0 ? (
        <div className={styles.why}>No incidents in this sector.</div>
      ) : (
        sectorIncidents.map((i) => (
          <div key={i.id} className={styles.why}>
            {verdictWord(i.verdict)} · P {i.score.P} · {incidentStatusWord(i.status)}
          </div>
        ))
      )}
    </div>
  );
}
