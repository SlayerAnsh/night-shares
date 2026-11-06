import { DomainError } from "../../shared/errors/domain-error";
import type { IdGenerator } from "../ids/id-generator";
import type { MockWalletProvider } from "../wallet-provider/wallet-provider.mock";
import type { Onramp } from "./onramp";
export function createMockOnramp({
  ids,
  wallet,
}: {
  ids: IdGenerator;
  wallet: Pick<MockWalletProvider, "credit">;
}): Onramp {
  return {
    async chargeCard({ amount, address }) {
      if (amount <= 0n)
        throw new DomainError(
          "INVALID_ARGUMENT",
          "Card charge must be positive.",
        );
      wallet.credit(address, amount);
      return { chargeId: ids.next("charge") };
    },
  };
}
