import "@night-shares/design-system/tokens.css";
import "@night-shares/design-system/base.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Providers } from "../src/providers/Providers";
import { fontVariables } from "../src/shared/fonts/fonts";

export const metadata: Metadata = { title: "Night Shares" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={fontVariables}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
