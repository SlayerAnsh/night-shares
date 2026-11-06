import { Icon } from "../../shared/Icon";
import styles from "../Detail.module.css";

export function AmenitiesSection({ amenities }: { amenities: string[] }) {
  return (
    <section className={styles.sec}>
      <h2>What's included</h2>
      <ul className={styles.amen}>
        {amenities.map((a) => (
          <li key={a}>
            <Icon name="check" />
            {a}
          </li>
        ))}
      </ul>
    </section>
  );
}
