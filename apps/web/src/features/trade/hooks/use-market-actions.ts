"use client";
import { ConnectError } from "@connectrpc/connect";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useRequireAccess } from "../../../session/require-access";
export function useMarketActions() {
  const access = useRequireAccess();
  const cache = useQueryClient();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);
  async function run(
    action: () => Promise<unknown>,
    why = "trade",
    message = "Done.",
  ) {
    if (pending || !access.require(why, "orb")) return;
    setError("");
    setNotice("");
    setPending(true);
    try {
      await action();
      setNotice(message);
      await cache.invalidateQueries({
        predicate: (query) => query.meta?.session !== true,
      });
    } catch (cause) {
      setError(ConnectError.from(cause).message);
    } finally {
      setPending(false);
    }
  }
  return { run, error, notice, pending };
}
