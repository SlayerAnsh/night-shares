import { Suspense } from "react";
import { DetailScreen } from "../../../../src/features/stay/components/detail/DetailScreen";
import { PageLoading } from "../../../../src/features/stay/components/shared/PageLoading";
export default async function Page({
  params,
}: {
  params: Promise<{ propertyId: string }>;
}) {
  const { propertyId } = await params;
  return (
    <Suspense fallback={<PageLoading label="Loading stay" />}>
      <DetailScreen propertyId={propertyId} />
    </Suspense>
  );
}
