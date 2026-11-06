import { Suspense } from "react";
import { PortfolioScreen } from "../../../../src/features/trade/components/portfolio/PortfolioScreen";
import { RouteLoading } from "../../../../src/features/trade/components/shared/RouteLoading";
export default function Page() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <PortfolioScreen />
    </Suspense>
  );
}
