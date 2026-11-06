"use client";
import { GatePreview } from "../../../../shared/fallback/GatePreview";
import { SignInGate } from "../../../../shared/fallback/SignInGate";
import { useSessionPending } from "../../../../shared/fallback/use-session-pending";
import page from "../shared/page.module.css";
import { Skeleton } from "../ui/Skeleton";

const FIGURES = [
  "Value at fair price",
  "Unrealised P&L",
  "Realised P&L",
  "Win rate",
];

// Portfolio before an Orb session: what the page holds and how to open it.
export function PortfolioGate() {
  const pending = useSessionPending();
  return (
    <div className={page.page}>
      <header className={page.head}>
        <h1>Portfolio</h1>
        <p>Your nights, listings and agent orders, checked with World ID.</p>
      </header>
      {pending ? (
        <Skeleton rows={5} label="Checking your session" />
      ) : (
        <SignInGate
          need="orb"
          reason="portfolio"
          title="Sign in to see your portfolio"
          lead="Everything you hold on Night Shares in one place, valued at today's predicted fair price."
          perks={[
            {
              title: "Positions with live P&L",
              text: "Every night you hold, what you paid and what it is worth now.",
            },
            {
              title: "Listings and agent wallet",
              text: "Room nights you offered for sale and the orders your agent places within your limits.",
            },
            {
              title: "Cutoff refunds",
              text: "Unsold nights pay back 70% of the average bid at cutoff, sent to you automatically.",
            },
          ]}
          browse={{
            href: "/trade",
            label: "Browse markets without signing in",
          }}
          preview={<GatePreview figures={FIGURES} rows={6} />}
        />
      )}
    </div>
  );
}
