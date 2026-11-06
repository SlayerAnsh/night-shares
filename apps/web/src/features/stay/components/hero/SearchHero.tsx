import { Photo } from "@night-shares/design-system";
import { SearchBar } from "./SearchBar";
import styles from "./SearchHero.module.css";

const HERO =
  "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=2200&q=72";

// Photo hero with the search bar. Compact on detail and trips, as in the mock.
export function SearchHero({ compact = false }: { compact?: boolean }) {
  return (
    <section className={`${styles.hero} ${compact ? styles.compact : ""}`}>
      <Photo src={HERO} className={styles.photo} />
      <div className={styles.wrap}>
        {!compact && (
          <>
            <h1 className={styles.title}>Book the night.</h1>
            <p className={styles.sub}>
              Hand-picked stays. Prices follow demand, so quieter nights cost
              less, and guests always come before traders.
            </p>
          </>
        )}
        <SearchBar />
      </div>
    </section>
  );
}
