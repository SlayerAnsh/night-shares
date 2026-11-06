import type { CSSProperties } from "react";
import { cx } from "../cx";
import styles from "./Skeleton.module.css";

export type SkeletonProps = {
  width?: CSSProperties["width"];
  height?: CSSProperties["height"];
  radius?: CSSProperties["borderRadius"];
  className?: string;
};

// A grey block that stands in for content while it loads. Hidden from screen readers.
export function Skeleton({ width, height, radius, className }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={cx(styles.skeleton, className)}
      style={{ width, height, borderRadius: radius }}
    />
  );
}
