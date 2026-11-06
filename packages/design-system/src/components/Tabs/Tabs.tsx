"use client";
import { type KeyboardEvent, type ReactNode, useRef } from "react";
import { cx } from "../cx";
import styles from "./Tabs.module.css";

export type TabOption<T extends string> = { value: T; label: ReactNode };

export type TabsProps<T extends string> = {
  options: ReadonlyArray<TabOption<T>>;
  value: T;
  onChange: (value: T) => void;
  // Names the tab list for screen readers.
  label: string;
  className?: string;
};

// A tab list. Render the matching panel below it with role="tabpanel".
export function Tabs<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: TabsProps<T>) {
  const list = useRef<HTMLDivElement>(null);
  function onKeyDown(event: KeyboardEvent) {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const index = options.findIndex((option) => option.value === value);
    const next = (index + step + options.length) % options.length;
    const option = options[next];
    if (!option) return;
    onChange(option.value);
    list.current
      ?.querySelectorAll<HTMLButtonElement>("[role=tab]")
      [next]?.focus();
  }
  return (
    <div
      ref={list}
      role="tablist"
      aria-label={label}
      className={cx(styles.tabs, className)}
      onKeyDown={onKeyDown}
    >
      {options.map((option) => {
        const isOn = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={isOn}
            tabIndex={isOn ? 0 : -1}
            className={styles.tab}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
