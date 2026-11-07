"use client";
import { callUnaryMethod, useTransport } from "@connectrpc/connect-query";
import type { NightKey } from "@night-shares/proto/common/v1/night_pb";
import type { Ask, Execution } from "@night-shares/proto/market/v1/book_pb";
import * as rpc from "@night-shares/proto/market/v1/market-MarketService_connectquery";
import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useRequireAccess } from "../../../session/require-access";
import {
  AttemptKeeper,
  IDEMPOTENCY_HEADER,
} from "../../../shared/tx/idempotency";
import { type TxFailure, txFailure, txHashOf } from "../../../shared/tx/tx";

type Usdc = { micros: bigint };
type Order = {
  night: Pick<NightKey, "propertyId" | "roomTypeId" | "date">;
  size: { tenths: number };
};
export type TradeRequest =
  | { mode: "buy"; input: Order & { maxTotal: Usdc } }
  | { mode: "sell"; input: Order & { minTotal: Usdc } }
  | { mode: "ask"; input: Order & { price: Usdc } };

export type TradeTx =
  | { phase: "idle" }
  | { phase: "pending"; request: TradeRequest }
  | {
      phase: "confirmed";
      request: TradeRequest;
      execution?: Execution;
      ask?: Ask;
      hash?: string;
    }
  | { phase: "failed"; request: TradeRequest; failure: TxFailure };

/**
 * Buy, sell or list from the order box. Buy and sell carry one idempotency
 * key per click; when the outcome is unknown the same request and key are
 * resent on "Check again", so a retry never trades twice. What the confirmed
 * state shows is the API's result, which it reads back from the receipt.
 */
export function useTradeTx() {
  const transport = useTransport();
  const cache = useQueryClient();
  const access = useRequireAccess();
  const keeper = useRef(new AttemptKeeper<TradeRequest>()).current;
  const [state, setState] = useState<TradeTx>({ phase: "idle" });
  const pending = state.phase === "pending";

  async function send(request: TradeRequest) {
    if (pending || !access.require("trade", "orb")) return;
    const attempt = keeper.begin(request);
    const sent = attempt.request;
    const headers = { [IDEMPOTENCY_HEADER]: attempt.key };
    setState({ phase: "pending", request: sent });
    try {
      if (sent.mode === "ask") {
        const res = await callUnaryMethod(transport, rpc.postAsk, sent.input);
        keeper.settle(false);
        setState({ phase: "confirmed", request: sent, ask: res.ask });
      } else {
        const res =
          sent.mode === "buy"
            ? await callUnaryMethod(transport, rpc.buy, sent.input, { headers })
            : await callUnaryMethod(transport, rpc.sell, sent.input, {
                headers,
              });
        keeper.settle(false);
        setState({
          phase: "confirmed",
          request: sent,
          execution: res.execution,
          hash: txHashOf(res.execution),
        });
      }
    } catch (cause) {
      const failure = txFailure(cause);
      keeper.settle(failure.unknownOutcome);
      setState({ phase: "failed", request: sent, failure });
    }
    // Positions, book and quotes all move after a write, or a failed one.
    await cache.invalidateQueries({
      predicate: (query) => query.meta?.session !== true,
    });
  }

  return {
    state,
    pending,
    // A sent request whose receipt was not read yet.
    unresolved: state.phase === "failed" && state.failure.unknownOutcome,
    send,
    checkAgain: () => {
      const waiting = keeper.unresolved;
      if (waiting) void send(waiting.request);
    },
    dismiss: () => {
      if (!keeper.unresolved) setState({ phase: "idle" });
    },
  };
}
