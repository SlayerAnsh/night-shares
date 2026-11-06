import type { CSSProperties, ReactNode } from "react";
import { cx } from "../cx";
import styles from "./Photo.module.css";

export type PhotoProps = {
  // Image URL. Without it only the tone gradient shows.
  src?: string;
  // Two colors for the placeholder gradient, taken from the photo.
  tone?: readonly [string, string];
  // Alt text. Leave empty for decorative photos.
  alt?: string;
  className?: string;
  children?: ReactNode;
};

// Size it with className; the photo covers the box.
export function Photo({
  src,
  tone,
  alt = "",
  className,
  children,
}: PhotoProps) {
  const style = tone
    ? ({ "--a": tone[0], "--b": tone[1] } as CSSProperties)
    : undefined;
  return (
    <div className={cx(styles.photo, className)} style={style}>
      {src && alt && (
        <div
          role="img"
          aria-label={alt}
          className={styles.image}
          style={{ backgroundImage: `url("${src}")` }}
        />
      )}
      {src && !alt && (
        <div
          aria-hidden="true"
          className={styles.image}
          style={{ backgroundImage: `url("${src}")` }}
        />
      )}
      {children}
    </div>
  );
}
