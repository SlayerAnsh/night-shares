"use client";
import { useEffect, useState } from "react";
import { useUrlState } from "../../hooks/use-url-state";
import styles from "./night.module.css";

// Phones: a compact bar that names the action and jumps to the order box.
// Hidden while the order box itself is on screen.
export function TicketBar() {
  const { params } = useUrlState();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const box = document.getElementById("ticket");
    if (!box || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(([entry]) =>
      setVisible(!entry?.isIntersecting),
    );
    observer.observe(box);
    return () => observer.disconnect();
  }, []);
  const mode = params.get("mode");
  const verb = mode === "sell" ? "Sell" : mode === "ask" ? "List" : "Buy";
  return (
    <button
      type="button"
      className={styles.bar}
      hidden={!visible}
      onClick={() => {
        const box = document.getElementById("ticket");
        box?.scrollIntoView({ behavior: "smooth", block: "start" });
        box
          ?.querySelector<HTMLInputElement>("input")
          ?.focus({ preventScroll: true });
      }}
    >
      <span>{verb}</span>
      <b>{params.get("size") ?? "0.1"} room nights</b>
      <span className={styles.barGo}>Open order box</span>
    </button>
  );
}
