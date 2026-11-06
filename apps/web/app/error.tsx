"use client";
import { RouteError } from "../src/shared/fallback/RouteError";
import { AppNav } from "../src/shared/nav/AppNav";

export default function ErrorPage(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <>
      <AppNav app={null} />
      <main>
        <RouteError
          {...props}
          back={{ href: "/", label: "Go to the home page" }}
        />
      </main>
    </>
  );
}
