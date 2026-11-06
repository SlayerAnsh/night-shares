import type { ReactNode } from "react";
import { AppShell } from "../../src/shared/shell/AppShell";

export default function Layout({ children }: { children: ReactNode }) {
  return <AppShell app="stay">{children}</AppShell>;
}
