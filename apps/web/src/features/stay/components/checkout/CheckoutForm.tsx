"use client";
import {
  Badge,
  Button,
  Field,
  Input,
  Spinner,
} from "@night-shares/design-system";
import { formatUsdc } from "../../../../shared/format";
import type { useCheckout } from "../../hooks/use-checkout";
import { QueryState } from "../shared/QueryState";
import styles from "./Checkout.module.css";
import { PayProgress } from "./PayProgress";

type Checkout = ReturnType<typeof useCheckout>;
const short = (a = "") => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");

export function CheckoutForm({ c }: { c: Checkout }) {
  const user = c.session.user;
  const total = formatUsdc(c.lockedQuote?.total?.micros ?? 0n);
  return (
    <form
      className={styles.form}
      onSubmit={(e) => {
        e.preventDefault();
        void c.pay().catch(() => {});
      }}
    >
      <h1 className={styles.formTitle}>Confirm and pay</h1>
      {user && (
        <div className={styles.wid}>
          <span className={styles.widDot} aria-hidden="true" />
          <span>
            <b>Signed in with World ID</b> ·{" "}
            {c.session.level === "orb" ? "Orb" : "Device"}
          </span>
          <span className={styles.mono}>{short(user.humanId)}</span>
        </div>
      )}
      <Field label="Full name, for the hotel">
        <Input
          required
          autoComplete="name"
          value={c.guestName}
          onChange={(e) => c.setGuestName(e.target.value)}
        />
      </Field>
      <Field
        label="Email"
        hint="Sent only to your hotel. World ID never shares your name with us."
      >
        <Input
          required
          type="email"
          autoComplete="email"
          value={c.guestEmail}
          onChange={(e) => c.setGuestEmail(e.target.value)}
        />
      </Field>
      <div className={styles.paybox}>
        <span className={styles.walletIcon} aria-hidden="true" />
        <div>
          <b className={styles.mono}>
            {short(user?.walletAddress) || "Your wallet"}
          </b>
          <div className={styles.muted}>
            Paid from your wallet on Arc, in USDC
          </div>
        </div>
        {user && (
          <Badge tone="pos" className={styles.connected}>
            Connected
          </Badge>
        )}
      </div>
      <Button
        type="submit"
        variant="primary"
        size="lg"
        block
        disabled={
          !c.countdown.seconds || c.booking.isPending || c.lock.isPending
        }
      >
        {c.booking.isPending ? (
          <>
            <Spinner label="Paying" /> Paying in USDC
          </>
        ) : (
          `Pay ${total} and book`
        )}
      </Button>
      {c.booking.isPending && <PayProgress />}
      <QueryState error={c.booking.error} />
      <p className={styles.terms}>
        Paying books your room straight away, in one step. By paying you agree
        to the house rules.
      </p>
    </form>
  );
}
