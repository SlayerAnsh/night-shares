"use client";
import { Photo } from "@night-shares/design-system";
import type { StayCard as Card } from "@night-shares/proto/catalog/v1/property_pb";
import Link from "next/link";
import { formatUsdc } from "../../../../../shared/format";
import { useStaySearch } from "../../../hooks/use-stay-search";
import { Icon } from "../../shared/Icon";
import styles from "./Results.module.css";

const whole = (micros?: bigint) => formatUsdc(micros ?? 0n, { decimals: 0 });

// Photo card with the name set in display type over the image (.hcard).
export function StayCard({
  card,
  saved,
  saving,
  onSave,
}: {
  card: Card;
  saved: boolean;
  saving: boolean;
  onSave: () => void;
}) {
  const { href, hasDates } = useStaySearch();
  const p = card.property;
  if (!p) return null;
  return (
    <article className={styles.card}>
      <Link
        href={href(`/stay/${p.id}`)}
        className={styles.cover}
        aria-label={p.name}
      />
      <div className={styles.media}>
        <Photo src={p.photos[0]} className={styles.photo} />
        {card.isDeal ? (
          <span className={`${styles.tag} ${styles.deal}`}>
            Lower than usual
          </span>
        ) : (
          p.popular && <span className={styles.tag}>Popular</span>
        )}
        <h3 className={styles.name}>{p.name}</h3>
        <button
          type="button"
          className={`${styles.fav} ${saved ? styles.on : ""}`}
          aria-label={`Save ${p.name}`}
          aria-pressed={saved}
          disabled={saving}
          onClick={onSave}
        >
          <Icon name="heart" />
        </button>
      </div>
      <div className={styles.body}>
        <div className={styles.row}>
          <b>
            {p.city}, {p.country}
          </b>
          <span className={styles.rate}>
            <Icon name="star" />
            {p.rating.toFixed(2)}
          </span>
        </div>
        <div className={styles.row}>
          <span className={styles.muted}>
            {p.type} · {p.reviews.toLocaleString("en-US")} reviews
          </span>
          {hasDates ? (
            <span>
              <b>{whole(card.total?.micros)}</b>{" "}
              <span className={styles.muted}>total</span>
            </span>
          ) : (
            <span>
              <span className={styles.muted}>from</span>{" "}
              <b>{whole(card.average?.micros)}</b>{" "}
              <span className={styles.muted}>night</span>
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
