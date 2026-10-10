// /report: the citizen flow (product.md). Phone-first, Neel Limewash, one column. Join a run (code or
// ?run=), pick a language, choose "I see a leak" (photo + flowing/dripping) or "Low / no water", tap
// the spot on a flat MiniMap, Send with real upload progress, then a truthful PipelineLog from the two
// API calls, then "See my ticket". All data from the API; web never imports sim/scenario.

import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from "react";
import { useNavigate, useSearchParams } from "react-router";
import type { SectorId } from "@leakspot/core/world";
import { classifyReport, getPublicState } from "../../api/client";
import type { ClassifyResponse } from "../../state/view-types";
import { MiniMap, type MiniMapPin } from "../../world/MiniMap";
import { PixelButton } from "../../ui/PixelButton";
import { SimLabel } from "../../ui/StatusBadge";
import { PipelineLog, SegmentBar, type LogLine } from "../../ui/PipelineLog";
import { labelWord } from "../../ui/words";
import { LangContext, LANG_NAMES, useT, type Lang } from "../../i18n/t";
import { browserEncoder, compressPhoto, type CompressResult } from "./compress";
import { loadLang, saveLang, saveTicket } from "./storage";
import { postReport, UploadError } from "./upload";
import styles from "./citizen.module.css";

const MODEL_NAME = "Nova 2 Lite";

type Step = "home" | "leak" | "lowwater" | "sending" | "done";
type SelfChoice = "flowing" | "dripping" | "weak_flow" | "no_water";

export function ReportApp(): JSX.Element {
  const [lang, setLang] = useState<Lang>(() => loadLang() ?? "en");

  useEffect(() => {
    saveLang(lang);
    document.documentElement.lang = lang;
  }, [lang]);

  return (
    <LangContext.Provider value={lang}>
      <div data-theme="limewash">
        <ReportFlow lang={lang} onLang={setLang} />
      </div>
    </LangContext.Provider>
  );
}

function ReportFlow({ lang, onLang }: { lang: Lang; onLang: (l: Lang) => void }): JSX.Element {
  const t = useT();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const runFromLink = params.get("run");
  const sectorFromLink = (params.get("sector") as SectorId | null) ?? undefined;

  const [runId, setRunId] = useState<string | null>(runFromLink);
  const [runError, setRunError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("home");
  const [type, setType] = useState<"leak_photo" | "low_water">("leak_photo");
  const [selfChoice, setSelfChoice] = useState<SelfChoice | null>(null);
  const [photo, setPhoto] = useState<CompressResult | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [pin, setPin] = useState<MiniMapPin | null>(
    sectorFromLink ? { x: 0, z: 0, sectorId: sectorFromLink } : null,
  );
  const [offline, setOffline] = useState(!navigator.onLine);

  // Sending state
  const [uploadFrac, setUploadFrac] = useState(0);
  const [uploadDone, setUploadDone] = useState(false);
  const [serverStages, setServerStages] = useState<LogLine[] | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [classified, setClassified] = useState<ClassifyResponse | null>(null);
  const [newRid, setNewRid] = useState<string | null>(null);

  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  // Validate the run (unknown/expired → message).
  useEffect(() => {
    if (!runId) return;
    getPublicState(runId).catch(() => setRunError(t("runEnded")));
  }, [runId, t]);

  const resetFlow = useCallback(() => {
    setStep("home");
    setType("leak_photo");
    setSelfChoice(null);
    setPhoto(null);
    setPhotoError(null);
    setPin(sectorFromLink ? { x: 0, z: 0, sectorId: sectorFromLink } : null);
    setUploadFrac(0);
    setUploadDone(false);
    setServerStages(null);
    setSendError(null);
    setClassified(null);
    setNewRid(null);
  }, [sectorFromLink]);

  const canSend =
    pin !== null &&
    pin.sectorId !== undefined &&
    (type === "low_water" || photo !== null) &&
    selfChoice !== null;

  async function onPhoto(file: File): Promise<void> {
    setPhotoError(null);
    try {
      const result = await compressPhoto(file, browserEncoder());
      setPhoto(result);
    } catch {
      setPhotoError(t("photoTypeError"));
    }
  }

  async function send(): Promise<void> {
    if (!runId || !pin?.sectorId || !selfChoice) return;
    setStep("sending");
    setSendError(null);
    setUploadFrac(0);
    setUploadDone(false);
    try {
      const created = await postReport(
        runId,
        {
          type,
          x: pin.x,
          z: pin.z,
          lang,
          selfChoice,
          ...(type === "leak_photo" && photo ? { photoJpegBase64: photo.base64 } : {}),
        },
        setUploadFrac,
      );
      setUploadDone(true);
      setNewRid(created.reportId);

      // Classify (Bedrock for photos; immediate for low water) and render its real stages.
      const result = await classifyReport(runId, created.reportId);
      setClassified(result);
      setServerStages(toLogLines(result));
      saveTicket({ run: runId, rid: created.reportId, type, at: new Date().toISOString() });
      setStep("done");
    } catch (error) {
      if (error instanceof UploadError) {
        if (error.status === 429) setSendError(t("tooManyReports"));
        else if (error.code === "CONFLICT") setSendError(t("dayOverCitizen"));
        else setSendError(error.message);
      } else {
        setSendError(t("photoTypeError"));
      }
      setStep(type === "leak_photo" ? "leak" : "lowwater");
    }
  }

  function toLogLines(result: ClassifyResponse): LogLine[] {
    const lines: LogLine[] = [
      {
        text: t("photoSent"),
        state: "done",
        detail: photo ? `${Math.round(photo.bytes / 1024)} KB` : undefined,
      },
    ];
    if (result.rejected) {
      lines.push({ text: "checked", state: "done", detail: t("reportRejected") });
      return lines;
    }
    const aiDetail =
      result.label === "self_reported"
        ? "self-reported"
        : `${labelWord(result.label)}, ${Math.round(result.confidence * 100)}%, ${MODEL_NAME}`;
    lines.push({ text: "stored", state: "done" });
    lines.push({ text: "located", state: "done", detail: pin?.sectorId });
    lines.push({ text: "AI check", state: "done", detail: aiDetail });
    if (result.incident) {
      lines.push({ text: "matched", state: "done", detail: result.incident.id });
    }
    lines.push({ text: "scored", state: "done" });
    lines.push({ text: "done", state: "done" });
    return lines;
  }

  // ----- render -----
  const header = (
    <div className={styles.topbar}>
      <span className={styles.brand}>LeakSpot</span>
      <SimLabel />
      <span className={styles.spacer} />
      <span className={styles.langSwitch}>
        {(["en", "hi", "mr"] as Lang[]).map((l) => (
          <button
            key={l}
            className={`${styles.langBtn} ${lang === l ? styles.langBtnOn : ""}`}
            onClick={() => onLang(l)}
          >
            {LANG_NAMES[l]}
          </button>
        ))}
      </span>
    </div>
  );

  if (!runId) {
    return (
      <div className={styles.app}>
        {header}
        <div className={styles.body}>
          <RunCodeEntry onJoin={setRunId} />
        </div>
      </div>
    );
  }

  if (runError) {
    return (
      <div className={styles.app}>
        {header}
        <div className={styles.body}>
          <p>{runError}</p>
          <PixelButton onClick={() => navigate("/report")}>{t("joinRun")}</PixelButton>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.app}>
      {header}
      <div className={styles.body}>
        {offline && <div className={styles.offlineBanner}>{t("offline")}</div>}

        {step === "home" && (
          <>
            <div className={styles.bigButtons}>
              <PixelButton
                big
                onClick={() => {
                  setType("leak_photo");
                  setStep("leak");
                }}
              >
                💧 {t("iSeeALeak")}
              </PixelButton>
              <PixelButton
                big
                variant="secondary"
                onClick={() => {
                  setType("low_water");
                  setStep("lowwater");
                }}
              >
                🚰 {t("lowNoWater")}
              </PixelButton>
            </div>
            <MyTicketsLink />
          </>
        )}

        {step === "leak" && (
          <>
            <PhotoStep photo={photo} error={photoError} onPhoto={(f) => void onPhoto(f)} />
            {photo && (
              <div className={styles.choiceRow}>
                <PixelButton
                  variant={selfChoice === "flowing" ? "primary" : "secondary"}
                  onClick={() => setSelfChoice("flowing")}
                >
                  {t("flowing")}
                </PixelButton>
                <PixelButton
                  variant={selfChoice === "dripping" ? "primary" : "secondary"}
                  onClick={() => setSelfChoice("dripping")}
                >
                  {t("dripping")}
                </PixelButton>
              </div>
            )}
            {photo && selfChoice && <SpotStep pin={pin} onTap={setPin} />}
          </>
        )}

        {step === "lowwater" && (
          <>
            <div className={styles.choiceRow}>
              <PixelButton
                variant={selfChoice === "weak_flow" ? "primary" : "secondary"}
                onClick={() => setSelfChoice("weak_flow")}
              >
                {t("weakFlow")}
              </PixelButton>
              <PixelButton
                variant={selfChoice === "no_water" ? "primary" : "secondary"}
                onClick={() => setSelfChoice("no_water")}
              >
                {t("noWater")}
              </PixelButton>
            </div>
            {selfChoice && <SpotStep pin={pin} onTap={setPin} />}
          </>
        )}

        {step === "sending" && (
          <div style={{ display: "grid", gap: 12 }}>
            <div className={styles.sectionTitle}>{t("sending")}</div>
            {!uploadDone && <SegmentBar fraction={uploadFrac} />}
            <PipelineLog
              lines={
                serverStages ?? [
                  {
                    text: t("photoSent"),
                    state: uploadDone ? "done" : "active",
                    detail: photo ? `${Math.round(photo.bytes / 1024)} KB` : undefined,
                  },
                  { text: t("checkingServer"), state: uploadDone ? "active" : "pending" },
                ]
              }
            />
          </div>
        )}

        {step === "done" && newRid && (
          <div style={{ display: "grid", gap: 12 }}>
            <PipelineLog lines={serverStages ?? []} />
            {classified?.rejected ? (
              <p className={styles.error}>{t("reportRejected")}</p>
            ) : (
              <PixelButton onClick={() => navigate(`/t/${runId}/${newRid}`)}>
                {t("seeMyTicket")}
              </PixelButton>
            )}
            <PixelButton variant="secondary" onClick={resetFlow}>
              {t("iSeeALeak")}
            </PixelButton>
          </div>
        )}
      </div>

      {(step === "leak" || step === "lowwater") && (
        <div className={styles.thumbZone}>
          {sendError && <div className={styles.error}>{sendError}</div>}
          <PixelButton big disabled={!canSend} onClick={() => void send()}>
            {t("send")}
          </PixelButton>
        </div>
      )}
    </div>
  );
}

function PhotoStep({
  photo,
  error,
  onPhoto,
}: {
  photo: CompressResult | null;
  error: string | null;
  onPhoto: (file: File) => void;
}): JSX.Element {
  const t = useT();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const previewUrl = useMemo(
    () => (photo ? `data:image/jpeg;base64,${photo.base64}` : null),
    [photo],
  );
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onPhoto(file);
        }}
      />
      {previewUrl && (
        <img className={styles.preview} src={previewUrl} alt="Your photo of the leak" />
      )}
      {photo && (
        <div className={styles.previewMeta}>
          {Math.round(photo.bytes / 1024)} KB · {t("locationRemoved")}
        </div>
      )}
      {error && <div className={styles.error}>{error}</div>}
      <PixelButton big onClick={() => inputRef.current?.click()}>
        📷 {photo ? t("retakePhoto") : t("takePhoto")}
      </PixelButton>
    </div>
  );
}

function SpotStep({
  pin,
  onTap,
}: {
  pin: MiniMapPin | null;
  onTap: (p: MiniMapPin) => void;
}): JSX.Element {
  const t = useT();
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div className={styles.sectionTitle}>{t("tapTheSpot")}</div>
      <MiniMap pin={pin} onTap={onTap} />
      <div className={styles.spotHint}>{pin?.sectorId ? `Sector ${pin.sectorId}` : ""}</div>
    </div>
  );
}

function RunCodeEntry({ onJoin }: { onJoin: (runId: string) => void }): JSX.Element {
  const t = useT();
  const [value, setValue] = useState("");
  const clean = value
    .toUpperCase()
    .replace(/[^0-9A-HJKMNP-TV-Z]/g, "")
    .slice(0, 5);
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div className={styles.sectionTitle}>{t("runCodePrompt")}</div>
      <input
        className={styles.codeCell}
        style={{ width: "100%", letterSpacing: "0.4em" }}
        value={clean}
        inputMode="text"
        autoCapitalize="characters"
        maxLength={5}
        aria-label={t("runCodePrompt")}
        onChange={(e) => setValue(e.target.value)}
      />
      <PixelButton disabled={clean.length !== 5} onClick={() => onJoin(clean)}>
        {t("send")}
      </PixelButton>
    </div>
  );
}

function MyTicketsLink(): JSX.Element | null {
  const t = useT();
  const navigate = useNavigate();
  const tickets = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("leakspot.tickets") ?? "[]") as {
        run: string;
        rid: string;
      }[];
    } catch {
      return [];
    }
  }, []);
  if (tickets.length === 0) return null;
  return (
    <div className={styles.ticketList}>
      <div className={styles.sectionTitle}>
        {t("myTickets")} ({tickets.length})
      </div>
      {tickets.slice(0, 5).map((tk) => (
        <button
          key={tk.rid}
          className={styles.ticketRow}
          onClick={() => navigate(`/t/${tk.run}/${tk.rid}`)}
        >
          {tk.run}-{tk.rid.slice(-4)}
        </button>
      ))}
    </div>
  );
}
