"use client";
import { usePathname } from "next/navigation";
import { AppNav } from "../nav/AppNav";
import type { AppKey } from "../nav/apps";
import { AppShell } from "../shell/AppShell";
import { ErrorState } from "./ErrorState";
import styles from "./Fallback.module.css";

function appOf(path: string): AppKey | null {
  const first = path.split("/")[1];
  return first === "stay" || first === "trade" || first === "host"
    ? first
    : null;
}

// The session check itself failed (the API did not answer; signed out is not
// an error). SessionProvider renders this in place of the page, inside the
// app's own shell so the nav and theme stay.
export function SessionError({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}) {
  const app = appOf(usePathname());
  const panel = (
    <div className={styles.page}>
      <ErrorState
        error={error}
        title="Night Shares could not check your session"
        onRetry={onRetry}
        back={{ href: "/", label: "Go to the home page" }}
      >
        Your account and anything you hold are safe. This only affects this
        page.
      </ErrorState>
    </div>
  );
  if (!app)
    return (
      <>
        <AppNav app={null} />
        <main>{panel}</main>
      </>
    );
  return <AppShell app={app}>{panel}</AppShell>;
}
