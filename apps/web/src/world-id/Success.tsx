"use client";
import type { User } from "@night-shares/proto/identity/v1/user_pb";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { CheckIcon } from "./login/icons";
import styles from "./login/Parts.module.css";
import { shortAddress } from "./login/short-address";
import verify from "./login/Verify.module.css";

export function Success({
  next,
  levelName,
  user,
}: {
  next: string;
  levelName: string;
  user: User | null;
}) {
  const router = useRouter();
  function go() {
    router.replace(next);
    router.refresh();
  }
  useEffect(() => {
    const timer = setTimeout(() => {
      router.replace(next);
      router.refresh();
    }, 1000);
    return () => clearTimeout(timer);
  }, [next, router]);
  return (
    <>
      <div className={verify.ok} aria-hidden="true">
        <CheckIcon />
      </div>
      <h2 className={`${styles.title} ${styles.step}`} role="status">
        Verified with World ID, {levelName}
      </h2>
      {user && (
        <dl className={verify.ids}>
          <div>
            <dt>Your ID here</dt>
            <dd>
              <span className={verify.mono}>{shortAddress(user.humanId)}</span>
              anonymous, only for Night Shares
            </dd>
          </div>
          <div>
            <dt>Wallet</dt>
            <dd>
              <span className={verify.mono}>
                {shortAddress(user.walletAddress)}
              </span>
              USDC on Arc
            </dd>
          </div>
        </dl>
      )}
      <button type="button" className={styles.btn} onClick={go}>
        Continue now
      </button>
      <p className={styles.note}>
        USDC wallet on Arc ready. Returning to your page.
      </p>
    </>
  );
}
