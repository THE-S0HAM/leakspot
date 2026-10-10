// Per-route error boundary: if a screen throws while rendering, show a calm block panel instead of a
// blank page. Reload keeps the current URL (so ?run=<id> and the sector survive). React error
// boundaries must be class components; everything else in the app is a function component.
import { Component, type ErrorInfo, type ReactNode } from "react";
import { PixelButton } from "../ui/PixelButton";
import styles from "./app.module.css";

type Props = { children: ReactNode };
type State = { failed: boolean };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // One line to the console; no logger on the web side, and we never swallow silently.
    console.error("Screen error:", error.message, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <div className={styles.fallback} role="alert">
        <div className={styles.fallbackCard}>
          <h1>Something broke on this screen</h1>
          <p>The rest of LeakSpot is fine. Reload to try this screen again.</p>
          {/* Reload the same URL so the run id and sector in the query string are kept. */}
          <PixelButton onClick={() => window.location.reload()}>Reload</PixelButton>
        </div>
      </div>
    );
  }
}
