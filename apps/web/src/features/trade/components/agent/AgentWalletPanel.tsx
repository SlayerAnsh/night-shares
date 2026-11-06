"use client";
import { useMutation, useQuery } from "@connectrpc/connect-query";
import * as rpc from "@night-shares/proto/market/v1/market-MarketService_connectquery";
import { useState } from "react";
import { money, parseMicros } from "../../model/market";

export function AgentWalletPanel() {
  const wallet = useQuery(rpc.getAgentWallet, {});
  const fund = useMutation(rpc.fundAgentWallet);
  const withdraw = useMutation(rpc.withdrawAgentWallet);
  const budget = useMutation(rpc.setAgentBudget);
  const [amount, setAmount] = useState("100");
  const [total, setTotal] = useState("1000");
  const [cap, setCap] = useState("100");
  const [nights, setNights] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
      await wallet.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  function micros(value: string) {
    const result = parseMicros(value);
    if (result === null) throw new Error("Enter a valid USDC amount.");
    return result;
  }
  const w = wallet.data?.wallet;
  return (
    <section aria-label="Agent wallet">
      <h2>Agent wallet</h2>
      {w && (
        <>
          <p>{w.address}</p>
          <p>
            Balance {money(w.balance)} · Budget {money(w.totalBudget)} · Spent{" "}
            {money(w.spent)} · Per order {money(w.perOrderCap)}
          </p>
          <ul>
            {w.holdings.map((h) => (
              <li
                key={`${h.night?.propertyId}:${h.night?.roomTypeId}:${h.night?.date}`}
              >
                {h.night?.propertyId} / {h.night?.roomTypeId} / {h.night?.date}:{" "}
                {(h.size?.tenths ?? 0) / 10} room nights attributed to agent
                purchases
              </li>
            ))}
          </ul>
        </>
      )}
      <label>
        Transfer amount, USDC{" "}
        <input value={amount} onChange={(e) => setAmount(e.target.value)} />
      </label>
      <button
        type="button"
        disabled={busy}
        onClick={() =>
          run(() => fund.mutateAsync({ amount: { micros: micros(amount) } }))
        }
      >
        Fund agent
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() =>
          run(() =>
            withdraw.mutateAsync({ amount: { micros: micros(amount) } }),
          )
        }
      >
        Withdraw to my wallet
      </button>
      <label>
        Total spend cap, USDC{" "}
        <input value={total} onChange={(e) => setTotal(e.target.value)} />
      </label>
      <label>
        Per-order cap, USDC{" "}
        <input value={cap} onChange={(e) => setCap(e.target.value)} />
      </label>
      <label>
        Allowed nights, one propertyId:roomTypeId:date per line. Blank allows
        all.
        <textarea value={nights} onChange={(e) => setNights(e.target.value)} />
      </label>
      <button
        type="button"
        disabled={busy}
        onClick={() =>
          run(() =>
            budget.mutateAsync({
              totalBudget: { micros: micros(total) },
              perOrderCap: { micros: micros(cap) },
              allowedNights: nights.trim()
                ? nights
                    .trim()
                    .split(/\n+/)
                    .map((line) => {
                      const parts = line.trim().split(":");
                      if (parts.length !== 3)
                        throw new Error(
                          "Use propertyId:roomTypeId:date for each night.",
                        );
                      return {
                        propertyId: parts[0],
                        roomTypeId: parts[1],
                        date: parts[2],
                      };
                    })
                : [],
            }),
          )
        }
      >
        Set budget and allowed nights
      </button>
      {(error || wallet.error) && (
        <p role="alert">{error || wallet.error?.message}</p>
      )}
    </section>
  );
}
