// Live platform metrics: GET /api/stats every 15 s, plus "updated N s ago" that ticks each second.
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { StatsResponse } from "@leakspot/contracts";
import { getStats } from "../../api/client";

export const STATS_REFRESH_MS = 15_000;

export function useStats(): {
  stats: StatsResponse | undefined;
  error: boolean;
  secondsAgo: number | null;
} {
  const q = useQuery({
    queryKey: ["stats"],
    queryFn: getStats,
    refetchInterval: STATS_REFRESH_MS,
    refetchIntervalInBackground: false,
  });
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return {
    stats: q.data,
    error: q.isError && !q.data,
    secondsAgo: q.dataUpdatedAt ? Math.max(0, Math.round((now - q.dataUpdatedAt) / 1000)) : null,
  };
}

/** Litres/day → tanker-loads per month (10,000 L tankers, 30 days). */
export function tankerLoadsPerMonth(litresPerDay: number): number {
  return (litresPerDay * 30) / 10_000;
}
