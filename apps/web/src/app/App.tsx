// App shell: renders the single pixel "LeakSpot" title; the seed surface proving the web workspace builds.
import type { JSX } from "react";
import styles from "./app.module.css";

export function App(): JSX.Element {
  return <h1 className={styles.title}>LeakSpot</h1>;
}
