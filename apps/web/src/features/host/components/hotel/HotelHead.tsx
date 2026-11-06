import { buttonClass, Photo, Pill } from "@night-shares/design-system";
import type { Property } from "@night-shares/proto/catalog/v1/property_pb";
import page from "../ui/Page.module.css";
import ui from "../ui/ui.module.css";
import styles from "./Hotel.module.css";

export function HotelHead({
  property,
  onOpen,
}: {
  property?: Property;
  onOpen?: () => void;
}) {
  return (
    <div className={page.vHead}>
      <div className={styles.id}>
        <Photo src={property?.photos[0]} className={styles.photo} />
        <div>
          <h1 className={ui.display}>{property?.name ?? "Hotel"}</h1>
          <div className={page.sub}>
            {property
              ? `${property.city}, ${property.country} · ${property.roomTypes.length} room types`
              : "Loading hotel"}
          </div>
        </div>
      </div>
      {onOpen && (
        <div className={page.actions}>
          <Pill dot>Channel manager connected</Pill>
          <button
            type="button"
            className={buttonClass({ variant: "primary" })}
            onClick={onOpen}
          >
            Open nights
          </button>
        </div>
      )}
    </div>
  );
}
