import type { AccessLevel } from "../../session/access";
import styles from "./Intro.module.css";

const levels = {
  device: { name: "Device", sub: "Enough to book" },
  orb: {
    name: "Orb",
    sub: "Required to trade and host, one person one account",
  },
};

// The World ID level this page asks for. The route decides it, so it is shown, not chosen.
export function LevelRow({ need }: { need: AccessLevel }) {
  const level = levels[need];
  return (
    <div className={styles.level}>
      <span className={styles.levelName}>
        <span className={styles.radio} aria-hidden="true" />
        {level.name}
      </span>
      <span className={styles.levelSub}>{level.sub}</span>
    </div>
  );
}
