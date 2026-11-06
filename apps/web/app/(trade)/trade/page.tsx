import { Suspense } from "react";
import { DiscoverScreen } from "../../../src/features/trade/components/discover/DiscoverScreen";
import { RouteLoading } from "../../../src/features/trade/components/shared/RouteLoading";
export default function Page() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <DiscoverScreen />
    </Suspense>
  );
}
