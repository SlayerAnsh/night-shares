"use client";
import { buttonClass, EmptyState, Skeleton } from "@night-shares/design-system";
import Link from "next/link";
import { useTrips } from "../../hooks/use-trips";
import { SearchHero } from "../hero/SearchHero";
import { BackLink } from "../shared/BackLink";
import { QueryState } from "../shared/QueryState";
import { SavedStays } from "./SavedStays";
import { TripCard } from "./TripCard";
import styles from "./Trips.module.css";

export function TripsScreen() {
  const trips = useTrips();
  const data = trips.data;
  return (
    <>
      <SearchHero compact />
      <div className={styles.wrap}>
        <BackLink href="/stay">All stays</BackLink>
        <div className={styles.head}>
          <h1 className={styles.title}>My trips</h1>
          <p className={styles.muted}>
            Your stays on Night Shares. Receipts are in USDC.
          </p>
        </div>
        <QueryState error={trips.error} />
        <h2 className={styles.h}>Upcoming</h2>
        {!data && !trips.error && <TripSkeleton />}
        {data?.upcoming.length === 0 && (
          <EmptyState
            title="No upcoming trips"
            className={styles.empty}
            action={
              <Link
                href="/stay"
                className={buttonClass({ variant: "secondary" })}
              >
                Find a stay
              </Link>
            }
          >
            Book a night and it shows up here, with your hotel reference and
            check in.
          </EmptyState>
        )}
        {data?.upcoming.map((trip) => (
          <TripCard key={trip.id} trip={trip} upcoming />
        ))}
        <h2 className={styles.h}>Past</h2>
        {data?.past.length === 0 && (
          <p className={styles.muted}>No past trips.</p>
        )}
        {data?.past.map((trip) => (
          <TripCard key={trip.id} trip={trip} upcoming={false} />
        ))}
        <SavedStays />
        <nav className={styles.other} aria-label="Other Night Shares apps">
          <span>Other Night Shares apps</span>
          <Link href="/trade">Trade room nights</Link>
          <Link href="/host">List your hotel</Link>
        </nav>
      </div>
    </>
  );
}

function TripSkeleton() {
  return (
    <div className={styles.trip} aria-busy="true">
      <Skeleton height={170} radius="var(--r-14)" />
      <div>
        <Skeleton height={20} width="50%" />
        <Skeleton height={14} width="35%" className={styles.skelGap} />
        <Skeleton height={44} className={styles.skelGap} />
      </div>
    </div>
  );
}
