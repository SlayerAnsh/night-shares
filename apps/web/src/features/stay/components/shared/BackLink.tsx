import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./BackLink.module.css";
import { Icon } from "./Icon";

export function BackLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={styles.back}>
      <Icon name="left" />
      {children}
    </Link>
  );
}
