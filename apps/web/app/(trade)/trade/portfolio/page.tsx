import { Suspense } from "react";
import { PortfolioScreen } from "../../../../src/features/trade/components/portfolio/PortfolioScreen";
export default function Page() {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <PortfolioScreen />
    </Suspense>
  );
}
