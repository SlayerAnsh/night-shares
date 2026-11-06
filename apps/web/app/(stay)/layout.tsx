import type { ReactNode } from "react";
import { AppNav } from "../../src/shared/AppNav";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <AppNav
        brand="Night Shares Stay"
        home="/stay"
        account="My trips"
        accountHref="/stay/trips"
        need="device"
      />
      <main
        style={{
          color: "var(--ink)",
          background: "var(--bg)",
          fontFamily: "var(--sans)",
          padding: "var(--sp-24)",
        }}
      >
        {children}
      </main>
    </>
  );
}
