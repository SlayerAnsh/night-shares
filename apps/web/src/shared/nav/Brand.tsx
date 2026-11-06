import Link from "next/link";
import styles from "./Brand.module.css";
import { Logo } from "./Logo";

export function Brand() {
  return (
    <Link href="/" className={styles.brand} aria-label="Night Shares home">
      <Logo className={styles.mark} />
      <span className={styles.word}>Night Shares</span>
    </Link>
  );
}
