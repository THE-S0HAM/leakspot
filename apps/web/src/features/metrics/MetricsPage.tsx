// /metrics: everything counted across every run, refreshed every 15 s.
import type { JSX } from "react";
import { Link } from "react-router";
import { SimLabel } from "../../ui/StatusBadge";
import { labelWord } from "../../ui/words";
import { CHART_COLORS, ChartCard, HBars, Histogram } from "./charts";
import { CoreCharts, HONESTY, KpiStrip, lakhNum, num } from "./MetricsSections";
import { useStats } from "./useStats";
import styles from "./metrics.module.css";

export function SiteNav({ current }: { current: "home" | "metrics" }): JSX.Element {
  return (
    <nav className={styles.nav} aria-label="Site">
      <Link to="/" className={styles.brand}>
        LeakSpot
      </Link>
      <SimLabel />
      <span className={styles.navLinks}>
        <Link to="/" aria-current={current === "home" ? "page" : undefined}>
          Home
        </Link>
        <Link to="/metrics" aria-current={current === "metrics" ? "page" : undefined}>
          Metrics
        </Link>
        <Link to="/report">Report a leak</Link>
        <Link to="/command">Command centre</Link>
      </span>
    </nav>
  );
}

const time = (iso: string | null): string =>
  iso
    ? new Date(iso).toLocaleString("en-IN", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "Asia/Kolkata",
      })
    : "earlier";

export function MetricsPage(): JSX.Element {
  const { stats, error, secondsAgo } = useStats();
  return (
    <main className={styles.page}>
      <SiteNav current="metrics" />
      <header className={styles.pageHead}>
        <h1 className={styles.h1}>Live from every run</h1>
        <p className={styles.note}>{HONESTY}</p>
        <p className={styles.updated} aria-live="polite">
          {error
            ? "Could not load the metrics. Retrying every 15 s."
            : secondsAgo === null
              ? "Loading…"
              : `Updated ${secondsAgo} s ago · refreshes every 15 s`}
        </p>
      </header>
      <KpiStrip stats={stats} />
      {stats && (
        <>
          <CoreCharts stats={stats} />
          <div className={styles.charts}>
            <ChartCard
              title="From found to verified"
              empty={stats.funnel.detected === 0}
              summary={`${num(stats.funnel.detected)} found, ${num(stats.funnel.dispatched)} got the crew, ${num(stats.funnel.repaired)} repaired, ${num(stats.funnel.verified)} verified by meters.`}
            >
              {(w) => (
                <HBars
                  width={w}
                  showShare
                  items={[
                    { label: "Found", value: stats.funnel.detected, color: CHART_COLORS.haldi },
                    {
                      label: "Dispatched",
                      value: stats.funnel.dispatched,
                      color: CHART_COLORS.neel,
                    },
                    { label: "Repaired", value: stats.funnel.repaired, color: CHART_COLORS.jal },
                    { label: "Verified", value: stats.funnel.verified, color: CHART_COLORS.neem },
                  ]}
                />
              )}
            </ChartCard>
            <ChartCard
              title="Priority scores"
              empty={stats.scoreHistogram.every((b) => b.count === 0)}
              summary={`Priority score (0 to 100) of all ${num(stats.totals.incidentsDetected)} leaks found, in bins of 10.`}
            >
              {(w) => (
                <Histogram
                  width={w}
                  bins={stats.scoreHistogram}
                  color={CHART_COLORS.haldi}
                  xTitle="priority score"
                  binLabel={(b) => String(b.from)}
                />
              )}
            </ChartCard>
            <ChartCard
              title="Time to verify"
              empty={stats.verifyHistogram.every((b) => b.count === 0)}
              emptyText={stats.totals.runs ? "No timed verifications yet" : "No runs yet"}
              summary={`Supply-time minutes from detection to verification for ${num(stats.verifyHistogram.reduce((a, b) => a + b.count, 0))} leaks with timings, in 15-minute bins.`}
            >
              {(w) => (
                <Histogram
                  width={w}
                  bins={stats.verifyHistogram}
                  color={CHART_COLORS.neem}
                  xTitle="supply minutes"
                  binLabel={(b) => String(b.from)}
                />
              )}
            </ChartCard>
            <ChartCard
              title="What the AI saw"
              empty={stats.aiLabels.length === 0}
              emptyText={stats.totals.runs ? "No phone photos checked yet" : "No runs yet"}
              summary={`${num(stats.totals.aiPhotoChecks)} phone photos checked by Amazon Bedrock (Nova 2 Lite): ${stats.aiLabels.map((l) => `${labelWord(l.label)} ${l.count}`).join(", ")}.`}
            >
              {(w) => (
                <HBars
                  width={w}
                  items={stats.aiLabels.map((l) => ({
                    label: labelWord(l.label),
                    value: l.count,
                    color: l.label === "not_a_leak" ? CHART_COLORS.dim : CHART_COLORS.neel,
                  }))}
                />
              )}
            </ChartCard>
          </div>
          <section className={styles.tableWrap} aria-label="Recent runs">
            <h2 className={styles.h2}>Recent runs</h2>
            {stats.recentRuns.length === 0 ? (
              <p className={styles.empty}>No runs yet</p>
            ) : (
              <div className={styles.scroll}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Run</th>
                      <th>Started (IST)</th>
                      <th>Clock</th>
                      <th>Found</th>
                      <th>Verified</th>
                      <th>Recovered</th>
                      <th>Phone reports</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.recentRuns.map((r) => (
                      <tr key={r.runId}>
                        <td>{r.runId}</td>
                        <td>{time(r.createdAt)}</td>
                        <td>{r.dayCompleted ? "day done" : r.clock}</td>
                        <td>{r.detected}</td>
                        <td>{r.verified}</td>
                        <td>{lakhNum(r.litresRecoveredPerDay)} lakh L/day</td>
                        <td>{r.phoneReports}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
      <p className={styles.note}>{HONESTY}</p>
    </main>
  );
}
