"use client";
import {
  Alert,
  BackLink,
  Badge,
  EmptyState,
} from "@night-shares/design-system";
import Link from "next/link";
import { useNight } from "../../hooks/use-night";
import { useUrlState } from "../../hooks/use-url-state";
import { parseNightKey } from "../../model/market";
import { Feedback } from "../shared/Feedback";
import page from "../shared/page.module.css";
import { Skeleton } from "../ui/Skeleton";
import { NightHeader } from "./NightHeader";
import { NightMarket } from "./NightMarket";
import { NightTabs } from "./NightTabs";
import { NightVerdict } from "./NightVerdict";
import styles from "./night.module.css";
import { Ticket } from "./Ticket";
import { TicketBar } from "./TicketBar";
import ticket from "./ticket.module.css";

export function NightScreen({ nightKey }: { nightKey: string }) {
  const night = parseNightKey(nightKey);
  if (night) return <NightContent night={night} />;
  return (
    <div className={page.page}>
      <MarketsLink />
      <Feedback error="This market link is not valid." />
      <EmptyState plain>
        Pick a market from the <Link href="/trade">list of markets</Link>.
      </EmptyState>
    </div>
  );
}

function MarketsLink() {
  return (
    <BackLink as={Link} href="/trade">
      Markets
    </BackLink>
  );
}

// Market layout: header strip, then chart, book and trades with the order box
// sticky on the right; one column with a jump bar on phones.
function NightContent({
  night,
}: {
  night: NonNullable<ReturnType<typeof parseNightKey>>;
}) {
  const state = useNight(night);
  const { update } = useUrlState();
  const card = state.detail.data?.night;
  const fair = state.book.data?.fairPrice?.micros;
  return (
    <div className={`${page.page} ${page.wide} ${styles.screen}`}>
      <MarketsLink />
      {(state.detail.data?.tradingPaused || state.book.data?.tradingPaused) && (
        <Alert>
          <Badge>Trading paused</Badge>
        </Alert>
      )}
      {card ? (
        <NightHeader
          card={card}
          date={night.date}
          book={state.book.data}
          watched={state.watched}
          watchPending={state.actions.pending}
          onWatch={state.toggle}
        />
      ) : state.detail.isPending ? (
        <Skeleton rows={2} height={48} label="Loading market" />
      ) : null}
      <Feedback error={state.detail.error?.message} />
      <Feedback
        error={state.actions.error || state.watch.error?.message}
        notice={state.actions.notice}
      />
      {card && <NightVerdict card={card} detail={state.detail.data} />}
      <div className={styles.layout}>
        <div className={styles.main}>
          <NightMarket
            detail={state.detail.data}
            book={state.book}
            tape={state.tape}
            fair={fair ?? card?.fairPrice?.micros}
            onPick={(mode, tenths) =>
              update({
                mode: mode === "buy" ? "" : mode,
                size: String(tenths / 10),
              })
            }
          />
          <NightTabs
            night={night}
            detail={state.detail.data}
            book={state.book.data}
          />
        </div>
        <aside
          id="ticket"
          className={`${ticket.ticket} ${styles.ticket}`}
          aria-label="Trade this market"
        >
          <Ticket
            night={night}
            tradingPaused={
              state.detail.data?.tradingPaused || state.book.data?.tradingPaused
            }
            fair={fair}
            cap={state.book.data?.recallCap?.micros}
          />
        </aside>
      </div>
      <TicketBar />
    </div>
  );
}
