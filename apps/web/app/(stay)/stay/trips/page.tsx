import { Suspense } from "react";
import { TripsScreen } from "../../../../src/features/stay/components/trips/TripsScreen";
export default function Page() {
  return (
    <Suspense fallback={<p>Loading trips…</p>}>
      <TripsScreen />
    </Suspense>
  );
}
