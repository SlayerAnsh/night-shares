import { headers } from "next/headers";
import type { ReactNode } from "react";
import { requireAccessServer } from "../../src/session/require-access-server";
import { AppNav } from "../../src/shared/AppNav";
export default async function Layout({ children }: { children: ReactNode }) {
  const next = (await headers()).get("x-night-shares-path") ?? "/host";
  await requireAccessServer("orb", next);
  return (
    <>
      <AppNav
        brand="Night Shares Host"
        home="/host"
        account="Your hotels"
        accountHref="/host"
        need="orb"
      />
      <main
        style={{
          color: "var(--ink)",
          background: "var(--bg)",
          fontFamily: "var(--sans)",
          padding: "var(--sp-24)",
          display: "grid",
          gap: "var(--sp-16)",
        }}
      >
        {children}
      </main>
    </>
  );
}
