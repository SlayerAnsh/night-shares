"use client";
import { HeroFrame } from "../../../src/features/stay/components/shared/HeroFrame";
import { RouteError } from "../../../src/shared/fallback/RouteError";

export default function ErrorPage(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <HeroFrame>
      <RouteError {...props} back={{ href: "/stay", label: "See all stays" }} />
    </HeroFrame>
  );
}
