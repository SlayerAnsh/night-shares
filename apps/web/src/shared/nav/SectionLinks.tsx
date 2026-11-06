"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavLink } from "./apps";
import styles from "./SectionLinks.module.css";

export function SectionLinks({
  links,
  label,
}: {
  links: ReadonlyArray<NavLink>;
  label: string;
}) {
  const pathname = usePathname();
  return (
    <nav className={styles.links} aria-label={label}>
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={styles.link}
          aria-current={pathname === link.href ? "page" : undefined}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
