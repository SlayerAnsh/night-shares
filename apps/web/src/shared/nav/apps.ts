import type { AccessLevel } from "../../session/access";

export type AppKey = "stay" | "trade" | "host";

export type NavLink = { label: string; href: string };

export type AppInfo = {
  name: string;
  home: string;
  // Level the app's own actions need, used for the sign in link.
  need: AccessLevel;
  why: string;
  // The app's own pages, listed in the account menu.
  links: ReadonlyArray<NavLink>;
  // Section tabs shown next to the brand (trade).
  sections?: ReadonlyArray<NavLink>;
  // One plain link before the account button (stay).
  navLink?: NavLink;
};

// Stay, Trade and Host are separate apps behind one switcher.
export const apps: Record<AppKey, AppInfo> = {
  stay: {
    name: "Stay",
    home: "/stay",
    need: "device",
    why: "continue",
    links: [{ label: "My trips", href: "/stay/trips" }],
    navLink: { label: "My trips", href: "/stay/trips" },
  },
  trade: {
    name: "Trade",
    home: "/trade",
    need: "orb",
    why: "continue",
    links: [{ label: "Portfolio", href: "/trade/portfolio" }],
    sections: [
      { label: "Discover", href: "/trade" },
      { label: "Portfolio", href: "/trade/portfolio" },
    ],
  },
  host: {
    name: "Host",
    home: "/host",
    need: "orb",
    why: "host",
    links: [
      { label: "Your hotels", href: "/host" },
      { label: "Payouts", href: "/host/payout" },
    ],
  },
};

export const appKeys: ReadonlyArray<AppKey> = ["stay", "trade", "host"];
