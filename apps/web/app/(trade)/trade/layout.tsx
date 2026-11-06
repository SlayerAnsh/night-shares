import type { ReactNode } from "react";
import { AppNav } from "../../../src/shared/AppNav";
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div
      data-app="trade"
      style={{
        color: "var(--ink)",
        background: "var(--bg)",
        minHeight: "100vh",
      }}
    >
      <AppNav
        brand="Night Shares Trade"
        home="/trade"
        account="Portfolio"
        accountHref="/trade/portfolio"
        need="orb"
      />
      <main style={{ padding: "1rem" }}>{children}</main>
    </div>
  );
}
