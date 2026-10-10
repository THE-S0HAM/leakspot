// 404 page in the Monsoon Night block style. Keeps the user one tap from the two real entry points.
import type { JSX } from "react";
import { Link } from "react-router";
import { PixelButton } from "../ui/PixelButton";
import { useHead } from "./head";
import styles from "./app.module.css";

export function NotFound(): JSX.Element {
  useHead({
    title: "Page not found · LeakSpot",
    description: "This LeakSpot page does not exist.",
  });
  return (
    <div className={styles.fallback}>
      <div className={styles.fallbackCard}>
        <h1>This page isn&apos;t here</h1>
        <p>The link may be old or mistyped. Pick where to go:</p>
        <div className={styles.fallbackActions}>
          <Link to="/">
            <PixelButton>Home</PixelButton>
          </Link>
          <Link to="/report">
            <PixelButton variant="secondary">Report a leak</PixelButton>
          </Link>
          <Link to="/command">
            <PixelButton variant="secondary">Command centre</PixelButton>
          </Link>
        </div>
      </div>
    </div>
  );
}
