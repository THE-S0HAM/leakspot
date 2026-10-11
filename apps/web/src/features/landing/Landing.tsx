// Landing page (Monsoon Night, one viewport on desktop). The city is the hero — City3D in spectator
// mode (no labels, sky cycling through a day every 60 s, a quarter-turn every 20 s). Pitch, two buttons, a 3-step strip, and a "Built on
// AWS" row. No fake live ticker and no invented numbers.
import { useMemo, type JSX } from "react";
import { Link } from "react-router";
import { SECTORS, type SectorId } from "@leakspot/core/world";
import { CityCanvas } from "../../world/CityCanvas";
import type { SectorStatus } from "../../state/view-types";
import { PixelButton } from "../../ui/PixelButton";
import { SiteNav } from "../metrics/MetricsPage";
import { CoreCharts, HONESTY, KpiStrip } from "../metrics/MetricsSections";
import { useStats } from "../metrics/useStats";
import metricsStyles from "../metrics/metrics.module.css";
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

  const { stats, secondsAgo } = useStats();

  return (
    <main className={styles.landing}>
      {/* First viewport: nav, the living city, the pitch and the live KPI strip. */}
      <div className={styles.fold}>
        <SiteNav current="home" />

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
          <KpiStrip stats={stats} />
        </section>
      </div>

      <section className={metricsStyles.live} aria-labelledby="live-heading">
        <div className={metricsStyles.liveHead}>
          <h2 id="live-heading" className={metricsStyles.h2}>
            Live from every run
          </h2>
          <span className={metricsStyles.updated}>
            {secondsAgo === null ? "" : `updated ${secondsAgo} s ago`}
          </span>
        </div>
        <p className={metricsStyles.note}>{HONESTY}</p>
        {stats ? (
          <CoreCharts stats={stats} />
        ) : (
          <p className={metricsStyles.empty}>Loading the metrics…</p>
        )}
        <Link to="/metrics" className={metricsStyles.allLink}>
          All metrics →
        </Link>
      </section>

      <footer className={styles.footer}>
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
      </footer>
    </main>
  );
}
