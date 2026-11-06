import { notFound } from "next/navigation";

// Deeper paths under a hotel night are not pages; show Host's own not found.
export default function Page() {
  notFound();
}
