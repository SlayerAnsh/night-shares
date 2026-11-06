# @night-shares/market-model

Pure TypeScript pricing, order book, deterministic night state and payout math for Night Shares. This ports `../mock/v2/assets/model.js`, SHA256 prefix `fb6cebfd712e`, and the required helpers from `shared.js`. Runtime code imports no catalog, browser state or wall clock. The source entry point is `src/index.ts`; no build is required.

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
cutoffRefund(input: CutoffRefundInput): {
  avgBid: number; perNight: number; total: number; haircut: number;
}
offlineSaleRefund(pstar: number): number
book(input: BookInput): Book
routeBuy(book: Book, amount: number, options?: { guest?: boolean }): BuyResult
nightPrice(property: RateProperty, date: string): number
nightState(input: NightStateInput): NightState
hostPayout(state: PayoutInput): {
  gross: number; availableNow: number; heldForTraders: number;
}
hash(value: string): number
rng(seed: number): () => number
parseDate(date: string): Date
diffDays(a: string, b: string): number
toMicros(usd: number): bigint
toTenths(roomNights: number): number
fromTenths(tenths: number): number
```

Constants: `MAKER_REBATE`, `REBATE_BAND`, `FEE`, `HOST_FEE`, `PLATFORM_FEE`, `PRESETS`, `FLOOR_RATIO`, `RECALL_MARKUP`, `RECALL_MIN_MARKUP`, `GUEST_TRANCHE`, `CAP_PEAK`, `LATE_HOURS`, `LATE_MAX`, `COVER_FUND`, `PSTAR_BAND`, `PSTAR_MAX_MOVE_PER_HOUR`, `SLICE`.

Types: `RateProperty`, `NightProperty`, `NightStateInput`, `NightState`, `PayoutInput`, `CutoffRefundInput`, `TraderAsk`, `PoolAsk`, `TraderLevel`, `Ask`, `Bid`, `BookInput`, `Book`, `Fill`, `BuyResult`.

`RateProperty` contains only `{ id, base, phase }`. `NightProperty` adds `rooms` and `roomTypes: { rateMultiplier: number }[]`. `NightStateInput` is `{ property, roomIndex, date, today }`. Both dates are valid `YYYY-MM-DD` calendar dates. Calendar arithmetic uses UTC fields to avoid depending on the process timezone. An out of range room index falls back to the first room type, but the supplied index still seeds randomness, matching the mock. Empty room types throw `TypeError`, as in the original.

`BookInput` requires `{ F, k, S, q }` and optionally accepts `{ tranche, traderAsks, levels, hoursLeft }`. Trader asks contain `{ price, size, who? }`. `PayoutInput` and `CutoffRefundInput` require `{ F, k, S, q, held }`. `PayoutInput` also accepts an API extension, `cutoffPaid`, for settled cutoff refunds and rebate-pool haircuts. `hostPayout` deducts that amount from gross and available proceeds; absent values preserve source parity. Public interfaces are defined in the source modules and exported from the package entry point.

Convert only at system boundaries. `toMicros` rounds the decimal representation of a finite USD value to six decimals, with ties away from zero; nonfinite values throw `RangeError`. `toTenths` rounds room nights to the nearest integer tenth, with ties away from zero. `fromTenths` divides an integer quantity by ten. Core math performs neither conversion.

## Verification

From this directory, run `bun test` and `pnpm typecheck`. From the workspace root, run `pnpm check`.

Parity tests load the unmodified sibling mock files through `node:vm`, with a minimal `window` shim and a fixed zero argument `Date` constructor. Today is `2026-12-01`. Catalog fixtures come only from the VM. The grid covers all six properties, both room types and 60 dates from December 1 through January 29: 720 states, usual rates, books and payouts, 5,760 routes across four quantities and both buyer modes, 5,040 late fees, 720 cutoff refunds. Another 24 cutoff cases cover empty, negligible, fractional and fully held inventory across three curve slopes. Numeric tolerance is absolute `1e-9`; object keys, arrays and nonnumeric values must also match. Additional tests cover every constant, curve helpers, deterministic random streams and 12 distant date fallback states. Focused unit tests sit beside implementation files.

## Rules fixed in both mock and port

Guests never pay above the recall cap: routing stops at the first ask priced above it and fills the rest at the cap. Traders are not capped. Night heat is clamped to zero and one, so distant dates never show negative inventory. Rooms split exactly across room types (nine rooms over two types become five and four).

## Seller fees

`askFillProceeds` returns gross proceeds, the base fee and net proceeds for a fill (size defaults to one). Trader and recall fills carry `sellerFee` and `sellerNet`; pool fills omit these fields. `routeBuy` returns `sellerFees` and `sellerNet` totals, both zero when no sellers fill. Buyer charges are unchanged.

## Cutoff refunds

`cutoffRefund({ F, k, S, q, held })` redeems unsold holdings against their pool reserve `L = cost(F, k, S, q - held, q)`. It returns `avgBid = L / held`, `perNight = avgBid * (1 - LATE_MAX)`, `total = L * (1 - LATE_MAX)` and `haircut = L * LATE_MAX`. The 30% haircut transfers to the rebate pool, never the host. All fields are zero unless `held > 1e-9`, preserving the source guard.

For `F: 6000`, `k: 1.2`, `S: 15`, `q: 6` and `held: 4`, results rounded to cents are `avgBid: 8298.07`, `perNight: 5808.65`, `total: 23234.59` and `haircut: 9957.68`. Calculations remain unrounded internally.

The source exposes 35 exports. The legacy parked-ask refund and its constant have been removed. For `offlineSaleRefund`, callers pass the pool bid as `pstar`.

## Offline double sale cover

`offlineSaleCover({ pstar, reserveSlice = 0, pending = 0 })` pays the holder the fair price from the token reserve slice, then pending host payouts, then the cover fund. Remaining pending payouts pay a penalty of one fair price. `hostDebt` combines the fund advance and unpaid penalty; `hostTotal` is twice the fair price. The result includes `toHolder`, `fromReserve`, `fromPending`, `fromFund`, `penalty`, `penaltyFromPending`, `hostDebt` and `hostTotal`.

For `pstar: 16000`, `reserveSlice: 11000` and `pending: 3000`, the fund advances 2000 and host debt is 18000. `COVER_FUND` is 0.001 of trade notional, carved out of `PLATFORM_FEE`; total `FEE` remains 0.013. Host payouts hold only trader reserves. Parity tests cover 100 waterfall combinations, default balances and 12 payout edge cases.

## Recall markup floor

`RECALL_MIN_MARKUP` is 0.05. `recallStrike` throws `RangeError("recall markup m must be at least 5%")` below this floor and accepts exactly 0.05. The default markup remains 0.25.

## Preserved source behavior

Past dates still report 14 hours remaining. Caps and guest tranches have a minimum of one, even for zero supply. The book assumes asks are sorted.

## Resynchronizing

Read the changed `model.js` and its dependencies in `shared.js`. Review formula changes, operation order, exported shapes and newly required property fields. Port each change into its corresponding small module without importing catalog data or introducing global time. Update focused tests for changed behavior. Run the VM parity suite against the new source, review every difference, then update the fingerprint assertion and this version note together. Keep the original mock files read only during this process.

## Analytics

`priceHistory(modelId, roomIndex, date, state)` returns deterministic fair and market price series. `hostTrackRecord(property)` returns host performance in basis points. `nightAnalytics(state, book, history, modelId, date, hoursLeft, bookedBps)` returns estimated and annualized returns, risk score and level, volatility, sell-through, liquidity, daily change, exit value and refund.

These pure calculations originate in `mock/v2/assets/trade.js`, not `model.js`, and are outside the model.js parity suite. Focused unit tests cover them. API mappers convert USD to micros and map results into protobuf messages.


## Maker rebates

`makerRebate({ askPrice, poolPrice, size, poolBalance = Infinity })` pays 0.5% of ask notional when the ask is at or below 105% of the pool price. Payment is capped by the nonnegative pool balance. The API converts the result to micros and caps it against the exact ledger balance. Late sell-back fees above the base `FEE` fund this pool; the base fee keeps its existing cover fund and treasury split. Cutoff haircuts also fund this pool. `MakerRebateInput` describes the arguments.
