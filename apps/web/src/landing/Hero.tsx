import { Display, Eyebrow, Photo } from "@night-shares/design-system";
import styles from "./Hero.module.css";
import { HeroActions } from "./HeroActions";

const heroPhoto =
  "https://images.unsplash.com/photo-1514282401047-d79a71a590e8?auto=format&fit=crop&w=2200&q=72";

export function Hero() {
  return (
    <section className={styles.hero}>
      <Photo
        src={heroPhoto}
        tone={["#7CC4CF", "#1D5C74"]}
        className={styles.photo}
      />
      <div className={styles.inner}>
        <Eyebrow as="p" className={styles.eyebrow}>
          Hotel room nights, priced by an open market
        </Eyebrow>
        <Display as="h1" className={styles.title}>
          Every night has a price.
        </Display>
        <p className={styles.lead}>
          Book a stay in one step, offer your rooms, or trade future room
          nights. One market, three doors in.
        </p>
        <HeroActions />
        <p className={styles.note}>
          Browse stays and markets freely. Sign in only to book, trade or host.
        </p>
      </div>
    </section>
  );
}
