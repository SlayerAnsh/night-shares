import {
  cx,
  Button as DsButton,
  buttonClass as dsButtonClass,
} from "@night-shares/design-system";
import type { ButtonHTMLAttributes } from "react";
import styles from "./button.module.css";

// default and primary are the design system button (btn-x in the mock).
// go (the order box action), quiet and text have no design system match yet.
export type ButtonVariant = "default" | "primary" | "quiet" | "go" | "text";

export function buttonClass(variant: ButtonVariant = "default") {
  if (variant === "default")
    return dsButtonClass({ variant: "ghost", size: "sm" });
  if (variant === "primary")
    return dsButtonClass({ variant: "primary", size: "sm" });
  if (variant === "go")
    return cx(
      dsButtonClass({ variant: "primary", size: "lg", block: true }),
      styles.go,
    );
  return cx(styles.local, styles[variant]);
}

export function Button({
  variant = "default",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  if (variant === "default" || variant === "primary")
    return (
      <DsButton
        type={type}
        variant={variant === "default" ? "ghost" : "primary"}
        size="sm"
        className={className}
        {...props}
      />
    );
  return (
    <button
      type={type}
      className={cx(buttonClass(variant), className)}
      {...props}
    />
  );
}
