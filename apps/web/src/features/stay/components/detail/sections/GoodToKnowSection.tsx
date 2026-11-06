import styles from "../Detail.module.css";

export function GoodToKnowSection() {
  return (
    <section className={styles.sec}>
      <h2>Good to know</h2>
      <p>
        Check-in from 15:00, check-out by 11:00. Your price is locked the moment
        you pay and your room is booked right away, in one step. We send the
        booking straight to the hotel. At the property you can check in with
        World ID to confirm your stay. It is optional, and the front desk can
        check you in too.
      </p>
    </section>
  );
}
