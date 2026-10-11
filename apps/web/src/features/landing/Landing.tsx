// Landing page (Monsoon Night, one viewport on desktop). The city is the hero — City3D in spectator
// mode (no labels, sky cycling through a day every 60 s, a quarter-turn every 20 s). Pitch, two buttons, a 3-step strip, and a "Built on
// AWS" row. No fake live ticker and no invented numbers.
import { useMemo, type JSX } from "react";
import { Link } from "react-router";
import { SECTORS, type SectorId } from "@leakspot/core/world";
import { CityCanvas } from "../../world/CityCanvas";
import type { SectorStatus } from "../../state/view-types";
import { PixelButton } from "../../ui/PixelButton";
import { SimLabel } from "../../ui/StatusBadge";
import styles from "./landing.module.css";

const STEPS = [
  { icon: "1", text: "Meters notice" },
  { icon: "2", text: "Citizens confirm" },
  { icon: "3", text: "Crew fixes, meters verify" },
];

const AWS = ["CloudFront", "Lambda", "DynamoDB", "S3", "Amazon Bedrock (Nova 2 Lite)", "CDK"];

export function Landing(): JSX.Element {
  // Spectator: every sector normal, so no status overlays or incidents — just a calm living city.
  const allNormal = useMemo(() => {
    const map = {} as Record<SectorId, SectorStatus>;
    for (const s of SECTORS) map[s.id] = "normal";
    return map;
  }, []);

  return (
    <main className={styles.landing}>
      <header className={styles.top}>
        <span className={styles.brand}>LeakSpot</span>
        <SimLabel />
      </header>

      <div className={styles.hero}>
        <CityCanvas
          sectorStatus={allNormal}
          supplyOn
          spectator
          simClock={{ day: 15, slotIndex: 6, label: "09:00" }}
        />
      </div>

      <section className={styles.pitch}>
        <h1 className={styles.headline}>Find the water the city can&apos;t see.</h1>
        <p className={styles.sub}>
          Meters notice the loss. Citizens show where. One crew fixes it, and the meters prove it.
        </p>
        <div className={styles.actions}>
          <PixelButton big={false}>
            <Link to="/report" className={styles.btnLink}>
              I see a leak
            </Link>
          </PixelButton>
          <PixelButton variant="secondary">
            <Link to="/command" className={styles.btnLink}>
              Enter command centre
            </Link>
          </PixelButton>
        </div>
        <p className={styles.judges}>
          Judges: the access code is in the project&apos;s submission form.
        </p>

        <ol className={styles.steps}>
          {STEPS.map((s) => (
            <li key={s.text} className={styles.step}>
              <span className={styles.stepIcon} aria-hidden>
                {s.icon}
              </span>
              {s.text}
            </li>
          ))}
        </ol>

        <div className={styles.aws}>
          Built on AWS:{" "}
          {AWS.map((a, i) => (
            <span key={a}>
              {a}
              {i < AWS.length - 1 ? " · " : ""}
            </span>
          ))}
        </div>
      </section>
    </main>
  );
}
