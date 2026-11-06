"use client";
import { type ReactNode, useEffect, useId, useRef } from "react";
import { cx } from "../cx";
import { IconButton } from "../IconButton";
import styles from "./Dialog.module.css";

export type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  // Anchor to the bottom edge, for panels on small screens.
  sheet?: boolean;
  className?: string;
};

// A modal on the native <dialog>, so focus trapping and Escape come free.
export function Dialog({
  open,
  onClose,
  title,
  children,
  sheet = false,
  className,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={cx(styles.dialog, sheet && styles.sheet, className)}
      onClose={onClose}
      onMouseDown={(event) => {
        // A press on the backdrop lands on the dialog element itself.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={styles.head}>
        <h3 id={titleId} className={styles.title}>
          {title}
        </h3>
        <IconButton label="Close" onClick={onClose}>
          <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M4 4l8 8M12 4l-8 8"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </IconButton>
      </div>
      <div className={styles.body}>{children}</div>
    </dialog>
  );
}
