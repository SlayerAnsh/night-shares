# Coding standards

These rules apply to every package and app in this monorepo. When a rule and convenience disagree, the rule wins. When a rule makes code harder to read, raise it and change the rule here.

## Principles

1. **Simple first.** Write the plainest code that works. No abstraction until a second caller needs it. No speculative options, flags or generics.
2. **Small files, one job.** A file holds one concept: one use case, one adapter, one mapper, one component. Soft limit 150 lines, hard limit 250. Split before you hit it.
3. **Group by feature, then by role.** Folders are named after the domain (`market`, `stay`), and inside them by role (`use-cases`, `ports`, `adapters`). Nest a subfolder as soon as three or more files share a theme.
4. **Ports and adapters.** Business logic depends on interfaces (ports), never on a vendor SDK, HTTP client, database or `Date.now()`. Every port ships with a mock adapter first. Real adapters replace mocks one at a time behind the same port.
5. **Contracts first.** The `.proto` files are the source of truth for every API shape. Change the proto, regenerate, then change code. Never hand-write a type that the generator already produces.
6. **Pure where possible.** Pricing and market math are pure functions in `packages/market-model`. Services orchestrate, they do not calculate.

## Language and tooling

- TypeScript everywhere, `strict: true`, `noUncheckedIndexedAccess: true`. No `any`. Use `unknown` and narrow.
- ESM only. Relative imports inside a package, workspace names (`@night-shares/*`) across packages.
- Biome formats and lints. Run `pnpm check` before handing off work.
- Tests use `bun test`. Unit tests sit next to the file (`buy.ts`, `buy.test.ts`). End to end tests live in `apps/api/test/e2e`.
- Dependencies: add one only when it removes real code. Prefer the platform (Bun, Web APIs) over a library.

## Naming

- Files and folders: `kebab-case.ts`. React components: `PascalCase.tsx`.
- Functions: verbs (`quoteStay`, `placeBuy`). Factories: `createXxx` (`createMarketService`).
- Ports: noun for what they provide (`WalletProvider`, `IdentityVerifier`, `Clock`).
- Adapters: `<port>.<impl>.ts`, for example `wallet-provider.mock.ts`, `wallet-provider.arc.ts`.
- Booleans read as questions: `isOrb`, `hasCapacity`.
- Domain words match the product: night, room night, ask, fair price, recall cap, guest tranche, release, payout. Do not invent synonyms.

## Shape of code

- Prefer functions and plain objects. Use a factory that closes over its dependencies instead of a class:

  ```ts
  export function createQuoteStay(deps: { catalog: CatalogRepo; clock: Clock }) {
    return async function quoteStay(input: QuoteStayInput): Promise<StayQuote> { ... };
  }
  ```

- Inject dependencies through one `deps` object. No global singletons except the composition root.
- One public export per file where practical. `index.ts` only at a package root to define its public API. No barrel files inside apps.
- Early returns over nested `if`. No function longer than about 40 lines.
- Comments explain why, not what. A business rule gets one line naming it (for example "guests can always book up to the recall cap").

## Data rules

- **Money** is `bigint` micro USDC (6 decimals, same as the chain) at every boundary: proto, storage, ledger. Floating point is allowed only inside `market-model` math and is rounded to micros when it leaves.
- **Quantity** of room nights is an integer count of tenths (`tenths`), matching the 0.1 book slice. 1 room night is `10`.
- **Nights** are ISO dates `YYYY-MM-DD` in the property's local calendar. **Instants** are `google.protobuf.Timestamp` in protos and epoch milliseconds inside code.
- **Ids** are stable strings with a prefix: `prop_`, `rt_`, `bk_`, `ord_`, `usr_`. A night key is `<propertyId>:<roomTypeId>:<date>`.
- Time always comes from the `Clock` port. Ids always come from the `IdGenerator` port. Both make tests deterministic.

## Errors

- Use cases throw `DomainError` with a code (`NOT_FOUND`, `INVALID_ARGUMENT`, `FAILED_PRECONDITION`, `PERMISSION_DENIED`, `UNAUTHENTICATED`, `RESOURCE_EXHAUSTED`) and a plain English message a user could read.
- Handlers never build errors by hand. One mapper turns `DomainError` into `ConnectError`.
- Never swallow an error. Never log and rethrow the same error.

## API layer (Connect)

- Handlers are thin: map request to use case input, call the use case, map the result to the response. No business logic in a handler.
- Every RPC declares its auth level in the proto with the `night_shares.auth.v1.access` option (`PUBLIC`, `DEVICE`, `ORB`). One interceptor enforces it. Handlers do not check auth.
- Mappers between proto messages and domain types live in `mappers/` beside the handler.

## Tests

- Every use case has a unit test with mock adapters.
- Every RPC is covered by an end to end test that calls the running server through the generated client.
- Tests read like the product: "guest books two nights when hotel price is cheapest".
- No sleeps. Drive time with the mock `Clock`.

## Docs

- Each package has a short `README.md`: what it is, its public API, how to run it.
- Root docs: `SPECS.md` (what the system does), `DEVELOPER.md` (how to work on it), `CHANGELOG.md` (what changed).
- No dashes as sentence punctuation in docs. Use periods, commas or parentheses.
