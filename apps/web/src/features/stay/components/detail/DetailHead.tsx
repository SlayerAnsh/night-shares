"use client";
import { Button, Icon } from "@night-shares/design-system";
import type { Property } from "@night-shares/proto/catalog/v1/property_pb";
import { useSaves } from "../../hooks/use-saves";
import { QueryState } from "../shared/QueryState";
import styles from "./Detail.module.css";

export function DetailHead({ property }: { property: Property }) {
  const saves = useSaves();
  const saved = saves.isSaved(property.id);
  return (
    <>
      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>{property.name}</h1>
          <div className={styles.meta}>
            <span className={styles.rate}>
              <Icon name="star" />
              {property.rating.toFixed(2)}
            </span>
            <span aria-hidden="true">·</span>
            <span>{property.reviews.toLocaleString("en-US")} reviews</span>
            <span aria-hidden="true">·</span>
            <span>
              {property.city}, {property.country}
            </span>
          </div>
        </div>
        <Button
          size="sm"
          disabled={saves.mutation.isPending}
          aria-pressed={saved}
          onClick={() => void saves.save(property.id).catch(() => {})}
        >
          {saved ? "Saved" : "Save"}
        </Button>
      </div>
      <QueryState error={saves.mutation.error || saves.query.error} />
    </>
  );
}
