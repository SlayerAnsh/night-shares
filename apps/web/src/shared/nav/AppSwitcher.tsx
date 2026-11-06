"use client";
import { cx } from "@night-shares/design-system";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import styles from "./AppSwitcher.module.css";
import { type AppKey, appKeys, apps } from "./apps";

// On small screens the links sit behind a disclosure button; on wide screens they are always shown.
export function AppSwitcher({ current }: { current: AppKey | null }) {
  const [isOpen, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isOpen) return;
    const close = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onEscape);
    };
  }, [isOpen]);
  const name = current ? apps[current].name : "Apps";
  return (
    <div ref={box} className={cx(styles.wrap, isOpen && styles.open)}>
      <button
        type="button"
        className={styles.button}
        aria-expanded={isOpen}
        aria-controls="nav-apps-list"
        aria-label={
          current ? `Switch app, current app ${name}` : "Night Shares apps"
        }
        onClick={() => setOpen(!isOpen)}
      >
        {name}
        <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
          <path
            d="M3 4.5 6 7.5 9 4.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <nav
        id="nav-apps-list"
        className={styles.list}
        aria-label="Night Shares apps"
      >
        {appKeys.map((key) => (
          <Link
            key={key}
            href={apps[key].home}
            className={styles.link}
            aria-current={key === current ? "page" : undefined}
            onClick={() => setOpen(false)}
          >
            {apps[key].name}
          </Link>
        ))}
      </nav>
    </div>
  );
}
