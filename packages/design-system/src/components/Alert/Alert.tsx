import type { HTMLAttributes } from "react";
import { cx } from "../cx";
import styles from "./Alert.module.css";

export type AlertProps = HTMLAttributes<HTMLParagraphElement> & {
  // Announce the line when it appears (role="alert"). Off for a static warning.
  live?: boolean;
};

// One red line for an error or a blocking warning.
export function Alert({ live = true, className, ...rest }: AlertProps) {
  return (
    <p
      role={live ? "alert" : undefined}
      className={cx(styles.alert, className)}
      {...rest}
    />
  );
}
