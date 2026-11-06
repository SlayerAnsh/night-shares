import type { ReactNode } from "react";
import { AppNav } from "../../src/shared/AppNav";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <AppNav
        brand="Night Shares Trade"
        home="/trade"
        account="Portfolio"
        accountHref="/trade/portfolio"
        need="orb"
      />
      <main>{children}</main>
    </>
  );
}
