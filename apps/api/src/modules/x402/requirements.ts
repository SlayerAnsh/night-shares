import { type Address, type Hex, keccak256, stringToHex } from "viem";
import type { ArcDeployment } from "../../ports/arc-deployment/arc-deployment";
import {
  soliditySeconds,
  tokenTenths,
} from "../../ports/chain-executor/chain-executor";
import type { ChainReader } from "../../ports/chain-reader/chain-reader";
import type { Clock } from "../../ports/clock/clock";
import { DomainError } from "../../shared/errors/domain-error";
import { parse } from "../../shared/night-key";
import type { ChainBuyQuote } from "./chain-quote";
import type { PaymentRequirements, X402Terms } from "./codec";

// Task 8 will add these deployment fields to ArcDeployment itself.
export type RequirementsDeps = {
  deployment: Pick<ArcDeployment, "chainId" | "USDC"> & {
    X402Settler: Address;
    USDC_EIP712: { name: string; version: string };
  };
  reader: Pick<ChainReader, "tokenOf">;
  clock: Pick<Clock, "now">;
  salt(): Hex;
  quoteBuy(nightKey: string, tenths: number): Promise<ChainBuyQuote>;
};
type Request = { nightKey: string; tenths: number };
function terms(
  deps: RequirementsDeps,
  req: Request,
  side: X402Terms["side"],
): X402Terms {
  parse(req.nightKey);
  if (!Number.isSafeInteger(req.tenths) || req.tenths <= 0)
    throw new DomainError(
      "INVALID_ARGUMENT",
      "Quantity must be positive integer tenths.",
    );
  const salt = deps.salt();
  if (!/^0x[0-9a-fA-F]{64}$/.test(salt))
    throw new DomainError("INVALID_ARGUMENT", "Salt must contain 32 bytes.");
  return {
    side,
    night: keccak256(stringToHex(req.nightKey)),
    qty: tokenTenths(req.tenths).toString(),
    deadline: (soliditySeconds(deps.clock.now()) + 120n).toString(),
    salt,
  };
}
function requirement(
  deps: RequirementsDeps,
  trade: X402Terms,
  asset: Address,
  amount: bigint,
  domain: { name: string; version: string },
): PaymentRequirements {
  return {
    scheme: "exact",
    network: `eip155:${deps.deployment.chainId}`,
    maxAmountRequired: amount.toString(),
    asset,
    payTo: deps.deployment.X402Settler,
    resource: `/x402/${trade.side}`,
    description: `${trade.side === "buy" ? "Buy" : "Sell"} room nights`,
    mimeType: "application/json",
    maxTimeoutSeconds: 120,
    extra: { ...domain, terms: trade },
  };
}
export async function buyRequirements(
  deps: RequirementsDeps,
  req: Request & { maxTotal: bigint },
): Promise<PaymentRequirements> {
  const trade = terms(deps, req, "buy");
  if (req.maxTotal < 0n)
    throw new DomainError(
      "INVALID_ARGUMENT",
      "Maximum total must be nonnegative.",
    );
  const quote = await deps.quoteBuy(req.nightKey, req.tenths);
  if (quote.fills !== req.tenths)
    throw new DomainError("FAILED_PRECONDITION", "Sold out");
  const amount = quote.total + BigInt(req.tenths);
  if (amount > req.maxTotal)
    throw Object.assign(
      new DomainError("FAILED_PRECONDITION", "Price above your maximum"),
      { status: 409, reason: "Price above your maximum" },
    );
  return requirement(
    deps,
    trade,
    deps.deployment.USDC,
    amount,
    deps.deployment.USDC_EIP712,
  );
}
export async function sellRequirements(
  deps: RequirementsDeps,
  req: Request & { minProceeds: bigint },
): Promise<PaymentRequirements> {
  const trade = terms(deps, req, "sell");
  if (req.minProceeds < 0n)
    throw new DomainError(
      "INVALID_ARGUMENT",
      "Minimum proceeds must be nonnegative.",
    );
  trade.minReceived = req.minProceeds.toString();
  return requirement(
    deps,
    trade,
    await deps.reader.tokenOf(trade.night),
    BigInt(trade.qty),
    { name: "NightShares Room Night", version: "1" },
  );
}
