import type { ReactNode } from "react";
import { AppShell } from "../../../src/shared/shell/AppShell";

// The trade palette is scoped by data-app on the shell (tokens.css).
// Each screen sets its own page width: the night view runs wider than the rest.
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <AppShell app="trade" layout="free">
      {children}
    </AppShell>
  );
}
