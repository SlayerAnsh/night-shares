import { Suspense } from "react";
import { CheckoutScreen } from "../../../../../src/features/stay/components/checkout/CheckoutScreen";
import { PageLoading } from "../../../../../src/features/stay/components/shared/PageLoading";
export default async function Page({
  params,
}: {
  params: Promise<{ propertyId: string }>;
}) {
  const { propertyId } = await params;
  return (
    <Suspense
      fallback={<PageLoading label="Loading checkout" shape="checkout" />}
    >
      <CheckoutScreen propertyId={propertyId} />
    </Suspense>
  );
}
