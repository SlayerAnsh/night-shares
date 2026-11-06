import Link from "next/link";
export default function Home() {
  return (
    <main>
      <h1>Night Shares</h1>
      <nav style={{ display: "flex", gap: 24 }}>
        <Link href="/stay">Stay</Link>
        <Link href="/trade">Trade</Link>
        <Link href="/host">Host</Link>
      </nav>
    </main>
  );
}
