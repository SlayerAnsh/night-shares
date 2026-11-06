# Night Shares API contracts

Protobuf is the source of truth for six services and 43 RPCs. Sources live in `proto/night_shares`. Every RPC declares its public, Device or Orb access requirement through `night_shares.auth.v1.access`.

Money uses `Usdc.micros` (signed int64, generated as TypeScript bigint). Room night quantities use `RoomNights.tenths`, where 10 means one room night. Dates and date ranges use `YYYY-MM-DD` in the property's local calendar, with checkout and range ends exclusive. Month filters use `YYYY-MM`. Instants use `google.protobuf.Timestamp`. Fields ending in `bps` use integer basis points, where 10,000 means 100 percent. Room rate multipliers and review ratings are dimensionless numbers.

Guest names and emails occur only in the booking request for forwarding to the hotel. They are absent from users, trips and receipts. Verification tokens must be bound to the action by the API implementation.

## Regenerate and validate

From the workspace root, run:

```sh
pnpm install
pnpm gen
pnpm --filter @night-shares/proto typecheck
pnpm check
```

From this package, run `buf lint` and `buf format --diff --exit-code`. Generation requires Buf in PATH and network access to the pinned remote OpenAPI plugin. When the default Buf cache is not writable, set `BUF_CACHE_DIR` to a writable directory. Installations in restricted environments may also need a writable npm cache and pnpm store.

Generated TypeScript and OpenAPI files are checked in under `gen`. Consumers need no Buf installation. Do not edit generated files. The generator replaces its output directories on each run. Generated files retain upstream formatting and can exceed the authored file size limit. Biome excludes generated output. Supporting proto messages are split into small feature files alongside the service files.

## Public imports

The package exports TypeScript source for Bun and bundler consumers. ESM relative imports follow each generator's default conventions. No build step or handwritten client types are required. Import schemas and service descriptors from these exact modules:

```text
@night-shares/proto/identity/v1/identity_pb
@night-shares/proto/catalog/v1/catalog_pb
@night-shares/proto/stay/v1/stay_pb
@night-shares/proto/market/v1/market_pb
@night-shares/proto/host/v1/host_pb
@night-shares/proto/wallet/v1/wallet_pb
```

Connect Query method helpers use these exact modules. Install `@connectrpc/connect-query` in the consuming React app to use its hooks with these descriptors.

```text
@night-shares/proto/identity/v1/identity-IdentityService_connectquery
@night-shares/proto/catalog/v1/catalog-CatalogService_connectquery
@night-shares/proto/stay/v1/stay-StayService_connectquery
@night-shares/proto/market/v1/market-MarketService_connectquery
@night-shares/proto/host/v1/host-HostService_connectquery
@night-shares/proto/wallet/v1/wallet-WalletService_connectquery
```

Supporting schemas, enum values and the access extension are exported from:

```text
@night-shares/proto/auth/v1/access_pb
@night-shares/proto/common/v1/money_pb
@night-shares/proto/common/v1/night_pb
@night-shares/proto/identity/v1/user_pb
@night-shares/proto/catalog/v1/property_pb
@night-shares/proto/stay/v1/trip_pb
@night-shares/proto/market/v1/book_pb
@night-shares/proto/market/v1/analytics_pb
@night-shares/proto/market/v1/portfolio_pb
@night-shares/proto/host/v1/opening_pb
@night-shares/proto/host/v1/hotel_pb
@night-shares/proto/wallet/v1/transaction_pb
```

```ts
import { create } from "@bufbuild/protobuf";
import { createClient } from "@connectrpc/connect";
import { MarketService, GetBookRequestSchema } from "@night-shares/proto/market/v1/market_pb";
import { getBook } from "@night-shares/proto/market/v1/market-MarketService_connectquery";

// Supply a Connect transport from the consuming application.
const client = createClient(MarketService, transport);
const request = create(GetBookRequestSchema, {
  night: { propertyId: "prop_velana", roomTypeId: "rt_ocean", date: "2026-12-24" },
});
await client.getBook(request);
// In a React component: useQuery(getBook, request).
```

## OpenAPI

`gen/openapi` contains exactly six OpenAPI 3.1 documents: `identity.openapi.yaml`, `catalog.openapi.yaml`, `stay.openapi.yaml`, `market.openapi.yaml`, `host.openapi.yaml` and `wallet.openapi.yaml`. Each remote plugin invocation selects one service and trims unused schemas. Documents are self contained and describe Connect HTTP requests. The custom access option is enforced by the server interceptor, not by OpenAPI security declarations.

See the [OpenAPI generator options](https://github.com/sudorandom/protoc-gen-connect-openapi#options) for service filtering and output paths.
