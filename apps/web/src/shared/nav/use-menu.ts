"use client";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";

// Open state for a small menu: closes on outside press and Escape, arrows move focus.
export function useMenu() {
  const [isOpen, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isOpen) return;
    const close = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [isOpen]);
  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") return setOpen(false);
    const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    if (!isOpen) setOpen(true);
    const items = Array.from(
      box.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [],
    );
    const index = items.indexOf(document.activeElement as HTMLElement);
    items[(index + step + items.length) % items.length]?.focus();
  }
  return { isOpen, setOpen, box, onKeyDown };
}
