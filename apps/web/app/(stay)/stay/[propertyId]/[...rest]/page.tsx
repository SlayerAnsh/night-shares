import { notFound } from "next/navigation";

// Deeper paths under a stay are not pages; show Stay's own not found.
export default function Page() {
  notFound();
}
