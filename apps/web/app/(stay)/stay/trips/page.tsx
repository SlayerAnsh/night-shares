import { Suspense } from "react";
import { PageLoading } from "../../../../src/features/stay/components/shared/PageLoading";
import { TripsScreen } from "../../../../src/features/stay/components/trips/TripsScreen";
export default function Page() {
  return (
    <Suspense fallback={<PageLoading label="Loading trips" shape="trips" />}>
      <TripsScreen />
    </Suspense>
  );
}
