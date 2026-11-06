"use client";
import type { HotelSummary } from "@night-shares/proto/host/v1/hotel_pb";
import { usePortfolio } from "../../hooks/use-host-data";
import { ErrorMessage, Kpis } from "../shared/HostFacts";
import { OccupancyTable } from "../shared/OccupancyTable";
import { ConnectHotel } from "./ConnectHotel";
import { NextBusyNight } from "./NextBusyNight";

function HotelCard({ hotel, from }: { hotel: HotelSummary; from: string }) {
  return (
    <article>
      <h3>
        <a href={`/host/${hotel.propertyId}`}>{hotel.name}</a>
      </h3>
      <p>{hotel.city}</p>
      <Kpis value={hotel.kpis} />
      <div>
        Next busy night:{" "}
        <NextBusyNight
          propertyId={hotel.propertyId}
          from={from}
          month={from.slice(0, 7)}
        />
      </div>
    </article>
  );
}

export function PortfolioScreen() {
  const query = usePortfolio();
  if (query.isPending) return <p>Loading your hotels…</p>;
  if (!query.data) return <ErrorMessage error={query.error} />;
  const { hotels, kpis, alerts, occupancy } = query.data;
  return (
    <>
      <h1>Your hotels</h1>
      <ErrorMessage error={query.error} />
      <Kpis value={kpis} />
      <a href="/host/payout">Withdraw all</a>
      <section>
        <h2>Needs your attention</h2>
        {alerts.length ? (
          <ul>
            {alerts.map((alert) => (
              <li key={`${alert.propertyId}:${alert.date}`}>
                <a href={`/host/${alert.propertyId}/${alert.date}`}>
                  {alert.message}
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p>Nothing needs you right now</p>
        )}
      </section>
      <section>
        <h2>Hotels</h2>
        {hotels.length ? (
          hotels.map((hotel) => (
            <HotelCard
              key={hotel.propertyId}
              hotel={hotel}
              from={occupancy[0]?.date ?? ""}
            />
          ))
        ) : (
          <p>No hotels connected yet.</p>
        )}
      </section>
      <OccupancyTable
        rows={occupancy}
        caption="Occupancy by week, next 8 weeks (all connected hotels)"
      />
      <ConnectHotel owned={hotels.map((hotel) => hotel.propertyId)} />
    </>
  );
}
