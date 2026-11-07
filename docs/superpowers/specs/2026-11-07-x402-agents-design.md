# Autonomous trading agents paid through x402: design

Status: draft for review, 2026-11-07. Source conversation: product owner with the mock coordinator session. Where this document and `app/SPECS.md` disagree, this document describes the intended change and SPECS must be updated when it is built.

## 1. Intent

Traders on Night Shares should not have to watch markets. A trader creates one or more agents, gives each a budget and limits, and the agents trade constantly on their own for arbitrage and profit. Every agent trade is paid through x402 on Arc: buys pay USDC, sells pay room night tokens, and the other side comes back in the same transaction.

An AI model is the strategist, not the trigger finger. It reads the market every few minutes and writes the agent's strategy as structured settings with a one line reason. Plain code executes that strategy continuously.

The model is called through an OpenAI compatible client. The prototype uses Claude with the product owner's Anthropic key. Later the same client points at 0G Private Computer (OpenAI compatible API) with no code change.

## 2. Goals

1. A user can create, edit, pause, resume and retire any number of agents. Templates (Buy the dip, Long dated, Holiday momentum) prefill settings; Custom takes a plain language description that the model turns into settings, which the user confirms before deploying.
2. Each agent explores the markets (all open nights it is allowed to see: discovery, books, fair prices, history) and trades within its limits without asking the user, around the clock.
3. Every agent buy and sell is an x402 paid HTTP request that settles atomically on chain.
4. Every agent buy over 10 USDC on mainnet (100 USDC on the anvil fork and testnet) needs a fresh World ID check (Agent Pass) before it executes.
5. The model provider is swappable by configuration (base URL, key, model name).

## 3. Anti goals (failure even if it works)

1. **Stuck funds.** No path may leave USDC or room night tokens unreachable by the user: not in a settler, not in an agent wallet whose key is lost, not behind a paused agent. The user can always pause an agent and withdraw everything to their own wallet in one action, including while the protocol pause is on (exits stay open, matching SPECS).
2. **An agent that cannot trade within its limits.** If budget, cap and approvals allow a trade, it must happen. An agent that sits idle because of plumbing (stale strategy, failed model call, stuck approval, nonce clash) is a failure. Failures must surface to the user with a reason.
3. **An agent that cannot explore.** Agents must see the whole allowed market, not a fixed shortlist.
4. A model answer that spends past limits. The model can never place or size a trade directly.

## 4. Non goals

1. Agents that trade for other users or accept outside capital.
2. Copy trading, agent leaderboards, shared strategies.
3. Outside agents (not created on Night Shares) using the x402 endpoints. The endpoints should not prevent it, but it is not built or demoed.
4. Paying the model provider through x402.

## 5. Decided by the product owner

1. Agents trade constantly for arbitrage and profit instead of the user.
2. Trades are paid through x402. Buys pay USDC. Sells pay room night tokens through x402 as well.
3. Each agent buy over the threshold needs a fresh World ID check. No approve once budgets. Sells never need the check (see 6.6 for the reason).
4. The model sets strategy; code executes trades.
5. Built in the real backend and contracts (`app/`), not as a mock side prototype.
6. Users can create new agents.
7. Model: OpenAI compatible SDK; Anthropic key for the proof of concept, 0G Private Computer later.

8. Chain: real transactions on an anvil fork of Arc mainnet (real `PoolManager` and Permit2, etched USDC with EIP-3009) until everything works end to end, then move to Arc mainnet. No mock ledger for agent trades. This brings the chain adapter, contract deploys and settlement reconciliation (SPECS notes an outbox is needed before the atomic mock path can be replaced) into scope.

9. No simulated human trading (2026-11-07). Human trades also execute on chain from the user's Privy wallet. Every agent wallet is linked to its owner's World ID `humanId`, so the owner's total holdings (own wallet plus all agents) count toward one 30% cap, read from `NightToken.humanBalance(humanId)`.

## 6. How it works

### 6.1 Agent lifecycle

1. **Create.** Trade app "Deploy an agent": pick a template or Custom, review settings, set budget, confirm with World ID (Orb session). The backend creates the agent record, its wallet (6.4) and its first strategy.
2. **Fund.** The user moves USDC from their wallet to the agent wallet. Agent holdings of room nights stay in the agent wallet and count toward the user's 30% per human cap (the agent wallet is linked to the user's `humanId` in `HumanRegistry`).
3. **Run.** Strategist and executor loops run (6.2, 6.3).
4. **Pause / resume / edit.** Pausing stops the executor immediately; open approvals are cancelled.
5. **Retire / withdraw.** Pauses the agent, then moves all USDC and all room night tokens from the agent wallet to the user's wallet. Must work for any agent state.

### 6.2 Strategist (model)

* Runs every N minutes per agent (default 5) and on demand after a user edit.
* Input: the agent's settings and limits, a market snapshot (fair price, pool price, best ask and bid, recent fills, release time, holdings, P&L), and its recent trade log.
* Output: JSON matching a fixed schema (entry rules, exit rules, per night size limits, allowed hotels and nights, on/off per market) plus a one sentence reason shown to the user. Validated against the schema and clamped to the user's limits. Invalid output is rejected; the previous valid strategy stays in force.
* Every call is logged with provider, model, request id, input hash and output. With 0G these request ids are the evidence 0G asks for.
* Provider config: `AGENT_LLM_BASE_URL`, `AGENT_LLM_API_KEY`, `AGENT_LLM_MODEL`. Prototype: Anthropic through an OpenAI compatible endpoint. Later: `https://pc.0g.ai`.

### 6.3 Executor (code)

* Continuous loop per agent over the markets its strategy allows. Finds trades that match the strategy (examples: ask below fair by the strategy's margin, sell back above take profit, exit before release).
* Before every trade checks: agent paused flag, agent budget, per order size, the user's 30% per human cap across all wallets, and the approval rule (6.6). Sizes trades to fit.
* Places trades only through the x402 endpoints (6.5), as an ordinary x402 client signing with the agent wallet key.
* Records every attempt and result with a reason. Retries transient failures with backoff; never retries a trade that reverted for a limit.

### 6.4 Agent wallets and keys

* One wallet per agent, created through the existing `WalletCustody` port (Privy server wallets in production, anvil keys on the fork), which already signs EIP-712 typed data and so can sign EIP-3009 authorizations. No new raw key store (coordinator's call: avoids key loss, anti goal 1). Keys never reach the browser.
* This replaces the single per user agent ledger in SPECS (`agent:<userWallet>`). Existing agent RPCs gain an `agent_id`; existing mock balances migrate to a default agent per user. Holdings sit in each agent wallet and still count in the user's shared human position for the cap, portfolio attribution and cutoff refunds (refunds land in the agent wallet and are swept with its USDC on withdraw).
* Linked to the user's `humanId` in `HumanRegistry` at creation (attester signed, as for other wallets).
* Withdraw is always available to the user's own wallet (anti goal 1). After cutoff, room nights cannot move but their cutoff refund arrives as USDC in the agent wallet and withdraws with it. Gas: Arc gas is paid in USDC, so the facilitator (6.5) pays it; the agent wallet needs no gas.
* Later option, out of scope: a smart account with a session key limited to the settler.

### 6.5 x402 trade endpoints and settlement

`NightToken` is an ERC-20 per night (SPECS contract table), so both legs can use the standard x402 `exact` scheme if `NightToken` supports EIP-3009 `transferWithAuthorization`. Arc USDC already supports it.

**Buy:** `POST /x402/buy {night, size, maxTotal}`

1. Server quotes the route (pool plus trader asks, cheapest first, as `routeBuy`) and replies `402` with payment requirements: asset USDC, amount = quoted total including fee (capped by `maxTotal`), `payTo` = `X402Settler`, short validity.
2. Agent signs the EIP-3009 authorization and retries with the `X-PAYMENT` header.
3. Our facilitator calls `X402Settler.buy(auth, sig, night, size, minOut)`. In one transaction the settler calls `USDC.transferWithAuthorization` to pull the payment to itself, buys through `TradeRouter`, sends the room night tokens to the agent wallet and refunds any unused USDC to the agent wallet.
4. If anything fails (price moved, cap, sold out, paused), the transaction reverts and the payment never happens. Server replies `200` with tx hash and fill, or an error with the reason.

**Sell:** `POST /x402/sell {night, size, minProceeds}`

1. Server replies `402` with asset = that night's `NightToken`, amount = size, `payTo` = `X402Settler`.
2. Agent signs the token's EIP-3009 authorization.
3. Facilitator calls `X402Settler.sell(...)`: pulls the tokens, sells them back to the pool through `TradeRouter` (there are no bid orders; the bid is the pool sell-back), sends USDC (after fee and any late fee) to the agent wallet. Reverts below `minProceeds`.

**Rules for the settler (coordinator's calls after builder review):**

* Balance checks are per call deltas, not absolute balances, so a donation cannot brick the settler.
* Front run safety: anyone can submit a signed `transferWithAuthorization` directly to USDC or `NightToken`, which would move the payment to the settler without a trade. `NightToken` closes this for sells: it rejects an authorized transfer to the settler unless the settler itself submits it. For USDC the settler has no refund function (revised 2026-11-07). A `refundUnused` that checked `authorizationState` plus a fresh signature was proven unsafe in testing: the signer can re-sign the same used nonce with a larger value and take other payers' pending refunds. Accepted limitation: a USDC authorization front run straight to USDC lands in the settler and is not recoverable. The settler stays usable after such a transfer, and the facilitator only broadcasts authorizations inside settler `buy`/`sell`. This keeps standard x402 `exact` clients compatible. No admin withdraw function.
* Identity, cap and fees follow the agent wallet, not the settler. `TradeRouter` gains `buyFor(recipient, ...)` and `sellFor(owner, ...)`, callable only by the settler, which run the existing Orb check, per human cap, `NightHook` identity check and host fee split against the agent wallet (so a host's agent still sends its 1% to the rebate pool). `NightToken` lists the settler as a pass through in its excluded set.
* Not pausable on exit paths.

**Facilitator:** our own, inside `apps/api`, because Circle's hosted facilitator only transfers to `payTo` and cannot run the trade. It pays Arc gas in USDC from an operator wallet.

**Contract changes needed:** `NightToken` gains EIP-3009 `transferWithAuthorization` (per token, single use nonce, validAfter and validBefore) and `authorizationState`. New `X402Settler`. `TradeRouter` gains settler only `buyFor` and `sellFor`. `NightToken` allows transfers between two wallets of the same `humanId` while paused, so agent withdrawals of room nights stay open (anti goal 1). The `Deployment` struct gains the settler address, so factory, token, hook and routers are redeployed (only the fork deployment exists today; confirm no live mainnet nights first). All changes go through the existing contract review. The existing signed order flow in `TradeRouter` stays for human traders. The fork's etched MockUSDC needs EIP-3009 added for end to end runs.

### 6.6 Approvals (Agent Pass)

* Threshold: 10 USDC on mainnet, 100 USDC on the anvil fork and testnet (product owner decision 2026-11-07; mainnet is lower because mainnet volume is smaller). SPECS still says 1,000 and must be updated.
* Only buys are checked. **Sells never need a World ID check, by design:** a sell only turns room nights back into USDC in the agent's own wallet, so it cannot spend the user's money, and holding an exit for approval would trap funds (anti goal 1), stop an agent exiting within its limits (anti goal 2), and can push a sale past the late sell-back fee window, costing the user up to 30%. This reason must appear in the code comment at the executor's approval check, in SPECS, in the README and in the pitch.
* A buy over the threshold is held: the executor creates a pending order, the user gets a request in the Trade app, approves with a fresh World ID check (existing `StartAgentCheckpoint` flow), and only then does the executor send the x402 request. Denied, expired or cancelled means it never executes.
* No rolling window (product owner decision 2026-11-07): the check applies to each buy on its own. A rolling hour would trigger the check almost every hour, since one full position on one mainnet night costs 7 to 17 USDC, and agents could not trade constantly. Splitting is bounded by the agent budget and the 30% per human cap.
* Note: on mainnet one night's 30% cap costs about 7 to 17 USDC (pool at most 50 USDC), so most agent trades stay under the threshold and run freely; the check fires on larger moves.

### 6.7 What the user sees (Trade app)

* Portfolio "Agent strategies" section (already in the mock) shows each agent's status, current strategy with the model's one line reason, budget used, value, P&L, trades, and pause/resume.
* Agent detail: strategy history (each model update and why), trade log with x402 tx hashes, pending approvals, withdraw.
* Errors shown in plain words (for example "Paused: budget used up", "Waiting for your approval", "Model unavailable, using last strategy").

## 7. Constraints

* Arc mainnet safety limits from SPECS stay: `MAX_F` 1 USDC, `MAX_POOL` 50 USDC, `MAX_S` 100, `MAX_OPEN_NIGHTS` 20. Do not raise them for agents.
* 30% per human cap across all of a human's wallets, agent wallets included.
* Fee rules unchanged: 1.3% per trade (host 1%, treasury 0.2%, cover fund 0.1%); late sell-back fee to the rebate pool; a host's own trades send its 1% to the rebate pool.
* Protocol pause blocks entries and swaps but never withdrawals from agent wallets.
* No secrets in URLs or the browser; model key and agent keys server side only.

## 8. Ownership and coordination

* Contracts (`NightToken` EIP-3009, `X402Settler`): night-shares-28 (design) and night-shares-97 (backend) agree the change; contract review as usual.
* Backend (`apps/api`: agent service, strategist, executor, wallets, facilitator, x402 endpoints, proto changes): night-shares-97.
* Trade UI (`apps/web`) and the mock (`mock/v2`): the mock coordinator session for the mock; web per existing ownership.
* `market-model` and `mock/v2/assets/model.js` parity rules apply to any pricing change (none expected).

## 9. Left to the builder

* Exact strategy JSON schema (must cover the three templates and Custom).
* Strategist interval, executor polling vs event driven, retry and backoff values.
* Key encryption mechanism and storage layout.
* Facilitator internals (queueing, nonce management for the operator wallet).
* x402 library choice and version.
* Where the market snapshot for the model comes from (existing market RPCs are fine).

## 10. Open questions

None for the product owner. Builder check done 2026-11-07; its findings are folded into 6.4 to 6.6 and section 8 of decisions.
