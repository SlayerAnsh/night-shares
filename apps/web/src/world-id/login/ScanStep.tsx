import type { ReactNode } from "react";
import type { AccessLevel } from "../../session/access";
import styles from "./Parts.module.css";
import scan from "./Scan.module.css";
import { ScanCode } from "./ScanCode";

export function ScanStep(props: {
  need: AccessLevel;
  // Real World ID opens the IDKit widget; the mock shows a code and a simulate button.
  isWorldId: boolean;
  payload: string;
  seed: string;
  onSeed: (seed: string) => void;
  busy: boolean;
  onScan: () => void;
  links: ReactNode;
}) {
  const levelName = props.need === "orb" ? "Orb verified" : "Device";
  return (
    <>
      <h2 className={`${styles.title} ${styles.step}`}>Scan with World App</h2>
      <p className={styles.ctx}>
        Open World App, tap scan, then approve “Sign in to Night Shares”.
      </p>
      {!props.isWorldId && (
        <div className={scan.wrap}>
          <div
            className={scan.code}
            role="img"
            aria-label="World ID sign in code for World App"
          >
            <ScanCode payload={props.payload} />
          </div>
          <div className={scan.ask}>
            <span className={scan.pulse} aria-hidden="true" />
            <span>Waiting for World App</span>
          </div>
          <div className={scan.askLevel}>
            Asking for <b>{levelName}</b> World ID
          </div>
          <div className={scan.payload}>{props.payload}</div>
        </div>
      )}
      {!props.isWorldId && process.env.NODE_ENV === "development" && (
        <label className={scan.seed}>
          Demo seed
          <input
            value={props.seed}
            onChange={(event) => props.onSeed(event.target.value)}
          />
        </label>
      )}
      <button
        type="button"
        className={styles.btn}
        disabled={props.busy || (!props.isWorldId && !props.seed.trim())}
        onClick={props.onScan}
      >
        {props.isWorldId ? "Verify with World ID" : "Simulate scan"}
      </button>
      {!props.isWorldId && (
        <p className={styles.note}>
          Simulate scan is for the demo. It stands in for approving in World
          App.
        </p>
      )}
      {props.links}
    </>
  );
}
