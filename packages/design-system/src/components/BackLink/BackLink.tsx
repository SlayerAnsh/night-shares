import type { ComponentType, ReactNode } from "react";
import { cx } from "../cx";
import { Icon } from "../Icon";
import styles from "./BackLink.module.css";

type LinkProps = { href: string; className?: string; children?: ReactNode };

export type BackLinkProps = {
  href: string;
  children: ReactNode;
  // The link element, for example next/link. Defaults to a plain anchor.
  as?: ComponentType<LinkProps> | "a";
  className?: string;
};

// Left chevron link back to the parent screen.
export function BackLink({
  href,
  children,
  as: Tag = "a",
  className,
}: BackLinkProps) {
  return (
    <Tag href={href} className={cx(styles.back, className)}>
      <Icon name="left" />
      <span>{children}</span>
    </Tag>
  );
}
