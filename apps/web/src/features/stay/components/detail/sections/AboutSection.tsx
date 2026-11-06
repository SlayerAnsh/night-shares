import styles from "../Detail.module.css";

const PROMISES = [
  ["Price locked when you pay", "Your room is booked in one step, no waiting"],
  [
    "Guests come first",
    "If rooms run short, one is taken back from a trader for you at a capped price",
  ],
  ["Check in with World ID", "Optional and quick at the property"],
] as const;

export function AboutSection({ blurb }: { blurb: string }) {
  return (
    <section className={styles.sec}>
      <h2>About this stay</h2>
      <p>{blurb}</p>
      <div className={styles.hl3}>
        {PROMISES.map(([title, body]) => (
          <div key={title}>
            <b>{title}</b>
            <span>{body}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
