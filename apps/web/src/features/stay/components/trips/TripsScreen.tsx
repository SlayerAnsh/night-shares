"use client";
import Link from "next/link";
import { useSaves } from "../../hooks/use-saves";
import { useTrips } from "../../hooks/use-trips";
import { QueryState } from "../shared/QueryState";
import { TripCard } from "./TripCard";
export function TripsScreen() {
  const trips = useTrips();
  const saves = useSaves();
  return (
    <section>
      <h1>My trips</h1>
      <QueryState pending={trips.isPending} error={trips.error} />
      <h2>Upcoming</h2>
      {trips.data?.upcoming.length === 0 && (
        <p>
          No upcoming trips. <Link href="/stay">Find a stay</Link>
        </p>
      )}
      {trips.data?.upcoming.map((trip) => (
        <TripCard key={trip.id} trip={trip} upcoming />
      ))}
      <h2>Past</h2>
      {trips.data?.past.length === 0 && <p>No past trips.</p>}
      {trips.data?.past.map((trip) => (
        <TripCard key={trip.id} trip={trip} upcoming={false} />
      ))}
      <h2>Saved stays</h2>
      <QueryState
        pending={saves.query.isPending}
        error={saves.query.error || saves.mutation.error}
      />
      {saves.query.data?.properties.length === 0 && <p>No saved stays yet.</p>}
      <ul>
        {saves.query.data?.properties.map((p) => (
          <li key={p.id}>
            <Link href={`/stay/${p.id}`}>{p.name}</Link> · {p.city}{" "}
            <button
              type="button"
              disabled={saves.mutation.isPending}
              onClick={() => void saves.save(p.id).catch(() => {})}
            >
              Remove saved stay
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
