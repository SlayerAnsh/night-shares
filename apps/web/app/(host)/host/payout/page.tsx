import { Suspense } from "react";
import { PayoutScreen } from "../../../../src/features/host/components/payout/PayoutScreen";
import { Loading } from "../../../../src/features/host/components/ui/QueryState";
export default function Page() {
  return (
    <Suspense fallback={<Loading label="Loading payouts" />}>
      <PayoutScreen />
    </Suspense>
  );
}
