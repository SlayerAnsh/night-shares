"use client";
import { TransportProvider } from "@connectrpc/connect-query";
import { createConnectTransport } from "@connectrpc/connect-web";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { SessionProvider } from "../session/SessionProvider";
export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient());
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
