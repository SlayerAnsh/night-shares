import Link from "next/link";
import styles from "./Crumbs.module.css";

/** Breadcrumb trail. The last part is the current page and has no link. */
export function Crumbs({ parts }: { parts: [string, string?][] }) {
  return (
    <nav className={styles.crumbs} aria-label="Breadcrumb">
      <ol>
        {parts.map(([label, href], i) => (
          <li key={label}>
            {href && i < parts.length - 1 ? (
              <Link href={href}>{label}</Link>
            ) : (
              <span aria-current="page">{label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
