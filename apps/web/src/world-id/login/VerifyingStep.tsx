import type { CSSProperties } from "react";
import type { AccessLevel } from "../../session/access";
import styles from "./Parts.module.css";
import verify from "./Verify.module.css";

export function VerifyingStep({ need }: { need: AccessLevel }) {
  const steps = [
    "Proof received from World App",
    `${need === "orb" ? "Orb" : "Device"} credential checked`,
    "USDC wallet on Arc ready",
  ];
  return (
    <>
      <div className={verify.spin} aria-hidden="true" />
      <h2 className={`${styles.title} ${styles.step}`}>
        Checking your World ID
      </h2>
      <p className={styles.ctx}>Your identity stays in World App.</p>
      <ol className={verify.steps} aria-live="polite">
        {steps.map((step, i) => (
          <li
            key={step}
            style={{ "--delay": `${450 + i * 420}ms` } as CSSProperties}
          >
            <span className={verify.tick} aria-hidden="true" />
            {step}
          </li>
        ))}
      </ol>
    </>
  );
}
