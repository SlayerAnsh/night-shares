"use client";
import { Tabs } from "@night-shares/design-system";
import type { NightKey } from "@night-shares/proto/common/v1/night_pb";
import type {
  GetBookResponse,
  GetNightResponse,
} from "@night-shares/proto/market/v1/market_pb";
import { useState } from "react";
import { AgentOrders } from "../shared/AgentOrders";
import { Listings } from "../shared/Listings";
import { CalendarPanel } from "./CalendarPanel";
import { HoldersPanel } from "./HoldersPanel";
import { HowPanel } from "./HowPanel";
import styles from "./tabs.module.css";
import { WhyPanel } from "./WhyPanel";

const TABS = [
  { value: "why", label: "Why these numbers" },
  { value: "cal", label: "Other dates" },
  { value: "how", label: "How it works" },
  { value: "holders", label: "Holders" },
  { value: "orders", label: "Your orders" },
] as const;
type Tab = (typeof TABS)[number]["value"];

// Detail panels under the market: a plain text tab row with an underline.
export function NightTabs({
  night,
  detail,
  book,
}: {
  night: Pick<NightKey, "propertyId" | "roomTypeId" | "date">;
  detail?: GetNightResponse;
  book?: GetBookResponse;
}) {
  const [tab, setTab] = useState<Tab>("why");
  const title = TABS.find((option) => option.value === tab)?.label;
  return (
    <section className={styles.sec} aria-label="More about this market">
      <Tabs
        className={styles.tabs}
        label="More about this market"
        options={TABS}
        value={tab}
        onChange={setTab}
      />
      <div className={styles.panel} role="tabpanel" aria-label={title}>
        {tab === "why" && <WhyPanel detail={detail} />}
        {tab === "cal" && <CalendarPanel night={night} detail={detail} />}
        {tab === "how" && <HowPanel detail={detail} book={book} />}
        {tab === "holders" && <HoldersPanel book={book} />}
        {tab === "orders" && (
          <div className={styles.orders}>
            <Listings night={night} />
            <AgentOrders night={night} />
          </div>
        )}
      </div>
    </section>
  );
}
