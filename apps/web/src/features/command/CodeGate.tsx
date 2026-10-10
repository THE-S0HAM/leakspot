// 8-cell uppercase code gate. Accepts only the code alphabet (ABCDEFGHJKMNPQRSTVWXYZ23456789),
// paste-aware, shows uppercase, and checks the code via the API before granting access.
import { useRef, useState, type JSX, type ClipboardEvent, type KeyboardEvent } from "react";
import { checkCode } from "../../api/client";
import { PixelButton } from "../../ui/PixelButton";
import { SimLabel } from "../../ui/StatusBadge";
import styles from "./command.module.css";

const ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
const LEN = 8;

function clean(value: string): string {
  return value
    .toUpperCase()
    .split("")
    .filter((c) => ALPHABET.includes(c))
    .join("");
}

export function CodeGate({ onPass }: { onPass: (code: string) => void }): JSX.Element {
  const [cells, setCells] = useState<string[]>(Array(LEN).fill(""));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  const code = cells.join("");

  function setCell(i: number, raw: string): void {
    const c = clean(raw).slice(-1);
    setCells((prev) => {
      const next = [...prev];
      next[i] = c;
      return next;
    });
    if (c && i < LEN - 1) refs.current[i + 1]?.focus();
  }

  function onKeyDown(i: number, e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === "Backspace" && !cells[i] && i > 0) refs.current[i - 1]?.focus();
  }

  function onPaste(e: ClipboardEvent<HTMLInputElement>): void {
    e.preventDefault();
    const text = clean(e.clipboardData.getData("text")).slice(0, LEN);
    const next = Array(LEN).fill("");
    for (let i = 0; i < text.length; i += 1) next[i] = text[i];
    setCells(next);
    refs.current[Math.min(text.length, LEN - 1)]?.focus();
  }

  async function submit(): Promise<void> {
    if (code.length !== LEN) {
      setError("Enter all 8 characters.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await checkCode(code);
      onPass(code);
    } catch {
      setError("That code was not recognised.");
      setBusy(false);
    }
  }

  return (
    <div className={styles.gate}>
      <div className={styles.gateCard}>
        <h1>LeakSpot command centre</h1>
        <SimLabel />
        <p>Enter the command code</p>
        <div className={styles.codeRow}>
          {cells.map((c, i) => (
            <input
              key={i}
              ref={(el) => {
                refs.current[i] = el;
              }}
              className={styles.codeCell}
              value={c}
              inputMode="text"
              autoCapitalize="characters"
              maxLength={1}
              aria-label={`Code character ${i + 1}`}
              onChange={(e) => setCell(i, e.target.value)}
              onKeyDown={(e) => onKeyDown(i, e)}
              onPaste={onPaste}
            />
          ))}
        </div>
        <div className={styles.error}>{error}</div>
        <PixelButton onClick={() => void submit()} disabled={busy}>
          {busy ? "Checking…" : "Enter"}
        </PixelButton>
      </div>
    </div>
  );
}
