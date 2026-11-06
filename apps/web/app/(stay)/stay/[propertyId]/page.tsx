import { Suspense } from "react";
import { DetailScreen } from "../../../../src/features/stay/components/detail/DetailScreen";
export default async function Page({
  params,
}: {
  params: Promise<{ propertyId: string }>;
}) {
  const { propertyId } = await params;
  return (
    <Suspense fallback={<p>Loading stay…</p>}>
      <DetailScreen propertyId={propertyId} />
    </Suspense>
  );
}
