import { Icon, Spinner } from "@night-shares/design-system";
import type { ReactNode } from "react";
import { TxHash } from "./TxHash";
import styles from "./TxStatus.module.css";

export type TxPhase = "pending" | "confirmed" | "confirming" | "failed";

/**
 * One write's state as a quiet block: what is happening, the result the API
 * read back from the receipt, and the hash when there is one. With no hash
 * (mock mode) it is a plain status line.
 */
export function TxStatus({
  phase,
  title,
  children,
  hash,
  explorerUrl,
  action,
}: {
  phase: TxPhase;
  title: string;
  children?: ReactNode;
  hash?: string;
  explorerUrl?: string;
  action?: ReactNode;
}) {
  const failed = phase === "failed";
  return (
    <div
      className={`${styles.tx} ${styles[phase]}`}
      role={failed ? "alert" : "status"}
      aria-live={failed ? "assertive" : "polite"}
    >
      <span className={styles.mark} aria-hidden="true">
        {phase === "pending" || phase === "confirming" ? (
          <Spinner label="" />
        ) : phase === "confirmed" ? (
          <Icon name="check" />
        ) : (
          <Icon name="close" />
        )}
      </span>
      <div className={styles.body}>
        <b className={styles.title}>{title}</b>
        {children && <span className={styles.detail}>{children}</span>}
        {hash && <TxHash hash={hash} explorerUrl={explorerUrl} />}
        {action && <span className={styles.action}>{action}</span>}
      </div>
    </div>
  );
}
