import { Suspense } from "react";
import { HotelScreen } from "../../../../src/features/host/components/hotel/HotelScreen";
export default async function Page({
  params,
}: {
  params: Promise<{ propertyId: string }>;
}) {
  const { propertyId } = await params;
  return (
    <Suspense fallback={<p>Loading hotel…</p>}>
      <HotelScreen propertyId={propertyId} />
    </Suspense>
  );
}
