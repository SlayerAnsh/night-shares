import { Skeleton as Block } from "@night-shares/design-system";
import { Skeleton } from "../ui/Skeleton";
import styles from "./portfolio.module.css";

// Loading shape of the portfolio: four large figures, then position rows.
export function PortfolioSkeleton() {
  return (
    <div role="status" aria-label="Loading portfolio">
      <div className={styles.skelFigs}>
        {["value", "unreal", "real", "win"].map((key) => (
          <div key={key}>
            <Block height={13} width="55%" />
            <Block height={30} width="75%" />
          </div>
        ))}
      </div>
      <Skeleton rows={4} label="Loading positions" />
    </div>
  );
}
