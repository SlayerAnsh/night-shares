import type { Address } from "viem";
import type { Ports } from "../../../container/ports";
import type { User } from "../../../ports/sessions/session-store";
import { chainMarket, nightHash } from "../../market/chain/runtime";
/** Backed contract credits are distinct from cash and cutoff entitlements. */
export async function chainCredits(ports: Ports, user: User) {
  const { reader, deployment } = chainMarket(ports);
  const head = await reader.head();
  const recipient = user.walletAddress as Address;
  const credits: {
    contractAddress: string;
    recipient: string;
    amount: { micros: bigint };
  }[] = [];
  for (const name of ["NightHook", "Settlement", "NightVault"] as const) {
    const amount = (
      await reader.read<bigint>(
        { contract: name, functionName: "credits", args: [recipient] },
        head.number,
      )
    ).value;
    if (amount)
      credits.push({
        contractAddress: deployment[name],
        recipient,
        amount: { micros: amount },
      });
  }
  for (const record of ports.inventory.list()) {
    const night = nightHash(record.key);
    const token = (
      await reader.read<Address>(
        { contract: "NightFactory", functionName: "tokenOf", args: [night] },
        head.number,
      )
    ).value;
    if (/^0x0{40}$/i.test(token)) continue;
    const amount = (
      await reader.read<bigint>(
        {
          contract: "NightToken",
          night,
          functionName: "credits",
          args: [recipient],
        },
        head.number,
      )
    ).value;
    if (amount)
      credits.push({
        contractAddress: token,
        recipient,
        amount: { micros: amount },
      });
  }
  return credits;
}
