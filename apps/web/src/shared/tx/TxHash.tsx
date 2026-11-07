"use client";
import { useEffect, useState } from "react";
import styles from "./TxStatus.module.css";
import { explorerTxUrl, shortHash } from "./tx";

/** A shortened transaction hash with copy, linked only when the API names an explorer. */
export function TxHash({
  hash,
  explorerUrl,
  block = false,
}: {
  hash: string;
  explorerUrl?: string;
  // Its own row with space below, outside a status block.
  block?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timer);
  }, [copied]);
  const href = explorerTxUrl(explorerUrl, hash);
  const text = <code title={hash}>{shortHash(hash)}</code>;
  return (
    <span className={`${styles.hash} ${block ? styles.block : ""}`}>
      <span className={styles.hashLabel}>Transaction</span>
      {href ? (
        <a href={href} target="_blank" rel="noreferrer">
          {text}
        </a>
      ) : (
        text
      )}
      <button
        type="button"
        className={styles.copy}
        aria-label={copied ? "Copied" : "Copy transaction hash"}
        onClick={() => {
          void navigator.clipboard
            ?.writeText(hash)
            .then(() => setCopied(true))
            .catch(() => {});
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </span>
  );
}
