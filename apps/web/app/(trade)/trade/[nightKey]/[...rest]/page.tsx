import { notFound } from "next/navigation";

// Deeper paths under a market are not pages; show Trade's own not found.
export default function Page() {
  notFound();
}
