// Command Centre: the full command loop over the CityView as a game HUD. Guides the player with a
// mission briefing, a derived "Next move" bar, map event pop-ups, hover tooltips, a camera that eases
// to a clicked sector, and a Day report at 20:00. All data from the API; Play ticks every 3 s at the
// chosen speed. Errors → toast, never the feed.

import { useCallback, useEffect, useRef, useState, type JSX } from "react";
import { useSearchParams } from "react-router";
import { FACILITIES, SECTOR_BY_ID, type SectorId } from "@leakspot/core/world";
import {
  ApiCallError,
  createRun,
  dispatchCrew,
  getReportPhotoUrl,
  getState,
  repairIncident,
  setAutopilot,
  tickRun,
} from "../../api/client";
import type { RecentReport, RunStateView, SectorStatus } from "../../state/view-types";
import { CityCanvas } from "../../world/CityCanvas";
import { type CrewMarker } from "../../world/CityView";
import { BASE_VIEWBOX, project, VIEW_H, VIEW_W } from "../../world/iso";
import { PixelButton } from "../../ui/PixelButton";
import { SimLabel, healthColor } from "../../ui/StatusBadge";
import { lakh, litres, tankers } from "../../ui/format";
import { incidentStatusWord, labelWord, verdictWord } from "../../ui/words";
import { CodeGate } from "./CodeGate";
import { QuestCard } from "./QuestCard";
import { QrJoin } from "./QrJoin";
import { WithWithout } from "./WithWithout";
import { nextMove, type NextAction } from "./next-move";
import { nextBeat, type Beat, type BeatId } from "./story";
import { Explainer, ModeChooser, StoryBar, StoryCaption } from "./StoryUI";
import styles from "./command.module.css";

const TICK_MS = 3000;
const RUN_KEY = "leakspot.command.run";
const CODE_KEY = "leakspot.command.code";
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
  if (crew.status === "onsite")
    return { x: target.pin.x, z: target.pin.z, repairing: true, target: target.pin };
  const eta = crew.etaSlots ?? 2;
  const t = Math.max(0, Math.min(1, (2 - eta) / 2));
  return {
    x: DEPOT.x + (target.pin.x - DEPOT.x) * t,
    z: DEPOT.z + (target.pin.z - DEPOT.z) * t,
    repairing: false,
    target: target.pin,
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

/** A 401 means the remembered code is stale: forget it (this tab only) and show the gate again. */
function forgetCodeOn401(error: unknown, setCode: (c: string | null) => void): boolean {
  if (!(error instanceof ApiCallError) || error.status !== 401) return false;
  try {
    sessionStorage.removeItem(CODE_KEY);
  } catch {
    // ignore
  }
  setCode(null);
  return true;
}

export function CommandCentre(): JSX.Element {
  // Remember the code for this tab so a reload with ?run= goes straight back to the run (sessionStorage,
  // try/catch; closing the tab clears it). The gate still appears on a fresh tab with no saved code.
  const [code, setCode] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(CODE_KEY);
    } catch {
      return null;
    }
  });
  const [runId, setRunId] = useState<string | null>(null);
  const [state, setState] = useState<RunStateView | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<1 | 2 | 4>(1);
  const [xray, setXray] = useState(false);
  const [fitKey, setFitKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>("incidents");
  const [selected, setSelected] = useState<SectorId | null>(null);
  const [hover, setHover] = useState<SectorId | null>(null);
  // The sector tooltip follows a mouse pointer (16 px offset, kept below the Next-move bar); on touch
  // there is no hover, the tap opens the sector panel instead.
  const [tipPos, setTipPos] = useState<{ x: number; y: number } | null>(null);
  const touchRef = useRef(false);
  const [toast, setToast] = useState<string | null>(null);
  const [popups, setPopups] = useState<Popup[]>([]);
  const [viewBox, setViewBox] = useState(BASE_VIEWBOX);
  const [showBriefing, setShowBriefing] = useState(true);
  // How the judge watches: the guided story ("Watch it work") or manual ("Run it yourself").
  const [mode, setMode] = useState<"story" | "manual">("manual");
  const [beat, setBeat] = useState<Beat | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [focus, setFocus] = useState<SectorId | null>(null);
  const modeRef = useRef<"story" | "manual">("manual");
  const skippedRef = useRef(false);
  const beatOpen = useRef(false);
  const fired = useRef(new Set<BeatId>());
  const lastState = useRef<RunStateView | null>(null);
  const [dayOver, setDayOver] = useState(false);
  const dayOverRef = useRef(false);
  useEffect(() => {
    dayOverRef.current = dayOver;
  }, [dayOver]);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [ended, setEnded] = useState(false);
  const [confirmNewRun, setConfirmNewRun] = useState(false);
  const [params, setParams] = useSearchParams();
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickInFlight = useRef(false);
  const seenEvents = useRef(0);
  const seenReports = useRef<Set<string>>(new Set());
  const popupId = useRef(0);
  const rafRef = useRef<number | null>(null);
  const [selectedReport, setSelectedReport] = useState<string | null>(null);

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

  // New phone reports → a map pop-up "07:30 · Phone photo at D2 · AI: small drip, 90%" and a feed line.
  const absorbReports = useCallback((next: RunStateView) => {
    const known = seenReports.current;
    if (known.size === 0 && next.recentReports.length > 0) {
      // first load: mark all as seen, don't flood pop-ups
      for (const r of next.recentReports) known.add(r.reportId);
      return;
    }
    for (const r of next.recentReports) {
      if (known.has(r.reportId)) continue;
      known.add(r.reportId);
      if (r.source !== "phone") continue;
      const ai =
        r.label && r.label !== "self_reported"
          ? `AI: ${labelWord(r.label)}${r.confidence ? `, ${Math.round(r.confidence * 100)}%` : ""}`
          : "self-reported";
      const kind: Popup["kind"] = r.label === "not_a_leak" ? "info" : "confirmed";
      const id = (popupId.current += 1);
      const what = r.type === "leak_photo" ? "photo" : "low water";
      setPopups((p) => [
        ...p.slice(-2),
        { id, text: `${r.simTime ?? ""} · Phone ${what} at ${r.sectorId} · ${ai}`, kind },
      ]);
      setTimeout(() => setPopups((p) => p.filter((x) => x.id !== id)), 4000);
    }
  }, []);

  // Guided story: on every new state (and at day end) fire the next beat that became TRUE. A beat
  // pauses play, eases the camera to its sector and shows its caption; it continues after ~4 s.
  const storyCheck = useCallback((next: RunStateView | null, over: boolean) => {
    if (modeRef.current !== "story" || skippedRef.current || beatOpen.current) return;
    const s = next ?? lastState.current;
    if (!s) return;
    const b = nextBeat(s, fired.current, over);
    if (!b) return;
    fired.current.add(b.id);
    beatOpen.current = true;
    setBeat(b);
    setPlaying(false);
    if (b.sector) setFocus(b.sector);
  }, []);

  const apply = useCallback(
    (next: RunStateView) => {
      absorbEvents(next);
      absorbReports(next);
      lastState.current = next;
      setState(next);
      storyCheck(next, false);
    },
    [absorbEvents, absorbReports, storyCheck],
  );

  // The run id lives in the URL (?run=) and localStorage, so a reload resumes the SAME run. Only the
  // explicit mode-chooser cards ever call createRun — no error path creates a run.
  const syncRunId = useCallback(
    (id: string | null) => {
      setRunId(id);
      const next = new URLSearchParams(params);
      if (id) next.set("run", id);
      else next.delete("run");
      setParams(next, { replace: true });
      try {
        if (id) localStorage.setItem(RUN_KEY, id);
        else localStorage.removeItem(RUN_KEY);
      } catch {
        // ignore — URL still carries the run id
      }
    },
    [params, setParams],
  );

  // Load an existing run's state (resume). 404 → the run has ended.
  const resume = useCallback(
    async (id: string, accessCode: string) => {
      try {
        const s = await getState(id, accessCode);
        seenEvents.current = s.recentEvents.length;
        setState(s);
        setEnded(false);
      } catch (error) {
        if (forgetCodeOn401(error, setCode)) return;
        if (error instanceof ApiCallError && error.status === 404) {
          setEnded(true);
        } else {
          showToast(error instanceof ApiCallError ? error.message : "Could not load the run");
        }
      }
    },
    [showToast],
  );

  // Explicit new run (lobby button / New-run confirm). The ONLY caller of createRun.
  const createNewRun = useCallback(
    async (accessCode: string, how: "story" | "manual" = "manual") => {
      try {
        setBusy(true);
        const { runId: id } = await createRun(accessCode);
        seenEvents.current = 0;
        syncRunId(id);
        setEnded(false);
        setDayOver(false);
        fired.current = new Set();
        beatOpen.current = false;
        skippedRef.current = false;
        setBeat(null);
        setFocus(null);
        modeRef.current = how;
        setMode(how);
        setShowBriefing(how === "manual");
        await resume(id, accessCode);
        if (how === "story") {
          // Watch it work: autopilot on, 2×, play. Beats come from the state changes that follow.
          const s = await setAutopilot(id, accessCode, true);
          lastState.current = s;
          setState(s);
          setSpeed(2);
          setPlaying(true);
        }
      } catch (error) {
        if (forgetCodeOn401(error, setCode)) return;
        showToast(error instanceof ApiCallError ? error.message : "Could not start a run");
      } finally {
        setBusy(false);
      }
    },
    [resume, showToast, syncRunId],
  );

  // Story controls. Next: continue now. Skip: no more captions, autopilot keeps running. Take over:
  // autopilot off, paused, manual (Next-move bar).
  const continueStory = useCallback(() => {
    beatOpen.current = false;
    setBeat(null);
    if (!dayOverRef.current) setPlaying(true);
    // a later beat may already be true (e.g. dispatch right after the confirmation)
    void Promise.resolve().then(() => storyCheck(null, false));
  }, [storyCheck]);
  const skipStory = useCallback(() => {
    skippedRef.current = true;
    beatOpen.current = false;
    setBeat(null);
    if (!dayOverRef.current) setPlaying(true);
  }, []);

  // Each caption holds ~4 s, then the story continues by itself.
  useEffect(() => {
    if (!beat) return;
    const h = setTimeout(continueStory, 4000);
    return () => clearTimeout(h);
  }, [beat, continueStory]);

  // On passing the gate: resume the run from the URL/localStorage if there is one; else stay in the
  // lobby. This runs once per code change.
  const onGatePass = useCallback(
    (accessCode: string) => {
      setCode(accessCode);
      try {
        sessionStorage.setItem(CODE_KEY, accessCode);
      } catch {
        // ignore — the code just won't survive a reload on this tab
      }
      const fromUrl = params.get("run");
      const fromStore = (() => {
        try {
          return localStorage.getItem(RUN_KEY);
        } catch {
          return null;
        }
      })();
      const existing = fromUrl ?? fromStore;
      if (existing) {
        syncRunId(existing);
        void resume(existing, accessCode);
      }
    },
    [params, resume, syncRunId],
  );

  // When the code was restored from sessionStorage (reload), resume the run from ?run=/localStorage
  // once, without showing the gate again.
  const resumedOnMount = useRef(false);
  useEffect(() => {
    if (resumedOnMount.current || !code || runId) return;
    resumedOnMount.current = true;
    const existing =
      params.get("run") ??
      (() => {
        try {
          return localStorage.getItem(RUN_KEY);
        } catch {
          return null;
        }
      })();
    if (!existing) return;
    // Defer the state updates out of the effect body (avoids a synchronous setState-in-effect).
    void Promise.resolve().then(() => {
      syncRunId(existing);
      void resume(existing, code);
    });
  }, [code, runId, params, resume, syncRunId]);

  const doTick = useCallback(
    async (count = 1) => {
      if (!runId || !code || tickInFlight.current) return;
      tickInFlight.current = true;
      try {
        apply(await tickRun(runId, code, count));
      } catch (error) {
        if (forgetCodeOn401(error, setCode)) return;
        if (error instanceof ApiCallError && /day is over/i.test(error.message)) {
          setPlaying(false);
          setDayOver(true);
          storyCheck(null, true);
        } else {
          showToast(error instanceof ApiCallError ? error.message : "The tick failed; retrying");
        }
        // never reset state on error; the next tick/poll retries
      } finally {
        tickInFlight.current = false;
      }
    },
    [runId, code, apply, showToast, storyCheck],
  );

  // Play loop: tick every 3 s while visible; a tick in flight is skipped (doTick guards it).
  useEffect(() => {
    if (!playing || !runId) return;
    timer.current = setInterval(() => {
      if (!document.hidden) void doTick(speed);
    }, TICK_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [playing, speed, doTick, runId]);

  // Live sync: while PAUSED and not day-over, poll GET state every 3 s so a phone report appears within
  // 3 s. Skips while a tick is in flight and while the tab is hidden. Errors never reset state (backoff).
  useEffect(() => {
    if (!runId || !code || playing || ended || dayOver) return;
    let backoff = TICK_MS;
    let handle: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    const loop = async (): Promise<void> => {
      if (stopped) return;
      if (!document.hidden && !tickInFlight.current) {
        try {
          const s = await getState(runId, code);
          if (!stopped) apply(s);
          backoff = TICK_MS;
        } catch (error) {
          if (forgetCodeOn401(error, setCode)) return;
          if (error instanceof ApiCallError && error.status === 404) {
            setEnded(true);
            return;
          }
          backoff = Math.min(backoff * 2, 30000); // exponential backoff, capped
        }
      }
      if (!stopped) handle = setTimeout(() => void loop(), backoff);
    };
    handle = setTimeout(() => void loop(), TICK_MS);
    return () => {
      stopped = true;
      if (handle) clearTimeout(handle);
    };
  }, [runId, code, playing, ended, dayOver, apply]);

  const action = useCallback(
    async (fn: () => Promise<RunStateView>) => {
      setBusy(true);
      try {
        apply(await fn());
      } catch (error) {
        if (forgetCodeOn401(error, setCode)) return;
        showToast(error instanceof ApiCallError ? error.message : "Something went wrong");
      } finally {
        setBusy(false);
      }
    },
    [apply, showToast],
  );

  const takeOver = useCallback(() => {
    modeRef.current = "manual";
    setMode("manual");
    beatOpen.current = false;
    setBeat(null);
    setPlaying(false);
    if (runId && code) void action(() => setAutopilot(runId, code, false));
  }, [action, runId, code]);

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
      setFocus(id);
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

  // Phase 1: no code yet → the gate.
  if (!code) return <CodeGate onPass={onGatePass} />;

  // Phase 2: a run that 404'd → ended panel (never auto-creates a replacement).
  if (ended) {
    return (
      <RunEndedPanel
        onNewRun={() => {
          syncRunId(null);
          setState(null);
          setEnded(false);
        }}
      />
    );
  }

  // Phase 3: code accepted but no run yet → lobby with an explicit Start button.
  if (!runId || !state) {
    return (
      <RunLobby
        onWatch={() => void createNewRun(code, "story")}
        onSelf={() => void createNewRun(code, "manual")}
        busy={busy}
        onResume={runId ? () => void resume(runId, code) : undefined}
        toast={toast}
      />
    );
  }

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
          <span className={styles.longLabel}>City water health</span>
          <span className={styles.shortLabel}>Health</span>
          <span className={styles.healthBar} data-testid="health-bar">
            <span
              className={styles.healthFill}
              data-testid="health-fill"
              style={{ width: `${state.cityHealth}%`, background: healthColor(state.cityHealth) }}
            />
          </span>
          <CountUp className={styles.healthNum} value={state.cityHealth} />
        </span>
        <span className={styles.hudStat}>
          <span className={styles.longLabel}>Water recovered</span>
          <span className={styles.shortLabel}>Recovered</span>{" "}
          <CountUp value={state.waterRecoveredLitres} format={lakh} />
        </span>
        <PixelButton variant="secondary" onClick={() => setPhoneOpen(true)}>
          Phone
        </PixelButton>
        <PixelButton
          variant="secondary"
          className={styles.helpBtn}
          aria-label="How LeakSpot works"
          onClick={() => setHelpOpen(true)}
        >
          ?
        </PixelButton>
      </header>

      {helpOpen && <Explainer onClose={() => setHelpOpen(false)} />}

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

      <div
        className={styles.mapArea}
        onPointerMove={(e) => {
          touchRef.current = e.pointerType === "touch";
          if (touchRef.current) return;
          const box = e.currentTarget.getBoundingClientRect();
          const bar = e.currentTarget.querySelector(`.${styles.nextMove}`)?.getBoundingClientRect();
          const minY = bar ? bar.bottom - box.top + 8 : 8;
          const x = Math.min(e.clientX - box.left + 16, box.width - 380);
          const y = Math.max(e.clientY - box.top + 16, minY);
          setTipPos({ x: Math.max(8, x), y: Math.min(y, box.height - 40) });
        }}
        onPointerDown={(e) => {
          touchRef.current = e.pointerType === "touch";
        }}
      >
        {mode === "story" && beat ? (
          <StoryCaption
            beat={beat}
            onNext={continueStory}
            onSkip={skipStory}
            onTakeOver={takeOver}
          />
        ) : mode === "story" && !dayOver ? (
          <StoryBar onTakeOver={takeOver} />
        ) : (
          <div className={styles.nextMove}>
            <span className={styles.nextMoveText}>{move.text}</span>
            {move.action && move.label && (
              <PixelButton onClick={() => move.action && runAction(move.action)}>
                {move.label}
              </PixelButton>
            )}
          </div>
        )}

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

        {hover && tipPos && <SectorTooltip state={state} sectorId={hover} pos={tipPos} />}

        <CityCanvas
          sectorStatus={sectors}
          incidents={state.incidents}
          reports={state.recentReports}
          crew={crew}
          supplyOn={state.supplyOn}
          xray={xray}
          viewBox={viewBox}
          simClock={state.simClock}
          recoveredLitres={state.waterRecoveredLitres}
          fitKey={fitKey}
          focus={focus}
          onSelectSector={selectSector}
          onHoverSector={(id) => setHover(touchRef.current ? null : id)}
          onSelectReport={setSelectedReport}
        />

        {selectedReport && (
          <ReportPanel
            runId={runId}
            code={code}
            report={state.recentReports.find((r) => r.reportId === selectedReport) ?? null}
            onClose={() => setSelectedReport(null)}
          />
        )}

        {showBriefing && mode === "manual" && (
          <MissionBriefing onStart={() => setShowBriefing(false)} />
        )}
        {dayOver && (
          <DayReport
            state={state}
            onNewRun={() => {
              setPlaying(false);
              syncRunId(null);
              setState(null);
            }}
          />
        )}
        {confirmNewRun && (
          <div className={styles.modalWrap} onClick={() => setConfirmNewRun(false)}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
              <h2>Start a new run?</h2>
              <p className={styles.why}>Phones reporting into {runId} will no longer show here.</p>
              <div className={styles.cardActions}>
                <PixelButton
                  onClick={() => {
                    setConfirmNewRun(false);
                    setPlaying(false);
                    syncRunId(null);
                    setState(null);
                  }}
                >
                  Start new run
                </PixelButton>
                <PixelButton variant="secondary" onClick={() => setConfirmNewRun(false)}>
                  Keep this run
                </PixelButton>
              </div>
            </div>
          </div>
        )}
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
          aria-pressed={xray}
          onClick={() => setXray((v) => !v)}
        >
          X-ray
        </PixelButton>
        <PixelButton
          variant="secondary"
          onClick={() => {
            selectSector(null);
            setFitKey((k) => k + 1);
          }}
        >
          Fit city
        </PixelButton>
        <PixelButton variant="secondary" onClick={() => setConfirmNewRun(true)}>
          New run
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

function RunLobby({
  onWatch,
  onSelf,
  onResume,
  busy,
  toast,
}: {
  onWatch: () => void;
  onSelf: () => void;
  onResume?: () => void;
  busy: boolean;
  toast: string | null;
}): JSX.Element {
  return (
    <div className={styles.gate}>
      <div className={styles.gateCard} style={{ width: "min(760px, 100%)" }}>
        <h1>LeakSpot command centre</h1>
        <SimLabel />
        <ModeChooser onWatch={onWatch} onSelf={onSelf} busy={busy} />
        {onResume && (
          <PixelButton variant="secondary" onClick={onResume}>
            Resume my run
          </PixelButton>
        )}
        {toast && <div className={styles.error}>{toast}</div>}
      </div>
    </div>
  );
}

function RunEndedPanel({ onNewRun }: { onNewRun: () => void }): JSX.Element {
  return (
    <div className={styles.gate}>
      <div className={styles.gateCard}>
        <h1>This run has ended</h1>
        <SimLabel />
        <p>A private run expires after its day is over. Start a fresh one to keep going.</p>
        <PixelButton onClick={onNewRun}>New run</PixelButton>
      </div>
    </div>
  );
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
  // "Found by meters alone": incidents whose verdict never gained citizen evidence (meter-only).
  const meterOnly = state.incidents.filter(
    (i) => i.verdict === "HIDDEN_SUSPECTED" || i.verdict === "HIDDEN_AREA_KNOWN",
  ).length;
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
          <span>Found by meters alone</span>
          <span className={styles.reportNum}>{meterOnly}</span>
        </div>
        <PixelButton onClick={onNewRun}>New run</PixelButton>
      </div>
    </div>
  );
}

function SectorTooltip({
  state,
  sectorId,
  pos,
}: {
  state: RunStateView;
  sectorId: SectorId;
  pos: { x: number; y: number };
}): JSX.Element | null {
  const r = state.sectors.find((s) => s.id === sectorId);
  if (!r) return null;
  return (
    <div className={styles.tooltip} style={{ top: pos.y, left: pos.x }}>
      {sectorId}: in {litres(r.inflowLitres)} · used {litres(r.usedLitres)} · unaccounted{" "}
      {Math.round(r.lossRatio * 100)}% (usual {Math.round(r.baselineRatio * 100)}%)
    </div>
  );
}

function ReportPanel({
  runId,
  code,
  report,
  onClose,
}: {
  runId: string;
  code: string;
  report: RecentReport | null;
  onClose: () => void;
}): JSX.Element | null {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const reportId = report?.reportId ?? null;
  const isPhoto = report?.type === "leak_photo";
  useEffect(() => {
    if (!reportId || !isPhoto) return;
    let cancelled = false;
    getReportPhotoUrl(runId, reportId, code)
      .then((r) => {
        if (!cancelled) setPhotoUrl(r.url);
      })
      .catch(() => {
        /* no photo (e.g. local dev); the panel just omits it */
      });
    return () => {
      cancelled = true;
      setPhotoUrl(null);
    };
  }, [runId, code, reportId, isPhoto]);

  if (!report) return null;
  const ai =
    report.label && report.label !== "self_reported"
      ? `${labelWord(report.label)}${report.confidence ? ` · ${Math.round(report.confidence * 100)}% sure` : ""}`
      : "self-reported";
  return (
    <div className={styles.tooltip} style={{ top: 44, right: 12, left: "auto", maxWidth: 220 }}>
      <div>
        <strong>{report.code}</strong>
      </div>
      <div className={styles.why}>
        {report.source === "simulated" ? "simulated report" : "phone report"} · {report.sectorId}
      </div>
      <div className={styles.why}>AI: {ai}</div>
      <div className={styles.why}>
        {report.simTime ?? ""} · {report.status}
      </div>
      {photoUrl && (
        <img
          src={photoUrl}
          alt="Citizen photo"
          style={{ width: "100%", marginTop: 6, border: "1px solid var(--rule)" }}
        />
      )}
      <PixelButton variant="secondary" onClick={onClose}>
        Close
      </PixelButton>
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
