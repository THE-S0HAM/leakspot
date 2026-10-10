// App shell: the route table. /command is the Command Centre (Half 4a). The citizen app (/report,
// /t/:runId/:reportId) and the landing (/) are filled in Half 4b; until then / links to /command.
import type { JSX } from "react";
import { BrowserRouter, Link, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CommandCentre } from "../features/command/CommandCentre";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

function LandingPlaceholder(): JSX.Element {
  return (
    <main
      style={{
        display: "grid",
        placeItems: "center",
        minHeight: "100vh",
        gap: 16,
        textAlign: "center",
      }}
    >
      <h1>LeakSpot</h1>
      <p>Find the water the city can&apos;t see.</p>
      <Link to="/command">Enter command centre</Link>
    </main>
  );
}

export function App(): JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPlaceholder />} />
          <Route path="/command" element={<CommandCentre />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
