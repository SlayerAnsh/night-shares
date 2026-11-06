"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type AccessLevel, loginHref } from "../session/access";
import { useSession } from "../session/SessionProvider";
export function AppNav({
  brand,
  home,
  account,
  accountHref,
  need,
}: {
  brand: string;
  home: string;
  account: string;
  accountHref: string;
  need: AccessLevel;
}) {
  const { user, level } = useSession();
  const pathname = usePathname();
  return (
    <nav style={{ display: "flex", gap: 24 }} aria-label={brand}>
      <Link href={home}>{brand}</Link>
      <Link href={accountHref}>{account}</Link>
      {user ? (
        <span>
          {level} · {user.walletAddress.slice(0, 6)}…
          {user.walletAddress.slice(-4)}
        </span>
      ) : (
        <Link
          href={loginHref(
            pathname,
            home === "/host" ? "host" : "continue",
            need,
          )}
        >
          Sign in
        </Link>
      )}
    </nav>
  );
}
