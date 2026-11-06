# Changelog

All notable changes to this monorepo. Newest first.

## Unreleased

### Added

- All six services implemented on mocks (identity, wallet, catalog, stay, market, host) with unit and end to end tests.
- Activity log, wallet transaction history and one time World ID action tokens as shared ports.
- Market analytics (return, APY, risk, price history, host track record) as pure functions in `market-model`.
- API server skeleton (`apps/api`): Bun with Connect, auth by per RPC access option, Swagger UI at `/docs`, mock adapters for every external system, shared night inventory, stub handlers for all six services.
- Service contracts (`packages/proto`): identity, catalog, stay, market, host and wallet, 43 RPCs, with generated TypeScript, Connect Query helpers and OpenAPI 3.1.
- Market model (`packages/market-model`): TypeScript port of the mock pricing model with parity tests against the original.
- Design tokens (`packages/design-system`) from the mock v2 styles, light and dark.
- Coding standards and platform spec.

### Changed

- Market model, in both mock and port: guests never pay above the recall cap, distant nights never show negative inventory, rooms split exactly across room types, trader ask and recall fills charge the seller fee, and recall markups below 5% are rejected.

### Security

- Host ownership: only a property's owner can change its nights or withdraw its payout; withdrawals are tracked per property.
- Payments settle all or nothing, and inventory and positions are reverted when settlement fails, so parallel requests cannot buy without paying or drain the pool.
- World ID subject and per action nullifier are kept apart.
- Session tokens are 256 bit random values stored only as SHA-256 hashes.
