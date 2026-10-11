// The "how do you want to see LeakSpot?" chooser, the guided-story caption card, and the one-screen
// explainer behind the "?" button. Plain components; CommandCentre owns the state.

import type { JSX } from "react";
import { PixelButton } from "../../ui/PixelButton";
import { SimLabel } from "../../ui/StatusBadge";
import { BEAT_COUNT, type Beat } from "./story";
import styles from "./command.module.css";

export function ModeChooser({
  onWatch,
  onSelf,
  busy = false,
}: {
  onWatch: () => void;
  onSelf: () => void;
  busy?: boolean;
}): JSX.Element {
  return (
    <div className={styles.chooser}>
      <h2 className={styles.chooserTitle}>How do you want to see LeakSpot?</h2>
      <div className={styles.chooserCards}>
        <button type="button" className={styles.modeCard} onClick={onWatch} disabled={busy}>
          <span className={styles.modeName}>Watch it work · 2 min</span>
          <span className={styles.modeText}>
            Autopilot runs the day at 2×. It pauses at each key moment with a short caption. Take
            over whenever you like.
          </span>
        </button>
        <button type="button" className={styles.modeCard} onClick={onSelf} disabled={busy}>
          <span className={styles.modeName}>Run it yourself</span>
          <span className={styles.modeText}>
            You run Jaldhara&apos;s water for one day: read the meters, dispatch the one crew, prove
            the fix.
          </span>
        </button>
      </div>
    </div>
  );
}

export function StoryCaption({
  beat,
  onNext,
  onSkip,
  onTakeOver,
}: {
  beat: Beat;
  onNext: () => void;
  onSkip: () => void;
  onTakeOver: () => void;
}): JSX.Element {
  return (
    <div className={styles.caption} role="status" aria-live="polite">
      <span className={styles.captionStep}>
        {beat.step} / {BEAT_COUNT}
      </span>
      <strong className={styles.captionTitle}>{beat.title}</strong>
      <p className={styles.captionText}>{beat.text}</p>
      <div className={styles.captionActions}>
        <PixelButton onClick={onNext}>Next</PixelButton>
        <PixelButton variant="secondary" onClick={onSkip}>
          Skip
        </PixelButton>
        <PixelButton variant="secondary" onClick={onTakeOver}>
          Take over
        </PixelButton>
      </div>
    </div>
  );
}

/** While the story runs between beats: a slim bar with Take over. */
export function StoryBar({ onTakeOver }: { onTakeOver: () => void }): JSX.Element {
  return (
    <div className={styles.storyBar}>
      <span>Watching it work · autopilot at 2×</span>
      <PixelButton variant="secondary" onClick={onTakeOver}>
        Take over
      </PixelButton>
    </div>
  );
}

const LOOP = [
  {
    n: "1",
    title: "Meters notice",
    text: "Each sector's inlet meter shows water going in that nobody uses.",
  },
  {
    n: "2",
    title: "Citizens confirm",
    text: "People send a photo or 'low water'; AI checks each photo.",
  },
  {
    n: "3",
    title: "A fixed score ranks",
    text: "Water lost, evidence, critical site, signals agree: 0–100.",
  },
  {
    n: "4",
    title: "Crew fixes, meters verify",
    text: "One crew goes to the top score. Done only when the meters are back to normal.",
  },
];

export function Explainer({ onClose }: { onClose: () => void }): JSX.Element {
  return (
    <div className={styles.modalWrap} onClick={onClose}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label="How LeakSpot works"
        onClick={(e) => e.stopPropagation()}
      >
        <h2>How LeakSpot works</h2>
        <SimLabel />
        <p>
          <strong>Goal:</strong> recover the most water by 20:00 with one crew.
        </p>
        <ol className={styles.loop}>
          {LOOP.map((s) => (
            <li key={s.n}>
              <span className={styles.loopNum}>{s.n}</span>
              <span>
                <strong>{s.title}</strong>
                <br />
                {s.text}
              </span>
            </li>
          ))}
        </ol>
        <PixelButton onClick={onClose}>Got it</PixelButton>
      </div>
    </div>
  );
}
