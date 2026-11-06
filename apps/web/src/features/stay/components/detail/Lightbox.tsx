"use client";
import { Dialog, IconButton, Photo } from "@night-shares/design-system";
import { useState } from "react";
import { Icon } from "../shared/Icon";
import styles from "./Gallery.module.css";

export function Lightbox({
  name,
  photos,
  start,
  onClose,
}: {
  name: string;
  photos: string[];
  start: number;
  onClose: () => void;
}) {
  const [i, setI] = useState(start);
  const step = (d: number) => setI((i + d + photos.length) % photos.length);
  return (
    <Dialog open onClose={onClose} title={name} className={styles.lightbox}>
      <div className={styles.lb}>
        <Photo
          src={photos[i]}
          alt={`${name}, photo ${i + 1}`}
          className={styles.lbPhoto}
        />
        <IconButton
          label="Previous photo"
          className={styles.prev}
          onClick={() => step(-1)}
        >
          <Icon name="left" />
        </IconButton>
        <IconButton
          label="Next photo"
          className={styles.next}
          onClick={() => step(1)}
        >
          <Icon name="right" />
        </IconButton>
        <span className={styles.count}>
          {i + 1} / {photos.length}
        </span>
      </div>
    </Dialog>
  );
}
