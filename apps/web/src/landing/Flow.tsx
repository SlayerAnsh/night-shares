import { Display } from "@night-shares/design-system";
import styles from "./Flow.module.css";

const steps = [
  {
    title: "Offered by the hotel",
    body: "The hotel sets a usual rate and how many rooms to offer. Each night starts at a price set from that rate.",
  },
  {
    title: "Traded",
    body: "Traders buy and sell room nights ahead of time. A fair price guides each night, and a cap keeps a room open for guests.",
  },
  {
    title: "Booked",
    body: "A guest pays once at the cheapest live price. The room night is used up at booking, and the hotel gets the reservation.",
  },
  {
    title: "Or released",
    body: "At release time, unsold room nights go back to the hotel. Traders who priced them fairly get part of their money back.",
  },
];

export function Flow() {
  return (
    <section className={styles.flow}>
      <div className={styles.head}>
        <Display className={styles.title}>How a night moves</Display>
        <p className={styles.lead}>
          Every room night starts with the hotel and ends one of two ways: a
          guest books it, or it goes back to the hotel at release time.
        </p>
      </div>
      <ol className={styles.steps}>
        {steps.map((step, i) => (
          <li key={step.title} className={styles.step}>
            <div className={styles.n}>{String(i + 1).padStart(2, "0")}</div>
            <h3>{step.title}</h3>
            <p>{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
