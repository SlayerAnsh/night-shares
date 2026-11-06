import { Suspense } from "react";
import { PortfolioScreen } from "../../../src/features/host/components/portfolio/PortfolioScreen";
import { Loading } from "../../../src/features/host/components/ui/QueryState";
export default function Page() {
  return (
    <Suspense fallback={<Loading label="Loading your hotels" />}>
      <PortfolioScreen />
    </Suspense>
  );
}
