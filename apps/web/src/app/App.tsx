// App shell: the route table. / landing, /metrics live metrics, /report citizen flow, /t/:runId/:reportId ticket,
// /command the Command Centre, and a catch-all 404. Each route is wrapped in an error boundary and
// sets its own document head (title, description, theme-color).
import type { JSX, ReactNode } from "react";
import { BrowserRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CommandCentre } from "../features/command/CommandCentre";
import { ReportApp } from "../features/citizen/ReportApp";
import { TicketPage } from "../features/citizen/TicketPage";
import { Landing } from "../features/landing/Landing";
import { MetricsPage } from "../features/metrics/MetricsPage";
import { ErrorBoundary } from "./ErrorBoundary";
import { NotFound } from "./NotFound";
import { useHead, type Head } from "./head";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

const LIMEWASH = "#edf2f5";

/** Wrap a surface in its error boundary and set the document head for the route. */
function Surface({ head, children }: { head: Head; children: ReactNode }): JSX.Element {
  useHead(head);
  return <ErrorBoundary>{children}</ErrorBoundary>;
}

export function App(): JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route
            path="/"
            element={
              <Surface
                head={{
                  title: "LeakSpot · find the water the city can't see",
                  description:
                    "LeakSpot finds the water a city can't see: meters detect, citizens confirm, crews fix, meters verify.",
                }}
              >
                <Landing />
              </Surface>
            }
          />
          <Route
            path="/metrics"
            element={
              <Surface
                head={{
                  title: "Live metrics · LeakSpot",
                  description:
                    "Every LeakSpot run, counted: leaks found and verified, water recovered, reports and AI photo checks.",
                }}
              >
                <MetricsPage />
              </Surface>
            }
          />
          <Route
            path="/report"
            element={
              <Surface
                head={{
                  title: "Report a leak · LeakSpot",
                  description: "See a leak or low water? Report it in about 30 seconds.",
                  themeColor: LIMEWASH,
                }}
              >
                <ReportApp />
              </Surface>
            }
          />
          <Route
            path="/t/:runId/:reportId"
            element={
              <Surface
                head={{
                  title: "Your ticket · LeakSpot",
                  description: "Track your LeakSpot report from received to confirmed by meters.",
                  themeColor: LIMEWASH,
                }}
              >
                <TicketPage />
              </Surface>
            }
          />
          <Route
            path="/command"
            element={
              <Surface
                head={{
                  title: "Command centre · LeakSpot",
                  description: "Run Jaldhara's water for a day: detect, dispatch, repair, verify.",
                }}
              >
                <CommandCentre />
              </Surface>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
