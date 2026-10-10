// Command Centre: the full command loop over the CityView, laid out as a game HUD (top bar, map centre,
// right rail with Incidents/Impact tabs, bottom dock). All data from the API. Play ticks every 3 s at
// the chosen speed (tick count 1/2/4). API errors surface as a toast, never the event feed; the feed
// shows the engine's recentEvents with sim time.

import { useCallback, useEffect, useRef, useState, type JSX } from "react";
import { FACILITIES, type SectorId } from "@leakspot/core/world";
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
import { PixelButton } from "../../ui/PixelButton";
import { SimLabel, healthColor } from "../../ui/StatusBadge";
import { lakh } from "../../ui/format";
import { CodeGate } from "./CodeGate";
import { QuestCard } from "./QuestCard";
import { QrJoin } from "./QrJoin";
import { WithWithout } from "./WithWithout";
import styles from "./command.module.css";

const TICK_MS = 3000;
const DEPOT = FACILITIES.find((f) => f.kind === "depot")?.at ?? { x: 14, z: 102 };
const CREW_ON_DUTY_SLOT = 4; // 07:00

function statusMap(state: RunStateView): Record<SectorId, SectorStatus> {
  const map = {} as Record<SectorId, SectorStatus>;
  for (const s of state.sectors) map[s.id] = s.status;
  return map;
}

/** Place the crew truck between depot and the target incident pin by remaining ETA (2 → 0 slots). */
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

/** Why Dispatch is disabled for this incident, or null if it's allowed. */
function dispatchReason(state: RunStateView, incidentId: string): string | null {
  if (state.simClock.slotIndex >= 0 && state.simClock.slotIndex < CREW_ON_DUTY_SLOT) {
    return "Crew starts at 07:00";
  }
  if (state.crew.status !== "idle" && state.crew.incidentId !== incidentId) return "Crew busy";
  return null;
}

type Tab = "incidents" | "impact";

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
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  const start = useCallback(async (accessCode: string) => {
    setCode(accessCode);
    const { runId: id } = await createRun(accessCode);
    setRunId(id);
    setState(await getState(id, accessCode));
  }, []);

  const doTick = useCallback(
    async (count = 1) => {
      if (!runId || !code) return;
      try {
        setState(await tickRun(runId, code, count));
      } catch {
        // transient (BUSY / version conflict): the next tick retries
      }
    },
    [runId, code],
  );

  // Play loop: tick every 3 s while visible, advancing `speed` slots per tick.
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
        setState(await fn());
      } catch (error) {
        showToast(error instanceof ApiCallError ? error.message : "Something went wrong");
      } finally {
        setBusy(false);
      }
    },
    [showToast],
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
  const crew = crewMarker(state);

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
          <span className={styles.healthNum}>{state.cityHealth}</span>
        </span>
        <span className={styles.hudStat}>Water recovered {lakh(state.waterRecoveredLitres)}</span>
      </header>

      <div className={styles.mapArea}>
        <div className={styles.mapOverlay}>
          <PixelButton variant="secondary" onClick={() => setXray((v) => !v)}>
            {xray ? "Hide pipes" : "X-ray"}
          </PixelButton>
        </div>
        <CityView
          sectorStatus={sectors}
          incidents={state.incidents}
          crew={crew}
          xray={xray}
          onSelectSector={(id) => setSelected(id)}
        />
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
                <SectorPanel state={state} sectorId={selected} onClose={() => setSelected(null)} />
              )}
              {incidents.length === 0 && (
                <p className={styles.why}>No incidents yet. Press Play.</p>
              )}
              {incidents.map((inc) => (
                <QuestCard
                  key={inc.id}
                  incident={inc}
                  selected={selected === inc.sectorId}
                  busy={busy}
                  crewEtaSlots={state.crew.incidentId === inc.id ? (state.crew.etaSlots ?? 0) : 0}
                  dispatchDisabledReason={dispatchReason(state, inc.id)}
                  onDispatch={() => void action(() => dispatchCrew(runId, code, inc.id))}
                  onRepair={() => void action(() => repairIncident(runId, code, inc.id))}
                  onSelect={() => setSelected(inc.sectorId)}
                />
              ))}
              <div className={styles.sectionTitle} style={{ marginTop: 12 }}>
                Event feed
              </div>
              <div className={styles.feed}>
                {[...state.recentEvents]
                  .reverse()
                  .slice(0, 12)
                  .map((e, i) => (
                    <div key={i} className={styles.feedLine}>
                      {e.at.label} {e.label}
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
        <PixelButton onClick={() => setPlaying((v) => !v)}>
          {playing ? "Pause" : "Play"}
        </PixelButton>
        <PixelButton variant="secondary" onClick={() => void doTick(speed)} disabled={playing}>
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
        <PixelButton variant="secondary" onClick={() => setXray((v) => !v)}>
          {xray ? "Hide pipes" : "X-ray"}
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
    <div className={styles.card} onClick={(e) => e.stopPropagation()}>
      <div className={styles.cardTop}>
        <strong>{sectorId}</strong>
        <span className={styles.spacer} />
        <PixelButton variant="secondary" onClick={onClose}>
          Close
        </PixelButton>
      </div>
      <div className={styles.why}>
        Unaccounted {Math.round(loss * 100)}% (usual {Math.round(baseline * 100)}%)
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
            {i.verdict.replace(/_/g, " ").toLowerCase()} · P {i.score.P} · {i.status}
          </div>
        ))
      )}
    </div>
  );
}
