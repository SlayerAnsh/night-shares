"use client";
import { Kpis } from "@night-shares/design-system";
import { ErrorState } from "../../../../shared/fallback/ErrorState";
import { useAccount } from "../../hooks/use-account";
import { signedUsd, tone, usd } from "../../model/display";
import { percent } from "../../model/market";
import { AgentWalletPanel } from "../agent/AgentWalletPanel";
import { AgentOrders } from "../shared/AgentOrders";
import { Listings } from "../shared/Listings";
import page from "../shared/page.module.css";
import { PortfolioGate } from "./PortfolioGate";
import { PortfolioSkeleton } from "./PortfolioSkeleton";
import { Positions } from "./Positions";
import styles from "./portfolio.module.css";
import { TrackRecord } from "./TrackRecord";
import { Watchlist } from "./Watchlist";

export function PortfolioScreen() {
  const a = useAccount();
  const p = a.portfolio.data;
  if (a.level !== "orb") return <PortfolioGate />;
  const value =
    p?.holdings.reduce((sum, h) => sum + (h.value?.micros ?? 0n), 0n) ?? 0n;
  const unreal = p?.unrealisedPnl?.micros ?? 0n;
  return (
    <div className={page.page}>
      <header className={page.head}>
        <h1>Portfolio</h1>
        {p && (
          <p className={page.lead}>
            {p.holdings.length
              ? `Your ${p.holdings.length} open ${p.holdings.length === 1 ? "night is" : "nights are"} worth ${usd(value)} at today's predicted fair price.`
              : "You hold no nights right now. Pick a market and buy."}
          </p>
        )}
      </header>
      {a.portfolio.error && !p && (
        <ErrorState
          error={a.portfolio.error}
          thing="Your portfolio"
          need="orb"
          onRetry={() => void a.portfolio.refetch()}
          retrying={a.portfolio.isFetching}
          back={{ href: "/trade", label: "Back to markets" }}
        />
      )}
      {a.portfolio.isPending && <PortfolioSkeleton />}
      {p && (
        <>
          <div className={styles.figs}>
            <Kpis
              variant="large"
              label="Portfolio figures"
              items={[
                {
                  label: "Value at fair price",
                  value: usd(value),
                  detail: `${p.holdings.length} nights`,
                },
                {
                  label: "Unrealised P&L",
                  value: signedUsd(unreal),
                  tone: tone(unreal, 500000),
                },
                {
                  label: "Realised P&L",
                  value: signedUsd(p.realisedPnl?.micros),
                  tone: tone(p.realisedPnl?.micros ?? 0n, 500000),
                  detail: p.trackRecord
                    ? `${p.trackRecord.closedPositions} closed`
                    : undefined,
                },
                {
                  label: "Win rate",
                  value: p.trackRecord?.closedPositions
                    ? percent(p.trackRecord.profitableBps)
                    : "n/a",
                },
              ]}
            />
          </div>
          <Positions holdings={p.holdings} listings={p.listings} />
        </>
      )}
      <Listings />
      <AgentWalletPanel />
      <AgentOrders />
      {p?.trackRecord && <TrackRecord record={p.trackRecord} />}
      <Watchlist query={a.watch} />
      <nav className={page.foot} aria-label="Other Night Shares apps">
        <span>Other Night Shares apps</span>
        <a href="/stay">Book a stay</a>
        <a href="/host">List your hotel</a>
      </nav>
    </div>
  );
}
