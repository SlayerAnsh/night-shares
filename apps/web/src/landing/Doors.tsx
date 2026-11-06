import { Door } from "./Door";
import styles from "./Doors.module.css";
import { BookViz, CalendarViz, PhotoViz } from "./Viz";

export function Doors() {
  return (
    <div className={styles.doors}>
      <Door
        href="/stay"
        audience="For guests"
        badge="Book"
        title="Stay"
        body="Search, pick dates, book in one step. Guests come first. If rooms run short, one is taken back from a trader for you at a capped price."
        action="Find a stay"
        viz={<PhotoViz />}
      />
      <Door
        href="/host"
        audience="For hosts"
        badge="Offer"
        title="Host"
        body="Set your usual rate and how many rooms to offer. Each night is priced from there, and every booking lands in your own reservation system."
        note="Sign in with an Orb verified World ID to open the console."
        action="Open host console"
        viz={<CalendarViz />}
      />
      <Door
        href="/trade"
        audience="For traders"
        badge="Trade"
        title="Trade"
        body="Trade future room nights against a fair price for each night. Guests can take a room night back at a price cap, and nights that go unsold return 70% of the pool's bid."
        note="Markets are open to browse. Trading needs an Orb verified World ID."
        action="Open markets"
        viz={<BookViz />}
      />
    </div>
  );
}
