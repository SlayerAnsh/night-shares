"use client";
import { Button, Photo } from "@night-shares/design-system";
import type { Property } from "@night-shares/proto/catalog/v1/property_pb";
import { useState } from "react";
import styles from "./Gallery.module.css";
import { Lightbox } from "./Lightbox";

// Five photo grid (.gallery). A photo or "Show all photos" opens the lightbox.
export function Gallery({ property }: { property: Property }) {
  const [shown, setShown] = useState<number | null>(null);
  const photos = property.photos.slice(0, 5);
  return (
    <div className={styles.gallery}>
      {photos.map((src, i) => (
        <button
          key={src}
          type="button"
          className={styles.cell}
          aria-label={`Photo ${i + 1} of ${property.name}`}
          onClick={() => setShown(i)}
        >
          <Photo src={src} className={styles.photo} />
        </button>
      ))}
      <Button size="sm" className={styles.all} onClick={() => setShown(0)}>
        Show all photos
      </Button>
      {shown !== null && (
        <Lightbox
          name={property.name}
          photos={property.photos}
          start={shown}
          onClose={() => setShown(null)}
        />
      )}
    </div>
  );
}
