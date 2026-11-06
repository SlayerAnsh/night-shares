import { clampFair, price } from "../curve";
import type { NightState } from "../night/night-state";
import { hash } from "../random/hash";
import { rng } from "../random/rng";
export function priceHistory(
  modelId: string,
  roomIndex: number,
  date: string,
  state: NightState,
) {
  const random = rng(hash(`h${modelId}|${roomIndex}|${date}`));
  const fair = [state.pstar],
    market = [price(state.F, state.k, state.S, state.q)];
  for (let i = 1; i < 31; i++) {
    fair.unshift(
      clampFair(
        (fair[0] ?? state.pstar) * (1 + (random() - 0.55) * 0.05),
        state.usualRate,
      ),
    );
    market.unshift((market[0] ?? state.pstar) * (1 + (random() - 0.55) * 0.06));
  }
  return { fair, market };
}
