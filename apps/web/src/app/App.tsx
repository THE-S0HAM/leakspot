// App shell: the route table. / landing, /report citizen flow, /t/:runId/:reportId ticket,
// /command the Command Centre.
import type { JSX } from "react";
import { BrowserRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CommandCentre } from "../features/command/CommandCentre";
import { ReportApp } from "../features/citizen/ReportApp";
import { TicketPage } from "../features/citizen/TicketPage";
import { Landing } from "../features/landing/Landing";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

export function App(): JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/report" element={<ReportApp />} />
          <Route path="/t/:runId/:reportId" element={<TicketPage />} />
          <Route path="/command" element={<CommandCentre />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
