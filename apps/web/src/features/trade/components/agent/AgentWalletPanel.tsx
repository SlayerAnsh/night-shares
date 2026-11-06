"use client";
import Link from "next/link";
import { formatRoomNights } from "../../../../shared/format";
import { useAgentWallet } from "../../hooks/use-agent-wallet";
import { shortDate, usd } from "../../model/display";
import { nightHref } from "../../model/market";
import { Feedback } from "../shared/Feedback";
import lists from "../shared/lists.module.css";
import { Empty } from "../ui/Empty";
import { Kpis } from "../ui/Kpis";
import { Section } from "../ui/Section";
import { Skeleton } from "../ui/Skeleton";
import text from "../ui/text.module.css";
import { AgentWalletForms } from "./AgentWalletForms";
import styles from "./agent.module.css";

// Agent wallet linked to your World ID: figures, holdings, then the controls.
export function AgentWalletPanel() {
  const agent = useAgentWallet();
  const w = agent.wallet.data?.wallet;
  const budget = w?.totalBudget?.micros ?? 0n;
  const spent = w?.spent?.micros ?? 0n;
  const used = budget > 0n ? Number((spent * 1000n) / budget) / 10 : 0;
  return (
    <Section
      id="h-ag"
      title="Agent wallet"
      line="An agent wallet linked to your World ID. It trades for you within its budget and shares your limit per night."
    >
      {agent.wallet.isPending && (
        <Skeleton rows={2} height={56} label="Loading agent wallet" />
      )}
      {w && (
        <>
          <p className={styles.address}>
            <span className={text.muted}>Address</span>{" "}
            <span className={text.mono}>{w.address}</span>
          </p>
          <div className={styles.kpis}>
            <Kpis
              variant="large"
              label="Agent wallet figures"
              items={[
                { label: "Balance", value: usd(w.balance?.micros, 2) },
                {
                  label: "Budget used",
                  value: usd(spent, 2),
                  sub: `of ${usd(budget, 2)}`,
                  extra: (
                    <span className={styles.bar} aria-hidden="true">
                      <i style={{ width: `${Math.min(100, used)}%` }} />
                    </span>
                  ),
                },
                {
                  label: "Per order cap",
                  value: usd(w.perOrderCap?.micros, 2),
                },
                {
                  label: "Allowed nights",
                  value: w.allowedNights.length || "All",
                },
              ]}
            />
          </div>
          <h3 className={styles.h3}>Room nights bought by the agent</h3>
          {w.holdings.length ? (
            <div className={lists.lists}>
              {w.holdings.map((h) =>
                h.night ? (
                  <Link
                    key={nightHref(h.night)}
                    href={nightHref(h.night)}
                    className={`${lists.lst} ${styles.hold}`}
                  >
                    <span>
                      <b>{h.night.propertyId}</b>{" "}
                      <span className={text.muted}>
                        {h.night.roomTypeId}, {shortDate(h.night.date)}
                      </span>
                    </span>
                    <span className={text.num}>
                      {formatRoomNights(h.size?.tenths ?? 0)} rn
                    </span>
                  </Link>
                ) : null,
              )}
            </div>
          ) : (
            <Empty>Holds nothing yet.</Empty>
          )}
        </>
      )}
      <AgentWalletForms agent={agent} />
      <Feedback error={agent.error} />
    </Section>
  );
}
