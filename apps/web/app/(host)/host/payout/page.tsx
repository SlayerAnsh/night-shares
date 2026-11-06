import { Suspense } from "react";
import { PayoutScreen } from "../../../../src/features/host/components/payout/PayoutScreen";
export default function Page() {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <PayoutScreen />
    </Suspense>
  );
}
