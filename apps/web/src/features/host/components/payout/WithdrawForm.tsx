"use client";
import { useState } from "react";
import { useRequireAccess } from "../../../../session/require-access";
import { formatUsdc } from "../../../../shared/format";
import { useHostMutations } from "../../hooks/use-host-data";
import { useHostSearch } from "../../hooks/use-host-search";
import { parseAmount } from "../../model/host-view";
import { ErrorMessage } from "../shared/HostFacts";

export function WithdrawForm({
  propertyId,
  available,
}: {
  propertyId: string;
  available: bigint;
}) {
  const { search, set } = useHostSearch();
  const key = `amount_${propertyId}`;
  const amount = search.get(key) ?? "";
  const { withdraw } = useHostMutations();
  const access = useRequireAccess();
  const [error, setError] = useState("");
  function submit(all: boolean) {
    setError("");
    const micros = all ? undefined : parseAmount(amount);
    if (!all && (micros === undefined || micros > available)) {
      setError(
        "Choose an amount within your available payout, with up to six decimals.",
      );
      return;
    }
    if (access.require("host", "orb"))
      withdraw.mutate({
        propertyId,
        amount: micros === undefined ? undefined : { micros },
      });
  }
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit(false);
      }}
    >
      <label>
        Amount (USDC){" "}
        <input
          inputMode="decimal"
          value={amount}
          onChange={(e) => set({ [key]: e.target.value })}
        />
      </label>
      <button type="submit" disabled={withdraw.isPending || available <= 0n}>
        Withdraw amount
      </button>
      <button
        type="button"
        disabled={withdraw.isPending || available <= 0n}
        onClick={() => submit(true)}
      >
        Withdraw all
      </button>
      {error && <p role="alert">{error}</p>}
      <ErrorMessage error={withdraw.error} />
      {withdraw.data && (
        <p role="status">
          Sent {formatUsdc(withdraw.data.withdrawn?.micros ?? 0n)} to your
          wallet. Transaction: {withdraw.data.transactionId}
        </p>
      )}
    </form>
  );
}
