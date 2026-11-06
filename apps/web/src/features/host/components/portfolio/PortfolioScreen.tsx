"use client";
import { buttonClass, Kpis, Segmented } from "@night-shares/design-system";
import type { HotelSummary } from "@night-shares/proto/host/v1/hotel_pb";
import Link from "next/link";
import { useState } from "react";
import { useConnectOptions } from "../../hooks/use-connect-options";
import { usePortfolio } from "../../hooks/use-host-data";
import { usd } from "../../model/money";
import { WalkStrip } from "../shared/WalkStrip";
import { Crumbs } from "../ui/Crumbs";
import page from "../ui/Page.module.css";
import { ErrorNote, Loading, StateCard } from "../ui/QueryState";
import { Swatch } from "../ui/StackBar";
import ui from "../ui/ui.module.css";
import { ConnectHotel } from "./ConnectHotel";
import { HotelCard } from "./HotelCard";
import { OffHotelCard } from "./OffHotelCard";
import styles from "./Portfolio.module.css";
import { WeekHeatmap } from "./WeekHeatmap";

const SORTS = [
  { value: "occ", label: "Occupancy" },
  { value: "rev", label: "Revenue" },
  { value: "name", label: "Name" },
] as const;
type Sort = (typeof SORTS)[number]["value"];

const BY: Record<Sort, (a: HotelSummary, b: HotelSummary) => number> = {
  occ: (a, b) => (b.kpis?.occupancyBps ?? 0) - (a.kpis?.occupancyBps ?? 0),
  rev: (a, b) =>
    Number((b.kpis?.revenue?.micros ?? 0n) - (a.kpis?.revenue?.micros ?? 0n)),
  name: (a, b) => a.name.localeCompare(b.name),
};

export function PortfolioScreen() {
  const query = usePortfolio();
  const [sort, setSort] = useState<Sort>("occ");
  const hotels = query.data?.hotels ?? [];
  const connect = useConnectOptions(hotels.map((hotel) => hotel.propertyId));
  const head = (
    <>
      <Crumbs parts={[["All hotels"]]} />
      <div className={page.vHead}>
        <div>
          <h1 className={ui.display}>Your hotels</h1>
          <div className={page.sub}>
            {query.data
              ? `${hotels.length} ${hotels.length === 1 ? "hotel" : "hotels"} connected to Night Shares.${connect.options.length ? ` ${connect.options.length} more can connect.` : ""}`
              : "Loading your hotels."}
          </div>
        </div>
        <div className={page.actions}>
          <Link href="/host/payout" className={buttonClass()}>
            See payouts
          </Link>
        </div>
      </div>
    </>
  );
  if (query.isPending)
    return (
      <>
        {head}
        <Loading
          label="Loading your hotels"
          rows={[[118, 118, 118, 118], [96], [420, 420, 420]]}
        />
      </>
    );
  if (!query.data)
    return (
      <>
        {head}
        <StateCard
          title="Your hotels could not load"
          error={query.error}
          back={null}
        >
          Nothing is lost: payouts keep sweeping to your wallet while this page
          is unavailable.
        </StateCard>
      </>
    );
  const { kpis, alerts, occupancy } = query.data;
  const from = occupancy[0]?.date ?? "";
  return (
    <>
      {head}
      <ErrorNote error={query.error} />
      <Kpis
        label="Group totals"
        items={[
          {
            label: "Available now",
            value: usd(kpis?.availableNow?.micros),
            detail: "Sweeps to your wallet automatically",
            inverse: true,
          },
          {
            label: "Revenue, next 30 nights",
            value: usd(kpis?.revenue?.micros),
            detail: "rooms booked by guests",
          },
          {
            label: "Occupancy, next 30 nights",
            value: `${Math.round((kpis?.occupancyBps ?? 0) / 100)}%`,
            detail: "across connected hotels",
          },
          {
            label: "Average rate",
            value: usd(kpis?.averageRate?.micros),
            detail: "per room night booked",
          },
        ]}
      />
      <WalkStrip hotels={hotels} />
      <div className={page.secHead}>
        <h2>Hotels</h2>
        <div className={styles.sort}>
          <span>Sort by</span>
          <Segmented
            label="Sort hotels by"
            options={SORTS}
            value={sort}
            onChange={setSort}
          />
        </div>
      </div>
      <div className={styles.hotels}>
        {[...hotels].sort(BY[sort]).map((hotel) => (
          <HotelCard
            key={hotel.propertyId}
            hotel={hotel}
            from={from}
            alerts={alerts.filter((a) => a.propertyId === hotel.propertyId)}
          />
        ))}
        {connect.options.map((property) => (
          <OffHotelCard key={property.id} property={property} />
        ))}
        {!hotels.length && !connect.options.length && (
          <StateCard
            title="No hotels connected yet"
            action={
              <a
                href="#connect"
                className={buttonClass({ variant: "primary" })}
              >
                Connect a hotel
              </a>
            }
          >
            Connect your channel manager and choose which nights to open. Guests
            book them first, and payouts sweep to your wallet in USDC.
          </StateCard>
        )}
        <div className={styles.legend}>
          <span>
            <Swatch fill="b" />
            Booked
          </span>
          <span>
            <Swatch fill="h" />
            Held by traders
          </span>
          <span>
            <Swatch fill="s" />
            On sale
          </span>
          <span className={ui.muted}>One bar per night, next 30 nights</span>
        </div>
      </div>
      {occupancy.length > 0 && <WeekHeatmap rows={occupancy} />}
      <ConnectHotel
        options={connect.options}
        error={connect.error}
        pending={connect.isPending}
      />
      <nav className={page.apps} aria-label="Other Night Shares apps">
        <span>Other Night Shares apps</span>
        <Link href="/stay">Book a stay</Link>
        <Link href="/trade">Trade room nights</Link>
      </nav>
    </>
  );
}
