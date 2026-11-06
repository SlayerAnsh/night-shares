"use client";
import { useProperty } from "./use-host-data";

// The demo catalog has two hotels a host can still connect.
const CONNECTABLE = ["prop_salinas", "prop_machiya"];

export function useConnectOptions(owned: string[]) {
  const salinas = useProperty(CONNECTABLE[0] ?? "");
  const machiya = useProperty(CONNECTABLE[1] ?? "");
  const options = [salinas.data?.property, machiya.data?.property].flatMap(
    (p) => (p && !owned.includes(p.id) ? [p] : []),
  );
  return {
    options,
    error: salinas.error ?? machiya.error,
    isPending: salinas.isPending || machiya.isPending,
  };
}
