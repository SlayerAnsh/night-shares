"use client";
import { usePriceCalendar } from "../../../hooks/use-price-calendar";
import { useProperty } from "../../../hooks/use-property";
import { compactPrice, priceTiers } from "../../../model/calendar";
import { RangeCalendar } from "../../shared/calendar/RangeCalendar";
import { QueryState } from "../../shared/QueryState";
import styles from "../Detail.module.css";

export const DATES_ID = "stay-dates";

// Inline two month calendar with each night's live price for one room.
export function DatesSection({ propertyId }: { propertyId: string }) {
  const model = useProperty(propertyId);
  const { calendar, onView } = usePriceCalendar(propertyId, model.roomTypeId);
  const nights = calendar.data?.nights ?? [];
  const prices = new Map(nights.map((n) => [n.date, n.price?.micros ?? 0n]));
  const tier = priceTiers([...prices.values()]);
  const label = (date: string) => {
    const price = prices.get(date);
    return price === undefined
      ? undefined
      : { text: compactPrice(price), tier: tier(price) };
  };
  return (
    <section className={styles.sec}>
      <h2>{model.hasDates ? "Your dates" : "Select dates"}</h2>
      <p className={styles.lead}>
        Prices are per night in USDC and change with demand. Green nights are
        cheaper than usual.
      </p>
      <div id={DATES_ID} className={styles.inlineCal}>
        <RangeCalendar
          value={{
            checkIn: model.state.checkIn,
            checkOut: model.state.checkOut,
          }}
          onChange={(range) => model.update(range)}
          onView={onView}
          label={label}
        />
      </div>
      <QueryState error={calendar.error} />
    </section>
  );
}
