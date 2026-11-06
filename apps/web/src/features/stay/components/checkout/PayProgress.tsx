import styles from "./Checkout.module.css";

const STEPS = [
  "Paying in USDC",
  "Locking your price",
  "Booking your room",
  "Sending to your hotel",
];

// The one transaction, named step by step while it runs.
export function PayProgress() {
  return (
    <ol className={styles.steps} role="status" aria-label="Booking in progress">
      {STEPS.map((step) => (
        <li key={step}>
          <span className={styles.dot} aria-hidden="true" />
          {step}
        </li>
      ))}
    </ol>
  );
}
