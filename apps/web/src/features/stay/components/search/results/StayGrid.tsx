"use client";
import { Button, EmptyState } from "@night-shares/design-system";
import type { StayCard as Card } from "@night-shares/proto/catalog/v1/property_pb";
import { useSaves } from "../../../hooks/use-saves";
import { QueryState } from "../../shared/QueryState";
import styles from "./Results.module.css";
import { StayCard } from "./StayCard";
import { StayCardSkeleton } from "./StayCardSkeleton";

export function StayGrid({
  stays,
  onReset,
}: {
  stays?: Card[];
  onReset: () => void;
}) {
  const saves = useSaves();
  if (!stays)
    return (
      <div className={styles.grid} aria-busy="true">
        {[0, 1, 2].map((i) => (
          <StayCardSkeleton key={i} />
        ))}
      </div>
    );
  if (!stays.length)
    return (
      <EmptyState
        title="No stays found"
        action={<Button onClick={onReset}>Clear search</Button>}
      >
        Try another place or clear the filter.
      </EmptyState>
    );
  return (
    <>
      <QueryState error={saves.mutation.error || saves.query.error} />
      <div className={styles.grid}>
        {stays.map(
          (card) =>
            card.property && (
              <StayCard
                key={card.property.id}
                card={card}
                saved={saves.isSaved(card.property.id)}
                saving={saves.mutation.isPending}
                onSave={() =>
                  void saves.save(card.property?.id ?? "").catch(() => {})
                }
              />
            ),
        )}
      </div>
    </>
  );
}
