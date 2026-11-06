"use client";
import { Button, EmptyState, Field, Input } from "@night-shares/design-system";
import type { NightKey } from "@night-shares/proto/common/v1/night_pb";
import { useAgentOrders } from "../../hooks/use-agent-orders";
import { nightHref } from "../../model/market";
import { Section } from "../ui/Section";
import { AgentOrderRow } from "./AgentOrderRow";
import { Feedback } from "./Feedback";
import styles from "./lists.module.css";

// Agent orders share your World ID limit. Large ones wait for fresh approval.
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
    <Section
      id={night ? "h-ao-night" : "h-ao"}
      title="Agent orders"
      line="You and all your agents share one World ID limit per night. Orders over 1,000 USDC need fresh World ID approval."
      plain={!!night}
    >
      {night && (
        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            void a.submit();
          }}
        >
          <Field label="Room nights">
            <Input
              required
              type="number"
              min="0.1"
              step="0.1"
              value={a.size}
              onChange={(event) => a.update({ agentSize: event.target.value })}
            />
          </Field>
          <Field label="Budget, USDC">
            <Input
              required
              type="number"
              min="0.000001"
              step="0.000001"
              value={a.budget}
              onChange={(event) => a.update({ budget: event.target.value })}
            />
          </Field>
          <Button
            variant="primary"
            size="sm"
            type="submit"
            disabled={!a.valid || a.account.actions.pending}
          >
            Create agent order
          </Button>
        </form>
      )}
      <div className={styles.form}>
        <Field label="World ID seed" hint="Mock proof used to approve orders.">
          <Input
            value={a.seed}
            onChange={(event) => a.update({ seed: event.target.value })}
          />
        </Field>
      </div>
      <Feedback
        error={a.account.actions.error || a.account.portfolio.error?.message}
        notice={a.account.actions.notice}
      />
      {orders.length ? (
        <div className={styles.lists}>
          {orders.map((order) => (
            <AgentOrderRow
              key={order.id}
              order={order}
              canApprove={!a.account.actions.pending && !!a.seed.trim()}
              onApprove={() => void a.approveOrder(order.id)}
            />
          ))}
        </div>
      ) : (
        <EmptyState plain>No agent orders yet.</EmptyState>
      )}
    </Section>
  );
}
