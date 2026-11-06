import styles from "./Intro.module.css";
import { FaceIcon, LockIcon, WalletIcon } from "./icons";

export function FinePrint({ why }: { why: string }) {
  const isTrading = why === "trade" || why === "portfolio";
  return (
    <ul className={styles.small}>
      <li>
        <LockIcon />
        <span>
          Night Shares gets an anonymous ID, never your name, photo or iris
          data.
        </span>
      </li>
      <li>
        <WalletIcon />
        <span>Also creates or links your USDC wallet on Arc.</span>
      </li>
      {isTrading && (
        <li>
          <FaceIcon />
          <span>
            Trading agents may ask for a fresh face check for actions over
            budget.
          </span>
        </li>
      )}
    </ul>
  );
}
