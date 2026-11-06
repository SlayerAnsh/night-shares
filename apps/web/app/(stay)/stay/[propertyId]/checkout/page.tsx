import { Suspense } from "react";
import { CheckoutScreen } from "../../../../../src/features/stay/components/checkout/CheckoutScreen";
export default async function Page({
  params,
}: {
  params: Promise<{ propertyId: string }>;
}) {
  const { propertyId } = await params;
  return (
    <Suspense fallback={<p>Loading stay…</p>}>
      <CheckoutScreen propertyId={propertyId} />
    </Suspense>
  );
}
