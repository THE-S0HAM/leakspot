// QR + link to join a run from a phone: /report?run=<CODE>. Renders the QR to a data URL with qrcode.
import { useEffect, useState, type JSX } from "react";
import QRCode from "qrcode";
import styles from "./command.module.css";

export function QrJoin({ runId }: { runId: string }): JSX.Element {
  const [dataUrl, setDataUrl] = useState("");
  const url = `${window.location.origin}/report?run=${runId}`;

  useEffect(() => {
    QRCode.toDataURL(url, { margin: 1, width: 144 })
      .then(setDataUrl)
      .catch(() => setDataUrl(""));
  }, [url]);

  return (
    <div className={styles.qr}>
      {dataUrl && <img src={dataUrl} alt={`QR code to join run ${runId}`} />}
      <div>
        <div>Run {runId}</div>
        <a href={url}>Report into this run</a>
      </div>
    </div>
  );
}
