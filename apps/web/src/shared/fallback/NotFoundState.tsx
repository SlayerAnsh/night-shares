import { buttonClass, Card } from "@night-shares/design-system";
import Link from "next/link";
import type { FallbackLink } from "./ErrorState";
import styles from "./Fallback.module.css";

/** A page that does not exist: say so, offer the obvious next page and a few others. */
export function NotFoundState({
  title,
  text,
  primary,
  links = [],
}: {
  title: string;
  text: string;
  primary: FallbackLink;
  links?: FallbackLink[];
}) {
  return (
    <div className={styles.page}>
      <Card as="section" className={styles.state}>
        <span className={styles.code} aria-hidden="true">
          404
        </span>
        <span className={styles.eyebrow}>Page not found</span>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.text}>{text}</p>
        <div className={styles.actions}>
          <Link
            href={primary.href}
            className={buttonClass({ variant: "primary" })}
          >
            {primary.label}
          </Link>
        </div>
        {links.length > 0 && (
          <ul className={styles.links} aria-label="Other places to go">
            {links.map((link) => (
              <li key={link.href}>
                <Link href={link.href}>{link.label}</Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
