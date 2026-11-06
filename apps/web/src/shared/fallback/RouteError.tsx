"use client";
import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";
import { ErrorState, type FallbackLink } from "./ErrorState";
import styles from "./Fallback.module.css";

/**
 * Body of a route error.tsx: the boundary's error in plain words. Try again
 * refreshes server data and re-renders the segment.
 */
export function RouteError({
  error,
  reset,
  back,
  thing,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  back: FallbackLink;
  thing?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className={styles.page}>
      <ErrorState
        error={error}
        thing={thing}
        onRetry={() =>
          start(() => {
            router.refresh();
            reset();
          })
        }
        retrying={pending}
        back={back}
      >
        {error.digest ? `Reference ${error.digest}` : undefined}
      </ErrorState>
    </div>
  );
}
