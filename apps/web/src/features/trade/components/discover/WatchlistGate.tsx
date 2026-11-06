"use client";
import { SignInGate } from "../../../../shared/fallback/SignInGate";

// The watchlist filter before an Orb session.
export function WatchlistGate() {
  return (
    <SignInGate
      need="orb"
      reason="watchlist"
      title="Sign in to see your watchlist"
      lead="Star the nights you care about and follow them here, next to every other market."
      perks={[
        {
          title: "One list of watched nights",
          text: "Price, 24 hour change, fair value and release time side by side.",
        },
        {
          title: "Saved to your World ID",
          text: "The same list on every device you sign in on.",
        },
      ]}
      browse={{ href: "/trade", label: "Browse all markets instead" }}
    />
  );
}
