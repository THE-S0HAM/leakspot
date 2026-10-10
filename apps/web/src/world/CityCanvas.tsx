// CityCanvas: chooses the 3D city (City3D, lazy-loaded) or the SVG CityView, behind the SAME props so
// the Command Centre and Landing never change. Falls back to the SVG map when: WebGL is unavailable,
// the URL carries ?view=2d, or City3D throws (a local error boundary). City3D's JS is a separate chunk
// so the citizen bundle is unaffected; a TankGauge shows while it loads.

import {
  Component,
  lazy,
  Suspense,
  useMemo,
  type ErrorInfo,
  type JSX,
  type ReactNode,
} from "react";
import { CityView } from "./CityView";
import type { CityViewProps } from "./CityView";
import { TankGauge } from "../ui/TankGauge";

// Named export only (repo rule bans default exports); map it to the shape React.lazy expects.
const City3D = lazy(() => import("./City3D").then((m) => ({ default: m.City3D })));

export type CityCanvasProps = CityViewProps & {
  simClock?: { day: number; slotIndex: number; label: string };
};

/** True when a WebGL context can be created. Cached after the first check. */
let webglOk: boolean | null = null;
function hasWebGL(): boolean {
  if (webglOk !== null) return webglOk;
  if (typeof document === "undefined") return (webglOk = false);
  try {
    const canvas = document.createElement("canvas");
    webglOk = !!(
      window.WebGLRenderingContext &&
      (canvas.getContext("webgl") || canvas.getContext("experimental-webgl"))
    );
  } catch {
    webglOk = false;
  }
  return webglOk;
}

function wants2d(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("view") === "2d";
}

// If City3D throws at runtime, show the SVG map instead of a blank screen.
class City3DBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("City3D failed, falling back to the 2D map:", error.message, info.componentStack);
  }
  render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function CityCanvas(props: CityCanvasProps): JSX.Element {
  const use2d = useMemo(() => wants2d() || !hasWebGL(), []);
  const svg = <CityView {...props} />;
  if (use2d) return svg;
  return (
    <City3DBoundary fallback={svg}>
      <Suspense fallback={<TankGauge />}>
        <City3D {...props} />
      </Suspense>
    </City3DBoundary>
  );
}
