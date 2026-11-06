"use client";
import { Button, Photo } from "@night-shares/design-system";
import Link from "next/link";
import { useSaves } from "../../hooks/use-saves";
import { QueryState } from "../shared/QueryState";
import styles from "./Trips.module.css";

export function SavedStays() {
  const saves = useSaves();
  const saved = saves.query.data?.properties;
  return (
    <section>
      <h2 className={styles.h}>Saved stays</h2>
      <QueryState
        pending={saves.query.isPending}
        error={saves.query.error || saves.mutation.error}
      />
      {saved?.length === 0 && (
        <p className={styles.muted}>No saved stays yet.</p>
      )}
      {!!saved?.length && (
        <ul className={styles.saved}>
          {saved.map((p) => (
            <li key={p.id} className={styles.savedItem}>
              <Photo src={p.photos[0]} className={styles.savedPhoto} />
              <div>
                <Link href={`/stay/${p.id}`} className={styles.savedName}>
                  {p.name}
                </Link>
                <span className={styles.muted}>
                  {p.city}, {p.country}
                </span>
              </div>
              <Button
                size="sm"
                disabled={saves.mutation.isPending}
                onClick={() => void saves.save(p.id).catch(() => {})}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
