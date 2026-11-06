import { Skeleton } from "../ui/Skeleton";
import page from "./page.module.css";

// Suspense fallback for the trade routes while search params resolve.
export function RouteLoading() {
  return (
    <div className={page.page}>
      <div className={page.head}>
        <Skeleton rows={1} height={34} label="Loading" />
      </div>
      <Skeleton rows={8} label="Loading" />
    </div>
  );
}
