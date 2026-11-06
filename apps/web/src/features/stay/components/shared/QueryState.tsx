import { ConnectError } from "@connectrpc/connect";
export function QueryState({
  pending,
  error,
}: {
  pending?: boolean;
  error?: unknown;
}) {
  if (error) return <p role="alert">{ConnectError.from(error).message}</p>;
  return pending ? <p role="status">Loading…</p> : null;
}
