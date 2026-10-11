// The metrics building blocks shared by the landing page and /metrics: the KPI strip, the three
// "live from every run" charts, and the honesty note.

import type { JSX } from "react";
import type { StatsResponse } from "@leakspot/contracts";
import { CountUp } from "../../ui/CountUp";
import { AreaChart, CHART_COLORS, ChartCard, GroupedBars, Radar, Sparkline } from "./charts";
import { tankerLoadsPerMonth } from "./useStats";
import styles from "./metrics.module.css";

const inIN = new Intl.NumberFormat("en-IN");
export const num = (n: number): string => inIN.format(Math.round(n));
/** Litres as "12.3 lakh" (no unit; the tile says L/day). */
export const lakhNum = (n: number): string => (n / 100_000).toFixed(1);

export const HONESTY =
  "Every run is a simulated city day. Phone reports and AI photo checks are real.";

function Tile({
  label,
  value,
  format = num,
  sub,
  spark,
  color,
  keepSub = false,
}: {
  label: string;
  value: number;
  format?: (n: number) => string;
  sub?: string;
  spark: readonly number[];
  color: string;
  /** keep the subtitle on phones too (the others are dropped there to keep the strip above the fold) */
  keepSub?: boolean;
}): JSX.Element {
  return (
    <div className={`${styles.tile} ${keepSub ? styles.keepSub : ""}`}>
      <span className={styles.tileLabel}>{label}</span>
      <CountUp className={styles.tileValue} value={value} from={0} format={format} />
      {sub && <span className={styles.tileSub}>{sub}</span>}
      <Sparkline values={spark} color={color} />
    </div>
  );
}

/** Six KPI tiles with 30-day sparklines; numbers count up from 0 on first load. */
export function KpiStrip({ stats }: { stats: StatsResponse | undefined }): JSX.Element {
  const t = stats?.totals;
  const d = stats?.daily ?? [];
  const pick = (f: (x: StatsResponse["daily"][number]) => number) => d.map(f);
  if (!t) {
    return (
      <div className={styles.kpis} aria-busy="true">
        {[
          "Runs",
          "Leaks found",
          "Leaks resolved",
          "Reports",
          "AI photo checks",
          "Water recovered",
        ].map((l) => (
          <div key={l} className={styles.tile}>
            <span className={styles.tileLabel}>{l}</span>
            <span className={styles.tileValue}>–</span>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className={styles.kpis}>
      <Tile label="Runs" value={t.runs} spark={pick((x) => x.runs)} color={CHART_COLORS.jal} />
      <Tile
        label="Leaks found"
        value={t.incidentsDetected}
        spark={pick((x) => x.detected)}
        color={CHART_COLORS.haldi}
      />
      <Tile
        label="Leaks resolved"
        value={t.verified}
        sub="verified by meters"
        spark={pick((x) => x.verified)}
        color={CHART_COLORS.neem}
      />
      <Tile
        label="Reports"
        value={t.phoneReports + t.simulatedReports}
        sub={`${num(t.phoneReports)} phone · ${num(t.simulatedReports)} simulated`}
        spark={pick((x) => x.phoneReports + x.simulatedReports)}
        color={CHART_COLORS.ink}
      />
      <Tile
        label="AI photo checks"
        value={t.aiPhotoChecks}
        sub="Amazon Bedrock"
        spark={pick((x) => x.aiPhotoChecks)}
        color={CHART_COLORS.neel}
      />
      <Tile
        label="Water recovered"
        value={t.litresRecoveredPerDay}
        format={(n) => `${lakhNum(n)} lakh L/day`}
        sub={`≈ ${num(tankerLoadsPerMonth(t.litresRecoveredPerDay))} tanker-loads a month`}
        spark={pick((x) => x.litresRecoveredPerDay)}
        color={CHART_COLORS.jal}
        keepSub
      />
    </div>
  );
}

/** Water recovered per day, found vs resolved per day, and the resolved-leak score profile. */
export function CoreCharts({ stats }: { stats: StatsResponse }): JSX.Element {
  const dates = stats.daily.map((d) => d.date);
  const litres = stats.daily.map((d) => d.litresRecoveredPerDay);
  const found = stats.daily.map((d) => d.detected);
  const resolved = stats.daily.map((d) => d.verified);
  const sumL = litres.reduce((a, b) => a + b, 0);
  const sumF = found.reduce((a, b) => a + b, 0);
  const sumR = resolved.reduce((a, b) => a + b, 0);
  const best = stats.daily.reduce<StatsResponse["daily"][number] | undefined>(
    (a, b) => (!a || b.litresRecoveredPerDay > a.litresRecoveredPerDay ? b : a),
    undefined,
  );
  const p = stats.scoreProfile;
  return (
    <div className={styles.charts}>
      <ChartCard
        title="Water recovered per day"
        empty={sumL === 0}
        emptyText={stats.totals.runs ? "No water recovered in the last 30 days yet" : "No runs yet"}
        summary={`${lakhNum(sumL)} lakh L/day recovered over the last 30 days${best && best.litresRecoveredPerDay > 0 ? `; the best day was ${best.date} with ${lakhNum(best.litresRecoveredPerDay)} lakh` : ""}.`}
      >
        {(w) => (
          <AreaChart
            width={w}
            dates={dates}
            values={litres}
            format={(v) => `${lakhNum(v)} lakh`}
            yTitle="L/day recovered"
          />
        )}
      </ChartCard>
      <ChartCard
        title="Leaks found vs resolved per day"
        empty={sumF === 0}
        emptyText={stats.totals.runs ? "No leaks found in the last 30 days yet" : "No runs yet"}
        summary={`${num(sumF)} leaks found and ${num(sumR)} resolved (verified by meters) in the last 30 days.`}
      >
        {(w) => (
          <GroupedBars
            width={w}
            dates={dates}
            yTitle="leaks"
            series={[
              { name: "found", color: CHART_COLORS.haldi, values: found },
              { name: "resolved", color: CHART_COLORS.neem, values: resolved },
            ]}
          />
        )}
      </ChartCard>
      <ChartCard
        title="Score profile of resolved leaks"
        empty={p.n === 0}
        emptyText={stats.totals.runs ? "No leaks resolved yet" : "No runs yet"}
        summary={`Average of ${num(p.n)} resolved leaks: water lost ${p.W.toFixed(2)}, evidence ${p.E.toFixed(2)}, critical site ${p.C.toFixed(2)}, signals agree ${p.K.toFixed(2)} (each 0 to 1).`}
      >
        {(w) => <Radar width={w} profile={p} />}
      </ChartCard>
    </div>
  );
}
