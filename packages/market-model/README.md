# @night-shares/market-model

Pure TypeScript pricing, order book, deterministic night state and payout math for Night Shares. This ports `../mock/v2/assets/model.js`, SHA256 prefix `3099c47b5452`, and the required helpers from `shared.js`. Runtime code imports no catalog, browser state or wall clock. The source entry point is `src/index.ts`; no build is required.

## Public API

All scalar math arguments and results are `number` unless specified below. Core calculations retain the original floating point operation order.

```ts
price(F: number, k: number, S: number, q: number): number
cost(F: number, k: number, S: number, a: number, b: number): number
lastRoomPrice(F: number, k: number): number
recallStrike(F: number, k: number, m?: number): number
floorFromRate(usualRate: number): number
capOf(S: number, peak?: boolean): number
trancheOf(S: number): number
clampFair(pstar: number, usualRate: number): number
askFillProceeds(price: number, size?: number): { gross: number; fee: number; net: number }
lateFee(hoursLeft: number): number
unsoldRefund(ask: number | null | undefined, pstar: number): number
offlineSaleRefund(pstar: number): number
book(input: BookInput): Book
routeBuy(book: Book, amount: number, options?: { guest?: boolean }): BuyResult
nightPrice(property: RateProperty, date: string): number
nightState(input: NightStateInput): NightState
hostPayout(state: PayoutInput): {
  gross: number; availableNow: number; heldForTraders: number;
  bondHeld: number; bondTarget: number;
}
hash(value: string): number
rng(seed: number): () => number
parseDate(date: string): Date
diffDays(a: string, b: string): number
toMicros(usd: number): bigint
toTenths(roomNights: number): number
fromTenths(tenths: number): number
```

Constants: `FEE`, `HOST_FEE`, `PLATFORM_FEE`, `PRESETS`, `FLOOR_RATIO`, `RECALL_MARKUP`, `RECALL_MIN_MARKUP`, `GUEST_TRANCHE`, `CAP_PEAK`, `LATE_HOURS`, `LATE_MAX`, `BOND`, `PSTAR_BAND`, `PSTAR_MAX_MOVE_PER_HOUR`, `REFUND_AT_FAIR`, `SLICE`.

Types: `RateProperty`, `NightProperty`, `NightStateInput`, `NightState`, `PayoutInput`, `TraderAsk`, `PoolAsk`, `TraderLevel`, `Ask`, `Bid`, `BookInput`, `Book`, `Fill`, `BuyResult`.

`RateProperty` contains only `{ id, base, phase }`. `NightProperty` adds `rooms` and `roomTypes: { rateMultiplier: number }[]`. `NightStateInput` is `{ property, roomIndex, date, today }`. Both dates are valid `YYYY-MM-DD` calendar dates. Calendar arithmetic uses UTC fields to avoid depending on the process timezone. An out of range room index falls back to the first room type, but the supplied index still seeds randomness, matching the mock. Empty room types throw `TypeError`, as in the original.

`BookInput` requires `{ F, k, S, q }` and optionally accepts `{ tranche, traderAsks, levels, hoursLeft }`. Trader asks contain `{ price, size, who? }`. `PayoutInput` requires `{ F, k, S, q, held }`. Public interfaces are defined in the source modules and exported from the package entry point.

Convert only at system boundaries. `toMicros` rounds the decimal representation of a finite USD value to six decimals, with ties away from zero; nonfinite values throw `RangeError`. `toTenths` rounds room nights to the nearest integer tenth, with ties away from zero. `fromTenths` divides an integer quantity by ten. Core math performs neither conversion.

## Verification

From this directory, run `bun test` and `pnpm typecheck`. From the workspace root, run `pnpm check`.

Parity tests load the unmodified sibling mock files through `node:vm`, with a minimal `window` shim and a fixed zero argument `Date` constructor. Today is `2026-12-01`. Catalog fixtures come only from the VM. The grid covers all six properties, both room types and 60 dates from December 1 through January 29: 720 states, usual rates, books and payouts, 5,760 routes across four quantities and both buyer modes, 5,040 late fees and 5,040 refunds. Numeric tolerance is absolute `1e-9`; object keys, arrays and nonnumeric values must also match. Additional tests cover every constant, curve helpers, deterministic random streams and 12 distant date fallback states. Focused unit tests sit beside implementation files.

## Rules fixed in both mock and port

Guests never pay above the recall cap: routing stops at the first ask priced above it and fills the rest at the cap. Traders are not capped. Night heat is clamped to zero and one, so distant dates never show negative inventory. Rooms split exactly across room types (nine rooms over two types become five and four).

## Seller fees

`askFillProceeds` returns gross proceeds, the base fee and net proceeds for a fill (size defaults to one). Trader and recall fills carry `sellerFee` and `sellerNet`; pool fills omit these fields. `routeBuy` returns `sellerFees` and `sellerNet` totals, both zero when no sellers fill. Buyer charges are unchanged.

## Recall markup floor

`RECALL_MIN_MARKUP` is 0.05. `recallStrike` throws `RangeError("recall markup m must be at least 5%")` below this floor and accepts exactly 0.05. The default markup remains 0.25.

## Preserved source behavior

Past dates still report 14 hours remaining. Caps and guest tranches have a minimum of one, even for zero supply. The book assumes asks are sorted.

## Resynchronizing

Read the changed `model.js` and its dependencies in `shared.js`. Review formula changes, operation order, exported shapes and newly required property fields. Port each change into its corresponding small module without importing catalog data or introducing global time. Update focused tests for changed behavior. Run the VM parity suite against the new source, review every difference, then update the fingerprint assertion and this version note together. Keep the original mock files read only during this process.
