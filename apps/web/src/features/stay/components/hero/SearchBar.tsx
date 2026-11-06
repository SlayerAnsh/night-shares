"use client";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useSearchResults } from "../../hooks/use-search-results";
import { formatShort, plural } from "../../model/dates";
import { RangeCalendar } from "../shared/calendar/RangeCalendar";
import { GuestCounters } from "../shared/GuestCounters";
import { Icon } from "../shared/Icon";
import styles from "./SearchBar.module.css";
import { WhereList } from "./WhereList";

type Pop = "where" | "dates" | "guests" | null;

// The glass search bar from the mock: where, dates and guests, each with a
// popover. Every change lands in the URL straight away, like the rest of Stay.
export function SearchBar() {
  const { state, update, href, router, destinations } = useSearchResults();
  const pathname = usePathname();
  const [pop, setPop] = useState<Pop>(null);
  const root = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!pop) return;
    const away = (e: Event) => {
      if (!root.current?.contains(e.target as Node)) setPop(null);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setPop(null);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [pop]);
  const guests = state.adults + state.kids;
  const dates = state.checkIn
    ? `${formatShort(state.checkIn)} → ${state.checkOut ? formatShort(state.checkOut) : "Check-out"}`
    : "";
  function submit() {
    setPop(null);
    if (pathname !== "/stay") return router.push(href("/stay"));
    document.getElementById("results")?.scrollIntoView({ behavior: "smooth" });
  }
  return (
    <form
      ref={root}
      className={styles.search}
      autoComplete="off"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label className={`${styles.sf} ${pop === "where" ? styles.active : ""}`}>
        <Icon name="pin" />
        <div>
          <span className={styles.lbl}>Where to</span>
          <input
            className={styles.input}
            placeholder="City, hotel, or region"
            value={state.destination}
            onFocus={() => setPop("where")}
            onChange={(e) => update({ destination: e.target.value })}
          />
        </div>
      </label>
      <button
        type="button"
        className={`${styles.sf} ${pop === "dates" ? styles.active : ""}`}
        aria-expanded={pop === "dates"}
        onClick={() => setPop("dates")}
      >
        <Icon name="cal" />
        <div>
          <span className={styles.lbl}>Dates</span>
          <span className={`${styles.val} ${dates ? "" : styles.placeholder}`}>
            {dates || "Check-in → Check-out"}
          </span>
        </div>
      </button>
      <button
        type="button"
        className={`${styles.sf} ${pop === "guests" ? styles.active : ""}`}
        aria-expanded={pop === "guests"}
        onClick={() => setPop("guests")}
      >
        <Icon name="user" />
        <div>
          <span className={styles.lbl}>Guests</span>
          <span className={styles.val}>
            {plural(guests, "guest")} · {plural(state.rooms, "room")}
          </span>
        </div>
      </button>
      <button type="submit" className={styles.go}>
        Search
      </button>
      {pop === "where" && (
        <div className={`${styles.pop} ${styles.popWhere}`}>
          <WhereList
            query={state.destination}
            destinations={destinations.data?.destinations ?? []}
            error={destinations.error}
            onPick={(city) => {
              update({ destination: city });
              setPop("dates");
            }}
          />
        </div>
      )}
      {pop === "dates" && (
        <div className={`${styles.pop} ${styles.popDates}`}>
          <RangeCalendar
            value={{ checkIn: state.checkIn, checkOut: state.checkOut }}
            onChange={(range) => {
              update(range);
              if (range.checkOut) setPop("guests");
            }}
            onDone={() => setPop(null)}
          />
        </div>
      )}
      {pop === "guests" && (
        <div className={`${styles.pop} ${styles.popGuests}`}>
          <GuestCounters onDone={() => setPop(null)} />
        </div>
      )}
    </form>
  );
}
