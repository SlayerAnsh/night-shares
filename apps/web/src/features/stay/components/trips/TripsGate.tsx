"use client";
import { SignInGate } from "../../../../shared/fallback/SignInGate";

// My trips before sign in: what the page keeps for a guest and how to open it.
export function TripsGate() {
  return (
    <SignInGate
      need="device"
      reason="book"
      title="Sign in to see your trips"
      lead="Every stay you book on Night Shares, with its hotel reference and receipt."
      perks={[
        {
          title: "Upcoming and past stays",
          text: "Dates, room and the price you locked when you paid.",
        },
        {
          title: "Check in at the hotel",
          text: "Tap reception or check in with World ID when you arrive.",
        },
        {
          title: "Receipts in USDC and saved stays",
          text: "Download a receipt and come back to places you saved.",
        },
      ]}
      browse={{ href: "/stay", label: "Browse stays without signing in" }}
    />
  );
}
