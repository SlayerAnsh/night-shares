"use client";
import type { Property } from "@night-shares/proto/catalog/v1/property_pb";
import { useProperty } from "../../../hooks/use-property";
import styles from "../Detail.module.css";
import { PriceWhy } from "../price/PriceWhy";
import { RoomChoice } from "../RoomChoice";

export function RoomsSection({
  propertyId,
  property,
}: {
  propertyId: string;
  property: Property;
}) {
  const model = useProperty(propertyId);
  return (
    <section className={styles.sec}>
      <h2>Choose a room</h2>
      <fieldset className={styles.rooms} aria-label="Room types">
        {property.roomTypes.map((room) => (
          <RoomChoice
            key={room.id}
            propertyId={propertyId}
            room={room}
            selected={model.roomTypeId === room.id}
          />
        ))}
      </fieldset>
      <PriceWhy
        quote={model.hasDates ? model.quote.data?.quote : undefined}
        roomName={
          property.roomTypes.find((r) => r.id === model.roomTypeId)?.name ?? ""
        }
      />
    </section>
  );
}
