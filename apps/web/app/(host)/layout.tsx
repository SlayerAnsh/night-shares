import { headers } from "next/headers";
import type { ReactNode } from "react";
import { requireAccessServer } from "../../src/session/require-access-server";
import { AppShell } from "../../src/shared/shell/AppShell";

export default async function Layout({ children }: { children: ReactNode }) {
  const next = (await headers()).get("x-night-shares-path") ?? "/host";
  await requireAccessServer("orb", next);
  return <AppShell app="host">{children}</AppShell>;
}
