import { Suspense } from "react";
import { NightScreen } from "../../../../src/features/trade/components/night/NightScreen";
export default async function Page({
  params,
}: {
  params: Promise<{ nightKey: string }>;
}) {
  const { nightKey } = await params;
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <NightScreen nightKey={nightKey} />
    </Suspense>
  );
}
