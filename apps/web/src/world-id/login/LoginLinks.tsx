import Link from "next/link";
import styles from "./Parts.module.css";

export type LoginLinksProps = {
  // Public page to keep browsing, shown on the first step.
  browse?: string;
  onSwitch?: () => void;
  busy?: boolean;
};

export function LoginLinks({ browse, onSwitch, busy }: LoginLinksProps) {
  if (!browse && !onSwitch) return null;
  return (
    <div className={styles.links}>
      {browse && (
        <Link href={browse}>Continue browsing without signing in</Link>
      )}
      {onSwitch ? (
        <button type="button" disabled={busy} onClick={onSwitch}>
          Sign out and use a different World ID
        </button>
      ) : (
        <a
          href="https://world.org/download"
          target="_blank"
          rel="noopener"
          title="New to World ID? Get World App"
        >
          Get World App
        </a>
      )}
    </div>
  );
}
