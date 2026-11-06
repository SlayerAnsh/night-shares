"use client";
import type { Property } from "@night-shares/proto/catalog/v1/property_pb";
import type { GetHotelResponse } from "@night-shares/proto/host/v1/host_pb";
import { useState } from "react";
import { useCalendarPick } from "../../hooks/use-calendar-pick";
import { useHotel, usePayout, usePortfolio } from "../../hooks/use-host-data";
import { useHostSearch } from "../../hooks/use-host-search";
import { useOpening } from "../../hooks/use-opening";
import { isMonth, shiftMonth, todayIso } from "../../model/calendar";
import { summarizeDays } from "../../model/day-summary";
import { usd } from "../../model/money";
import { validWalks } from "../../model/walks";
import { PayCard } from "../shared/PayCard";
import { WalkCard } from "../shared/WalkCard";
import { Crumbs } from "../ui/Crumbs";
import { cx } from "../ui/cx";
import { Kpis } from "../ui/Kpis";
import { Loading, StateCard } from "../ui/QueryState";
import { Seg } from "../ui/Seg";
import { Glance } from "./glance/Glance";
import styles from "./Hotel.module.css";
import { HotelCalendar } from "./HotelCalendar";
import { HotelHead } from "./HotelHead";
import { OpeningForm } from "./OpeningForm";

function HotelBody({
  data,
  property,
  month,
  setMonth,
}: {
  data: GetHotelResponse;
  property: Property;
  month: string;
  setMonth: (month: string) => void;
}) {
  const opening = useOpening(property);
  const [rt, setRt] = useState("all");
  const allTypes = property.roomTypes.map((room) => room.id);
  const typeIds = rt === "all" ? allTypes : [rt];
  const today = data.priceSeries[0]?.date ?? todayIso();
  const shown =
    month || data.calendar[0]?.night?.date.slice(0, 7) || today.slice(0, 7);
  const days = summarizeDays(data.calendar, typeIds);
  const pick = useCalendarPick({
    propertyId: property.id,
    opening,
    days,
    typeCount: typeIds.length,
    month: shown,
    today,
  });
  const payout = usePayout(property.id);
  const portfolio = usePortfolio();
  const walkTotal = portfolio.data?.hotels.reduce(
    (n, hotel) => n + validWalks(hotel.walkIncidents).length,
    0,
  );
  const panel =
    opening.dates.length > 0 ||
    (opening.mode === "range" && !!(opening.start || opening.end));
  const rateFor = (id: string) => {
    const rows = data.calendar.filter((r) => r.night?.roomTypeId === id);
    return (rows.find((r) => r.night?.date === opening.dates[0]) ?? rows[0])
      ?.usualRate?.micros;
  };
  const kpis = data.kpis;
  return (
    <>
      <HotelHead property={property} onOpen={pick.openMonth} />
      <Kpis
        compact
        label={`${property.name}, next 30 nights`}
        tiles={[
          {
            label: "Occupancy, next 30 nights",
            value: `${Math.round((kpis?.occupancyBps ?? 0) / 100)}%`,
            detail: "booked or held by traders",
          },
          {
            label: "Revenue, next 30 nights",
            value: usd(kpis?.revenue?.micros),
            detail: "rooms booked by guests",
          },
          {
            label: "Average rate",
            value: usd(kpis?.averageRate?.micros),
            detail: "per room night booked",
          },
          {
            label: "Available now",
            value: usd(kpis?.availableNow?.micros),
            detail: <a href="#payout">See payout</a>,
          },
        ]}
      />
      <div className={styles.filter}>
        <span>Room type</span>
        <Seg
          label="Room type"
          options={[
            ["all", "All rooms"],
            ...property.roomTypes.map((room) => [room.id, room.name] as const),
          ]}
          value={rt}
          onChange={setRt}
        />
        <span className={styles.hint}>
          Filters the tiles and the calendar below.
        </span>
      </div>
      <Glance
        month={shown}
        days={[...days.values()]}
        series={data.priceSeries}
        scope={rt === "all" ? "all rooms" : rt}
      />
      <div className={cx(styles.grid, panel && styles.withPanel)}>
        <HotelCalendar
          month={shown}
          today={today}
          days={days}
          typeCount={typeIds.length}
          selected={opening.dates}
          onPick={pick.onPick}
          onMonth={(step) => setMonth(step ? shiftMonth(shown, step) : "")}
          onQuick={pick.onQuick}
        />
        {panel && (
          <OpeningForm
            property={property}
            opening={opening}
            rateFor={rateFor}
            onClose={pick.clear}
          />
        )}
      </div>
      <WalkCard
        name={property.name}
        incidents={data.walkIncidents}
        total={walkTotal}
      />
      <PayCard
        id="payout"
        title="Payout"
        href={`/host/payout?property=${property.id}`}
        subtitle={`Open nights at ${property.name} up to 60 days ahead. Paid in USDC to your wallet.`}
        payout={payout.data?.payout}
      />
    </>
  );
}

export function HotelScreen({ propertyId }: { propertyId: string }) {
  const { search, set } = useHostSearch();
  const raw = search.get("month") ?? "";
  const month = isMonth(raw) ? raw : "";
  const query = useHotel(propertyId, month);
  const property = query.data?.property;
  return (
    <>
      <Crumbs parts={[["All hotels", "/host"], [property?.name ?? "Hotel"]]} />
      {query.isPending && (
        <>
          <HotelHead />
          <Loading
            label="Loading hotel"
            rows={[[96, 96, 96, 96], [260, 260, 260], [560]]}
          />
        </>
      )}
      {!query.isPending && !property && (
        <StateCard title="This hotel could not load" error={query.error}>
          It may not be connected to your account. Go back to all hotels and try
          again.
        </StateCard>
      )}
      {query.data && property && (
        <HotelBody
          data={query.data}
          property={property}
          month={month}
          setMonth={(m) => set({ month: m })}
        />
      )}
    </>
  );
}
