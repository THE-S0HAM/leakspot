// Command Centre: the full command loop over the CityView. Code gate → start run → HUD + zone rail +
// CityView + quest cards + event feed + controls (Play/Step/Autopilot) + QR + With/Without panel.
// All data comes from the API; Play ticks every 3 s via the API while mounted.

import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from "react";
import { FACILITIES, SECTORS, type SectorId } from "@leakspot/core/world";
import {
  createRun,
  dispatchCrew,
  getState,
  repairIncident,
  setAutopilot,
  tickRun,
} from "../../api/client";
import type { RunStateView, SectorStatus } from "../../api/types";
import { CityView, type CrewMarker } from "../../world/CityView";
import { STATUS_COLOR } from "../../world/status";
import { PixelButton } from "../../ui/PixelButton";
import { SimLabel } from "../../ui/StatusBadge";
import { lakh } from "../../ui/format";
import { CodeGate } from "./CodeGate";
import { QuestCard } from "./QuestCard";
import { QrJoin } from "./QrJoin";
import { WithWithout } from "./WithWithout";
import styles from "./command.module.css";

const TICK_MS = 3000;
const DEPOT = FACILITIES.find((f) => f.kind === "depot")?.at ?? { x: 14, z: 102 };

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
  const t = Math.max(0, Math.min(1, (2 - eta) / 2)); // 0 at dispatch, →1 as it arrives
  return {
    x: DEPOT.x + (target.pin.x - DEPOT.x) * t,
    z: DEPOT.z + (target.pin.z - DEPOT.z) * t,
    repairing: false,
  };
}

export function CommandCentre(): JSX.Element {
  const [code, setCode] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [state, setState] = useState<RunStateView | null>(null);
  const [playing, setPlaying] = useState(false);
  const [xray, setXray] = useState(false);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = useCallback(async (accessCode: string) => {
    setCode(accessCode);
    const { runId: id } = await createRun(accessCode);
    setRunId(id);
    setState(await getState(id, accessCode));
  }, []);

  const doTick = useCallback(async () => {
    if (!runId || !code) return;
    try {
      setState(await tickRun(runId, code, 1));
    } catch {
      // transient (BUSY/conflict): the next tick retries
    }
  }, [runId, code]);

  // Play loop: tick every 3 s while mounted and the tab is visible.
  useEffect(() => {
    if (!playing) return;
    timer.current = setInterval(() => {
      if (!document.hidden) void doTick();
    }, TICK_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [playing, doTick]);

  const action = useCallback(async (fn: () => Promise<RunStateView>) => {
    setBusy(true);
    try {
      setState(await fn());
    } catch {
      // keep last good state; errors (e.g. crew before 07:00) are surfaced by the quest card state
    } finally {
      setBusy(false);
    }
  }, []);

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
        <span>City water health</span>
        <span
          className={styles.healthBar}
          aria-label={`City water health ${state.cityHealth} percent`}
        >
          <span className={styles.healthFill} style={{ width: `${state.cityHealth}%` }} />
        </span>
        <span>Water recovered {lakh(state.waterRecoveredLitres)}</span>
      </header>

      <div className={styles.body}>
        <aside className={styles.col}>
          <div className={styles.sectionTitle}>Zones</div>
          <ZoneRail state={state} />
        </aside>

        <main className={styles.cityCol}>
          <div className={styles.controls} style={{ borderTop: "none", padding: "0 0 4px" }}>
            <PixelButton variant="secondary" onClick={() => setXray((v) => !v)}>
              {xray ? "Hide pipes" : "X-ray"}
            </PixelButton>
          </div>
          <CityView sectorStatus={sectors} incidents={state.incidents} crew={crew} xray={xray} />
        </main>

        <aside className={styles.col}>
          <div className={styles.sectionTitle}>Incidents</div>
          {incidents.length === 0 && <p className={styles.why}>No incidents yet. Press Play.</p>}
          {incidents.map((inc) => (
            <QuestCard
              key={inc.id}
              incident={inc}
              busy={busy}
              crewBusyElsewhere={state.crew.status !== "idle" && state.crew.incidentId !== inc.id}
              onDispatch={() => void action(() => dispatchCrew(runId, code, inc.id))}
              onRepair={() => void action(() => repairIncident(runId, code, inc.id))}
            />
          ))}
          <div className={styles.sectionTitle} style={{ marginTop: 12 }}>
            Event feed
          </div>
          <div className={styles.feed}>
            {[...state.recentEvents]
              .reverse()
              .slice(0, 10)
              .map((e, i) => (
                <div key={i} className={styles.feedLine}>
                  {e.at.label} {e.label}
                </div>
              ))}
          </div>
        </aside>
      </div>

      <footer className={styles.controls}>
        <PixelButton onClick={() => setPlaying((v) => !v)}>
          {playing ? "Pause" : "Play"}
        </PixelButton>
        <PixelButton variant="secondary" onClick={() => void doTick()} disabled={playing}>
          Step
        </PixelButton>
        <PixelButton
          variant="secondary"
          className={state.autopilot ? styles.toggleOn : undefined}
          onClick={() => void action(() => setAutopilot(runId, code, !state.autopilot))}
        >
          Autopilot {state.autopilot ? "on" : "off"}
        </PixelButton>
        <span className={styles.spacer} />
        <QrJoin runId={runId} />
        <WithWithout incidents={state.incidents} sectors={state.sectors} />
      </footer>
    </div>
  );
}

function ZoneRail({ state }: { state: RunStateView }): JSX.Element {
  const zones = useMemo(() => {
    const byZone: Record<string, { id: SectorId; status: SectorStatus }[]> = {};
    for (const sector of SECTORS) {
      const runtime = state.sectors.find((s) => s.id === sector.id);
      (byZone[sector.zone] ??= []).push({ id: sector.id, status: runtime?.status ?? "normal" });
    }
    return byZone;
  }, [state]);

  return (
    <div>
      {Object.entries(zones).map(([zone, sectors]) => (
        <div key={zone} className={styles.zoneRow}>
          <strong>Zone {zone}</strong>
          <div className={styles.zoneBars}>
            {sectors.map((s) => (
              <span
                key={s.id}
                className={styles.zoneBar}
                style={{ background: STATUS_COLOR[s.status] }}
                title={`${s.id} ${s.status}`}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
