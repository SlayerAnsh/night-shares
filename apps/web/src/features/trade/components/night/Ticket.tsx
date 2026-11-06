"use client";
import type { NightKey } from "@night-shares/proto/common/v1/night_pb";
import { useRequireAccess } from "../../../../session/require-access";
import { useSession } from "../../../../session/SessionProvider";
import { useTicket } from "../../hooks/use-ticket";
import { Feedback } from "../shared/Feedback";
import { Segmented } from "../ui/Segmented";
import { TicketAsk } from "./TicketAsk";
import { TicketPosition } from "./TicketPosition";
import { TicketTrade } from "./TicketTrade";
import styles from "./ticket.module.css";

// The order box: Buy | Sell selected by fill, one skeleton for every state.
export function Ticket({
  night,
  fair,
  cap,
}: {
  night: Pick<NightKey, "propertyId" | "roomTypeId" | "date">;
  fair?: bigint;
  cap?: bigint;
}) {
  const t = useTicket(night);
  const { level } = useSession();
  const access = useRequireAccess();
  const signedIn = level === "orb";
  return (
    <form
      className={styles.body}
      onSubmit={(event) => {
        event.preventDefault();
        if (!signedIn) {
          access.require("trade", "orb");
          return;
        }
        if (t.valid) void t.submit();
      }}
    >
      <Segmented
        variant="wide"
        label="Buy or sell"
        value={t.mode === "buy" ? "buy" : "sell"}
        onChange={(mode) => t.update({ mode: mode === "buy" ? "" : mode })}
        options={[
          { value: "buy", label: "Buy" },
          { value: "sell", label: "Sell" },
        ]}
      />
      {t.mode === "ask" ? (
        <TicketAsk ticket={t} fair={fair} cap={cap} signedIn={signedIn} />
      ) : (
        <TicketTrade ticket={t} signedIn={signedIn} />
      )}
      <Feedback error={t.actions.error} notice={t.actions.notice} />
      {signedIn && <TicketPosition night={night} />}
    </form>
  );
}
