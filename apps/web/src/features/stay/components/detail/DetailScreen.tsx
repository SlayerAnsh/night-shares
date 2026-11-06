"use client";
import { BackLink } from "@night-shares/design-system";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { useRequireAccess } from "../../../../session/require-access";
import { useSession } from "../../../../session/SessionProvider";
import { ErrorState } from "../../../../shared/fallback/ErrorState";
import { useProperty } from "../../hooks/use-property";
import { SearchHero } from "../hero/SearchHero";
import { BookCard } from "./book/BookCard";
import styles from "./Detail.module.css";
import { DetailHead } from "./DetailHead";
import { DetailSkeleton } from "./DetailSkeleton";
import { Gallery } from "./Gallery";
import { AboutSection } from "./sections/AboutSection";
import { AmenitiesSection } from "./sections/AmenitiesSection";
import { DatesSection } from "./sections/DatesSection";
import { GoodToKnowSection } from "./sections/GoodToKnowSection";
import { RecordSection } from "./sections/RecordSection";
import { RoomsSection } from "./sections/RoomsSection";

export function DetailScreen({ propertyId }: { propertyId: string }) {
  const model = useProperty(propertyId);
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
  // Coming back from sign in with book=1 finishes the booking step.
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
    <>
      <SearchHero compact />
      <div className={styles.wrap}>
        <BackLink as={Link} href={model.href("/stay")}>
          All stays
        </BackLink>
        {model.property.error && !property && (
          <ErrorState
            error={model.property.error}
            thing="This stay"
            onRetry={() => void model.property.refetch()}
            retrying={model.property.isFetching}
            back={{ href: "/stay", label: "See all stays" }}
          />
        )}
        {!property && !model.property.error && <DetailSkeleton />}
        {property && (
          <>
            <DetailHead property={property} />
            <Gallery property={property} />
            <div className={styles.body}>
              <div>
                <AboutSection blurb={property.blurb} />
                <RoomsSection propertyId={propertyId} property={property} />
                <DatesSection propertyId={propertyId} />
                <AmenitiesSection amenities={property.amenities} />
                <RecordSection
                  incidents={model.property.data?.walkIncidents ?? []}
                />
                <GoodToKnowSection />
              </div>
              <BookCard
                propertyId={propertyId}
                property={property}
                onBook={book}
              />
            </div>
          </>
        )}
      </div>
    </>
  );
}
