import type { ReactNode } from "react";
import { AppShell } from "../../src/shared/shell/AppShell";

// Stay screens open on a full bleed photo hero under a transparent nav, as in
// the mock. Checkout has no hero, so its nav stays solid.
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <AppShell app="stay" layout="bleed" hero={{ solidOn: ["/checkout"] }}>
      {children}
    </AppShell>
  );
}
