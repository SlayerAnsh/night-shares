# Changelog

All notable changes to this monorepo. Newest first.

## Unreleased

### Added

- API server skeleton (`apps/api`): Bun with Connect, auth by per RPC access option, Swagger UI at `/docs`, mock adapters for every external system, shared night inventory, stub handlers for all six services.
- Service contracts (`packages/proto`): identity, catalog, stay, market, host and wallet, 43 RPCs, with generated TypeScript, Connect Query helpers and OpenAPI 3.1.
- Market model (`packages/market-model`): TypeScript port of the mock pricing model with parity tests against the original.
- Design tokens (`packages/design-system`) from the mock v2 styles, light and dark.
- Coding standards and platform spec.

### Changed

- Market model, in both mock and port: guests never pay above the recall cap, distant nights never show negative inventory, rooms split exactly across room types, trader ask and recall fills charge the seller fee, and recall markups below 5% are rejected.

### Security

- Session tokens are 256 bit random values stored only as SHA-256 hashes.
