import { Field, Input } from "@night-shares/design-system";
import type { useAgentWallet } from "../../hooks/use-agent-wallet";
import { Button } from "../ui/Button";
import styles from "./agent.module.css";

// Move funds, then set the budget caps and the nights the agent may trade.
export function AgentWalletForms({
  agent,
}: {
  agent: ReturnType<typeof useAgentWallet>;
}) {
  const { fields, set, busy } = agent;
  return (
    <div className={styles.forms}>
      <div className={styles.form}>
        <h3>Move funds</h3>
        <div className={styles.fields}>
          <Field label="Transfer amount, USDC">
            <Input
              inputMode="decimal"
              value={fields.amount}
              onChange={(e) => set.amount(e.target.value)}
            />
          </Field>
        </div>
        <div className={styles.acts}>
          <Button variant="primary" disabled={busy} onClick={agent.fund}>
            Fund agent
          </Button>
          <Button disabled={busy} onClick={agent.withdraw}>
            Withdraw to my wallet
          </Button>
        </div>
      </div>
      <div className={styles.form}>
        <h3>Budget and allowed nights</h3>
        <div className={styles.fields}>
          <Field label="Total spend cap, USDC">
            <Input
              inputMode="decimal"
              value={fields.total}
              onChange={(e) => set.total(e.target.value)}
            />
          </Field>
          <Field label="Per order cap, USDC">
            <Input
              inputMode="decimal"
              value={fields.cap}
              onChange={(e) => set.cap(e.target.value)}
            />
          </Field>
          <Field
            className={styles.wide}
            label="Allowed nights"
            hint="One propertyId:roomTypeId:date per line. Blank allows all."
          >
            <textarea
              className={styles.textarea}
              value={fields.nights}
              onChange={(e) => set.nights(e.target.value)}
            />
          </Field>
        </div>
        <div className={styles.acts}>
          <Button variant="primary" disabled={busy} onClick={agent.setBudget}>
            Set budget and allowed nights
          </Button>
        </div>
      </div>
    </div>
  );
}
