import type { ReactNode } from "react";
import type { AccessLevel } from "../../session/access";
import { WorldIdGlyph } from "../../shared/nav/WorldIdGlyph";
import { FinePrint } from "./FinePrint";
import { LevelRow } from "./LevelRow";
import styles from "./Parts.module.css";

export function IntroStep(props: {
  reason: string;
  why: string;
  need: AccessLevel;
  busy: boolean;
  onStart: () => void;
  links: ReactNode;
}) {
  return (
    <>
      <div className={styles.mark} aria-hidden="true">
        <WorldIdGlyph />
      </div>
      <h1 className={styles.title}>Sign in with World ID</h1>
      <p className={styles.ctx}>{props.reason}</p>
      <LevelRow need={props.need} />
      <button
        type="button"
        className={styles.btn}
        disabled={props.busy}
        onClick={props.onStart}
      >
        <WorldIdGlyph />
        <span>Sign in with World ID</span>
      </button>
      <FinePrint why={props.why} />
      {props.links}
    </>
  );
}
