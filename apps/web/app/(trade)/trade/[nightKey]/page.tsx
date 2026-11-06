import { Suspense } from "react";
import { NightScreen } from "../../../../src/features/trade/components/night/NightScreen";
import { RouteLoading } from "../../../../src/features/trade/components/shared/RouteLoading";
export default async function Page({
  params,
}: {
  params: Promise<{ nightKey: string }>;
}) {
  const { nightKey } = await params;
  // Direct loads can keep the colons percent encoded; client links do not.
  let key = nightKey;
  try {
    key = decodeURIComponent(nightKey);
  } catch {}
  return (
    <Suspense fallback={<RouteLoading />}>
      <NightScreen nightKey={key} />
    </Suspense>
  );
}
