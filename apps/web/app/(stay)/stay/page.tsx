import { Suspense } from "react";
import { SearchScreen } from "../../../src/features/stay/components/search/SearchScreen";
import { PageLoading } from "../../../src/features/stay/components/shared/PageLoading";
export default function Page() {
  return (
    <Suspense fallback={<PageLoading label="Loading stays" />}>
      <SearchScreen />
    </Suspense>
  );
}
