"use client";
import Image from "next/image";
import { useEffect, useRef } from "react";
import { useRequireAccess } from "../../../../session/require-access";
import { useSession } from "../../../../session/SessionProvider";
import { formatUsdc } from "../../../../shared/format";
import { useProperty } from "../../hooks/use-property";
import { useSaves } from "../../hooks/use-saves";
import { QueryState } from "../shared/QueryState";
import { SearchFields } from "../shared/SearchFields";
import { QuoteDetails } from "./QuoteDetails";
import { RoomChoice } from "./RoomChoice";
export function DetailScreen({ propertyId }: { propertyId: string }) {
  const model = useProperty(propertyId);
  const saves = useSaves();
  const access = useRequireAccess();
  const session = useSession();
  const resumed = useRef(false);
  function book() {
    const next = model.href(`/stay/${propertyId}`, {
      book: "1",
      roomTypeId: model.roomTypeId,
    });
    window.history.replaceState(null, "", next);
    if (access.require("book", "device"))
      model.router.push(
        model.href(`/stay/${propertyId}/checkout`, {
          book: "",
          roomTypeId: model.roomTypeId,
        }),
      );
  }
  useEffect(() => {
    if (
      model.params.get("book") &&
      session.isSignedIn &&
      model.quote.data?.quote &&
      !resumed.current
    ) {
      resumed.current = true;
      book();
    }
  });
  const property = model.property.data?.property;
  return (
    <section>
      <QueryState
        pending={model.property.isPending}
        error={model.property.error}
      />
      {property && (
        <>
          <h1>{property.name}</h1>
          <p>
            {property.city}, {property.country}
          </p>
          <ul>
            {property.photos.map((photo) => (
              <li key={photo}>
                <Image
                  src={photo}
                  alt={property.name}
                  width={320}
                  height={220}
                  unoptimized
                />
              </li>
            ))}
          </ul>
          <p>{property.blurb}</p>
          <h2>Walked guest incidents</h2>
          <ul>
            {model.property.data?.walkIncidents.map((incident) => (
              <li key={incident.id}>
                {incident.reportedAt
                  ? new Date(
                      Number(incident.reportedAt.seconds) * 1000,
                    ).toISOString()
                  : incident.id}
                {incident.isFalse ? " (false report)" : " (walked guest)"}
              </li>
            ))}
          </ul>
          <h2>Amenities</h2>
          <ul>
            {property.amenities.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
          <button
            type="button"
            disabled={saves.mutation.isPending}
            aria-pressed={saves.isSaved(propertyId)}
            onClick={() => void saves.save(propertyId).catch(() => {})}
          >
            {saves.isSaved(propertyId) ? "Saved" : "Save"}
          </button>
          <QueryState error={saves.mutation.error || saves.query.error} />
          <SearchFields />
          <h2>Choose your room</h2>
          <fieldset>
            <legend>Room types</legend>
            {property.roomTypes.map((room) => (
              <RoomChoice
                key={room.id}
                propertyId={propertyId}
                room={room}
                selected={model.roomTypeId === room.id}
              />
            ))}
          </fieldset>
          {!model.hasDates ? (
            <p>Pick dates to see the total. You won't be charged yet.</p>
          ) : (
            <>
              <QueryState
                pending={model.quote.isPending}
                error={model.quote.error}
              />
              {model.quote.data?.quote && (
                <QuoteDetails quote={model.quote.data.quote} />
              )}
              <h2>Price calendar</h2>
              <QueryState
                pending={model.calendar.isPending}
                error={model.calendar.error}
              />
              <ul>
                {model.calendar.data?.nights.map((n) => (
                  <li key={n.date}>
                    {n.date}: {formatUsdc(n.price?.micros ?? 0n)}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                disabled={!model.quote.data?.quote || model.quote.isFetching}
                onClick={book}
              >
                Book
              </button>
            </>
          )}
        </>
      )}
    </section>
  );
}
