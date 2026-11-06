import { Suspense } from "react";
import { HotelScreen } from "../../../../src/features/host/components/hotel/HotelScreen";
import { Loading } from "../../../../src/features/host/components/ui/QueryState";
export default async function Page({
  params,
}: {
  params: Promise<{ propertyId: string }>;
}) {
  const { propertyId } = await params;
  return (
    <Suspense fallback={<Loading label="Loading hotel" />}>
      <HotelScreen propertyId={propertyId} />
    </Suspense>
  );
}
