"use client";
import { useRequireAccess } from "../../../../session/require-access";
import { useAccount } from "../../hooks/use-account";
import { money, nightHref, percent } from "../../model/market";
import { AgentWalletPanel } from "../agent/AgentWalletPanel";
import { AgentOrders } from "../shared/AgentOrders";
import { Feedback } from "../shared/Feedback";
import { Listings } from "../shared/Listings";
import { NightCards } from "../shared/NightCards";
import { HoldingRow } from "./HoldingRow";
export function PortfolioScreen() {
  const a = useAccount();
  const access = useRequireAccess();
  const p = a.portfolio.data;
  if (a.level !== "orb")
    return (
      <>
        <h1>Portfolio</h1>
        <button
          type="button"
          onClick={() => access.require("portfolio", "orb")}
        >
          Sign in with World ID to see your portfolio
        </button>
      </>
    );
  return (
    <>
      <h1>Portfolio</h1>
      {a.portfolio.isPending && <p>Loading portfolio…</p>}
      <Feedback error={a.portfolio.error?.message} />
      {p && (
        <>
          <p>
            Realised P&amp;L {money(p.realisedPnl)} · Unrealised P&amp;L{" "}
            {money(p.unrealisedPnl)}
          </p>
          {p.trackRecord && (
            <p>
              Closed positions {p.trackRecord.closedPositions} · Profitable{" "}
              {percent(p.trackRecord.profitableBps)} · Average return{" "}
              {percent(p.trackRecord.averageReturnBps)}
            </p>
          )}
          <h2>Holdings</h2>
          {!p.holdings.length && <p>No room nights held yet.</p>}
          <table>
            <thead>
              <tr>
                {[
                  "Night",
                  "Room nights",
                  "Average cost",
                  "Value",
                  "P&L",
                  "Est. return",
                  "Risk",
                  "Listed",
                  "Refund if unsold",
                ].map((label) => (
                  <th key={label}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {p.holdings.map((h) => (
                <HoldingRow
                  key={h.night ? nightHref(h.night) : "unknown"}
                  holding={h}
                  listings={p.listings}
                />
              ))}
            </tbody>
          </table>
        </>
      )}
      <Listings />
      <AgentWalletPanel />
      <AgentOrders />
      <h2>Watchlist</h2>
      <Feedback error={a.watch.error?.message} />
      {a.watch.isPending && <p>Loading watchlist…</p>}
      {a.watch.data && <NightCards nights={a.watch.data.nights} />}
    </>
  );
}
