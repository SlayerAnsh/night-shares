import { Suspense } from "react";
import { SearchScreen } from "../../../src/features/stay/components/search/SearchScreen";
export default function Page() {
  return (
    <Suspense fallback={<p>Loading stays…</p>}>
      <SearchScreen />
    </Suspense>
  );
}
