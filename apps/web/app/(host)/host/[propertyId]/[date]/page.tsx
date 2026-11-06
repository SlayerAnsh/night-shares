import { NightScreen } from "../../../../../src/features/host/components/night/NightScreen";
export default async function Page({
  params,
}: {
  params: Promise<{ propertyId: string; date: string }>;
}) {
  const { propertyId, date } = await params;
  return <NightScreen propertyId={propertyId} date={date} />;
}
