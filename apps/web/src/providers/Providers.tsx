"use client";
import { TransportProvider } from "@connectrpc/connect-query";
import { createConnectTransport } from "@connectrpc/connect-web";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { SessionProvider } from "../session/SessionProvider";
import { isRetryable } from "../shared/fallback/error-copy";

// Retry only what a second try can fix (network, timeouts), so a missing
// stay or a signed out call shows its fallback at once, not after 3 retries.
function retry(failures: number, error: unknown) {
  return failures < 2 && isRetryable(error);
}
export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry } } }),
  );
  const [transport] = useState(() =>
    createConnectTransport({ baseUrl: "/rpc" }),
  );
  return (
    <QueryClientProvider client={client}>
      <TransportProvider transport={transport}>
        <SessionProvider>{children}</SessionProvider>
      </TransportProvider>
    </QueryClientProvider>
  );
}
