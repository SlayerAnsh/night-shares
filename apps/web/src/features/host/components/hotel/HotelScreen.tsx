"use client";
import type { Property } from "@night-shares/proto/catalog/v1/property_pb";
import type { GetHotelResponse } from "@night-shares/proto/host/v1/host_pb";
import { formatUsdc } from "../../../../shared/format";
import { useHotel } from "../../hooks/use-host-data";
import { useHostSearch } from "../../hooks/use-host-search";
import { useOpening } from "../../hooks/use-opening";
import { ErrorMessage, Kpis } from "../shared/HostFacts";
import { OccupancyTable } from "../shared/OccupancyTable";
import { HotelCalendar } from "./HotelCalendar";
import { OpeningForm } from "./OpeningForm";

function HotelBody({
  data,
  property,
}: {
  data: GetHotelResponse;
  property: Property;
}) {
  const opening = useOpening(property);
  return (
    <>
      <h1>{property.name}</h1>
      <p>
        {property.city}, {property.country}
      </p>
      <Kpis value={data.kpis} />
      <section>
        <h2>Walked guest incidents</h2>
        <p>
          {data.walkIncidents.filter((incident) => !incident.isFalse).length}{" "}
          valid incidents. Two incidents suspend new openings.
        </p>
        <ul>
          {data.walkIncidents.map((incident) => (
            <li key={incident.id}>
              {incident.reportedAt
                ? new Date(
                    Number(incident.reportedAt.seconds) * 1000,
                  ).toISOString()
                : incident.id}
              {incident.isFalse ? " (false report)" : " (walked guest)"}
            </li>
          ))}
        </ul>
      </section>
      <a href={`/host/payout?property=${property.id}`}>Payout</a>
      <OccupancyTable rows={data.monthGlance} caption="Month at a glance" />
      <HotelCalendar
        nights={data.calendar}
        propertyId={property.id}
        selected={opening.dates}
        toggle={opening.toggleDate}
        disabled={opening.open.isPending}
      />
      <OpeningForm property={property} opening={opening} />
      <table>
        <caption>Guest price and usual rate</caption>
        <thead>
          <tr>
            <th>Night</th>
            <th>Guest price</th>
            <th>Usual rate</th>
          </tr>
        </thead>
        <tbody>
          {data.priceSeries.map((point) => (
            <tr key={point.date}>
              <th scope="row">{point.date}</th>
              <td>{formatUsdc(point.guestPrice?.micros ?? 0n)}</td>
              <td>{formatUsdc(point.usualRate?.micros ?? 0n)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

export function HotelScreen({ propertyId }: { propertyId: string }) {
  const { search, set } = useHostSearch();
  const month = search.get("month") ?? "";
  const query = useHotel(propertyId, month);
  return (
    <>
      <a href="/host">All hotels</a>
      <p>
        <label>
          Month{" "}
          <input
            type="month"
            value={
              month || query.data?.calendar[0]?.night?.date.slice(0, 7) || ""
            }
            onChange={(e) => set({ month: e.target.value })}
          />
        </label>
      </p>
      {query.isPending && <p>Loading hotel…</p>}
      <ErrorMessage error={query.error} />
      {query.data?.property && (
        <HotelBody data={query.data} property={query.data.property} />
      )}
    </>
  );
}
