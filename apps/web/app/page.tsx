import { Doors } from "../src/landing/Doors";
import { Flow } from "../src/landing/Flow";
import { Hero } from "../src/landing/Hero";
import styles from "../src/landing/Landing.module.css";
import { AppNav } from "../src/shared/nav/AppNav";

export default function Home() {
  return (
    <>
      <AppNav app={null} hero />
      <Hero />
      <main className={styles.main}>
        <Doors />
        <Flow />
      </main>
      <footer className={styles.footer}>
        <div className={styles.footerIn}>
          <span>Night Shares · demo build</span>
          <span>Prices and listings come from the demo market.</span>
        </div>
      </footer>
    </>
  );
}
