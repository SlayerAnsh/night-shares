"use client";
import {
  BackLink,
  buttonClass,
  EmptyState,
  Skeleton,
} from "@night-shares/design-system";
import Link from "next/link";
import { useSession } from "../../../../session/SessionProvider";
import { ErrorState } from "../../../../shared/fallback/ErrorState";
import { useSessionPending } from "../../../../shared/fallback/use-session-pending";
import { useTrips } from "../../hooks/use-trips";
import { SearchHero } from "../hero/SearchHero";
import { SavedStays } from "./SavedStays";
import { TripCard } from "./TripCard";
import styles from "./Trips.module.css";
import { TripsGate } from "./TripsGate";

export function TripsScreen() {
  const trips = useTrips();
  const { isSignedIn } = useSession();
  const sessionPending = useSessionPending();
  const data = trips.data;
  const gated = !isSignedIn && !sessionPending;
  return (
    <>
      <SearchHero compact />
      <div className={styles.wrap}>
        <BackLink as={Link} href="/stay">
          All stays
        </BackLink>
        <div className={styles.head}>
          <h1 className={styles.title}>My trips</h1>
          <p className={styles.muted}>
            Your stays on Night Shares. Receipts are in USDC.
          </p>
        </div>
        {gated && <TripsGate />}
        {trips.error && !data && (
          <ErrorState
            error={trips.error}
            thing="Your trips"
            onRetry={() => void trips.refetch()}
            retrying={trips.isFetching}
            back={{ href: "/stay", label: "See all stays" }}
          />
        )}
        {!gated && !trips.error && <h2 className={styles.h}>Upcoming</h2>}
        {!data && !trips.error && !gated && <TripSkeleton />}
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
        {data && <h2 className={styles.h}>Past</h2>}
        {data?.past.length === 0 && (
          <p className={styles.muted}>No past trips.</p>
        )}
        {data?.past.map((trip) => (
          <TripCard key={trip.id} trip={trip} upcoming={false} />
        ))}
        {isSignedIn && <SavedStays />}
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
