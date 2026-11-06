"use client";
import { useMutation, useQuery } from "@connectrpc/connect-query";
import * as rpc from "@night-shares/proto/market/v1/market-MarketService_connectquery";
import { useState } from "react";
import { parseMicros } from "../model/market";

function micros(value: string) {
  const result = parseMicros(value);
  if (result === null) throw new Error("Enter a valid USDC amount.");
  return result;
}

function allowedNights(text: string) {
  if (!text.trim()) return [];
  return text
    .trim()
    .split(/\n+/)
    .map((line) => {
      const parts = line.trim().split(":");
      if (parts.length !== 3)
        throw new Error("Use propertyId:roomTypeId:date for each night.");
      return { propertyId: parts[0], roomTypeId: parts[1], date: parts[2] };
    });
}

// Agent wallet: balance, budget caps and allowed nights, plus fund and withdraw.
export function useAgentWallet() {
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
  return {
    wallet,
    busy,
    error: error || wallet.error?.message || "",
    fields: { amount, total, cap, nights },
    set: { amount: setAmount, total: setTotal, cap: setCap, nights: setNights },
    fund: () =>
      run(() => fund.mutateAsync({ amount: { micros: micros(amount) } })),
    withdraw: () =>
      run(() => withdraw.mutateAsync({ amount: { micros: micros(amount) } })),
    setBudget: () =>
      run(() =>
        budget.mutateAsync({
          totalBudget: { micros: micros(total) },
          perOrderCap: { micros: micros(cap) },
          allowedNights: allowedNights(nights),
        }),
      ),
  };
}
