"use client";
import { RouteError } from "../../../src/shared/fallback/RouteError";

export default function ErrorPage(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteError {...props} back={{ href: "/host", label: "All hotels" }} />
  );
}
