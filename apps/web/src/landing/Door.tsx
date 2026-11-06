import { Badge, Display, Eyebrow } from "@night-shares/design-system";
import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./Doors.module.css";

export type DoorProps = {
  href: string;
  audience: string;
  badge: string;
  title: string;
  body: string;
  note?: string;
  action: string;
  viz: ReactNode;
};

// One of the three entry cards on the landing page.
export function Door(props: DoorProps) {
  return (
    <Link className={styles.door} href={props.href}>
      <div className={styles.top}>
        <Eyebrow>{props.audience}</Eyebrow>
        <Badge>{props.badge}</Badge>
      </div>
      {props.viz}
      <Display className={styles.title}>{props.title}</Display>
      <p className={styles.body}>{props.body}</p>
      {props.note && <p className={styles.note}>{props.note}</p>}
      <div className={styles.go}>
        <span>{props.action}</span>
        <span className={styles.arrow} aria-hidden="true">
          <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m6 3 5 5-5 5" />
          </svg>
        </span>
      </div>
    </Link>
  );
}
