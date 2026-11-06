import type { ReactNode } from "react";
import { WorldIdGlyph } from "../../shared/nav/WorldIdGlyph";
import styles from "./Parts.module.css";
import { shortAddress } from "./short-address";

export function AlreadyStep(props: {
  levelName: string;
  wallet: string;
  busy: boolean;
  onContinue: () => void;
  links: ReactNode;
}) {
  return (
    <>
      <div className={styles.mark} aria-hidden="true">
        <WorldIdGlyph />
      </div>
      <h1 className={styles.title}>You are signed in with World ID</h1>
      <p className={styles.ctx}>
        Verified with World ID, {props.levelName}. Wallet{" "}
        <span title={props.wallet}>{shortAddress(props.wallet)}</span> on Arc.
      </p>
      <button
        type="button"
        className={styles.btn}
        disabled={props.busy}
        onClick={props.onContinue}
      >
        Continue
      </button>
      {props.links}
    </>
  );
}
