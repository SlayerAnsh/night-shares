import { Suspense } from "react";
import { DiscoverScreen } from "../../../src/features/trade/components/discover/DiscoverScreen";
export default function Page() {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <DiscoverScreen />
    </Suspense>
  );
}
