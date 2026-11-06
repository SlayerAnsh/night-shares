"use client";
import { buttonClass, cx, Photo, Pill } from "@night-shares/design-system";
import type { Property } from "@night-shares/proto/catalog/v1/property_pb";
import { useHostSearch } from "../../hooks/use-host-search";
import ui from "../ui/ui.module.css";
import styles from "./Portfolio.module.css";

/** A catalog hotel this host can still connect. Its button picks it in the connect form. */
export function OffHotelCard({ property }: { property: Property }) {
  const { set } = useHostSearch();
  return (
    <article className={cx(ui.card, styles.hk, styles.off)}>
      <Photo src={property.photos[0]} className={styles.photo} />
      <div className={styles.body}>
        <div className={styles.top}>
          <div className={styles.id}>
            <h3>{property.name}</h3>
            <span>
              {property.city}, {property.country} · {property.roomTypes.length}{" "}
              room types
            </span>
          </div>
          <Pill dot="off" size="sm">
            Not connected
          </Pill>
        </div>
        <p className={styles.offText}>
          Connect its channel manager to start offering nights. Room types and
          usual rates import on their own.
        </p>
        <button
          type="button"
          className={cx(
            buttonClass({ variant: "secondary", size: "sm" }),
            styles.cta,
          )}
          aria-label={`Connect ${property.name}`}
          onClick={() => {
            set({ connect: property.id });
            document
              .getElementById("connect")
              ?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
        >
          Connect
        </button>
      </div>
    </article>
  );
}
