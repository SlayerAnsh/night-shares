import type { Database } from "bun:sqlite";
export function coverAccount(db: Database, propertyId: string) {
  return (
    db
      .query<{ spent: bigint; debt: bigint }, [string]>(
        "SELECT spent, debt FROM host_cover_accounts WHERE property_id = ?",
      )
      .get(propertyId) ?? { spent: 0n, debt: 0n }
  );
}
export function adjustCoverAccount(
  db: Database,
  propertyId: string,
  spent: bigint,
  debt: bigint,
) {
  db.query(`INSERT INTO host_cover_accounts VALUES (?, ?, ?)
    ON CONFLICT(property_id) DO UPDATE SET spent = spent + excluded.spent, debt = debt + excluded.debt`).run(
    propertyId,
    spent,
    debt,
  );
}
