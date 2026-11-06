"use client";
import type { NightKey } from "@night-shares/proto/common/v1/night_pb";
import Link from "next/link";
import { formatRoomNights } from "../../../../shared/format";
import { useAgentOrders } from "../../hooks/use-agent-orders";
import { money, nightHref } from "../../model/market";
import { Feedback } from "./Feedback";
export function AgentOrders({
  night,
}: {
  night?: Pick<NightKey, "propertyId" | "roomTypeId" | "date">;
}) {
  const a = useAgentOrders(night);
  const orders =
    a.account.portfolio.data?.agentOrders.filter(
      (order) =>
        !night || (order.night && nightHref(order.night) === nightHref(night)),
    ) ?? [];
  return (
    <section>
      <h2>Agent orders</h2>
      <p>
        You and all your agents share one World ID limit per night. Orders over
        1,000 USDC need fresh World ID approval.
      </p>
      {night && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void a.submit();
          }}
        >
          <label>
            Room nights{" "}
            <input
              required
              type="number"
              min="0.1"
              step="0.1"
              value={a.size}
              onChange={(event) => a.update({ agentSize: event.target.value })}
            />
          </label>
          <label>
            Budget, USDC{" "}
            <input
              required
              type="number"
              min="0.000001"
              step="0.000001"
              value={a.budget}
              onChange={(event) => a.update({ budget: event.target.value })}
            />
          </label>
          <button
            disabled={!a.valid || a.account.actions.pending}
            type="submit"
          >
            Create agent order
          </button>
        </form>
      )}
      <label>
        World ID seed{" "}
        <input
          value={a.seed}
          onChange={(event) => a.update({ seed: event.target.value })}
        />
      </label>
      <Feedback
        error={a.account.actions.error || a.account.portfolio.error?.message}
        notice={a.account.actions.notice}
      />
      {!orders.length && <p>No agent orders yet.</p>}
      <ul>
        {orders.map((order) => (
          <li key={order.id}>
            {order.night && (
              <Link href={nightHref(order.night)}>
                {order.night.date} · {order.night.roomTypeId}
              </Link>
            )}{" "}
            · {formatRoomNights(order.size?.tenths ?? 0)} room nights · Budget{" "}
            {money(order.budget)} · Spent {money(order.spent)} ·{" "}
            {["Unknown", "Pending", "Approved", "Executed"][order.status]}
            <p>Agent wallet: {order.walletAddress}</p>
            {order.status === 1 && (
              <button
                type="button"
                disabled={a.account.actions.pending || !a.seed.trim()}
                onClick={() => void a.approveOrder(order.id)}
              >
                Approve with World ID
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
