import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import type * as Port from "../src/index";

export const TODAY = "2026-12-01";
export interface MockProperty {
  id: string;
  base: number;
  rooms: number;
  phase: number;
  rooms_types: { m: number }[];
}
interface Shared {
  props: MockProperty[];
  today: Date;
  parse: (date: string) => Date;
  nightPrice: (property: MockProperty, date: Date) => number;
  hash: typeof Port.hash;
  rng: typeof Port.rng;
}
type OriginalModel = Omit<typeof Port, "nightState"> & {
  nightState: (
    property: MockProperty,
    roomIndex: number,
    date: Date,
  ) => Port.NightState;
};
// shared.js is browser code; give it the few globals it reads at load time.
const context = createContext({
  window: {},
  navigator: { platform: "", userAgent: "" },
});
// Fix the zero-argument clock while retaining the original local calendar semantics.
runInContext(
  `Date = class extends Date {
  constructor(...args) {
    if (args.length === 0) super(2026, 11, 1, 12);
    else super(...args);
  }
  static now() { return new Date().getTime(); }
}`,
  context,
);
const root = new URL("../../../../mock/v2/assets/", import.meta.url);
const sharedSource = readFileSync(new URL("shared.js", root), "utf8");
const modelSource = readFileSync(new URL("model.js", root), "utf8");
runInContext(sharedSource, context, { filename: "shared.js" });
runInContext(modelSource, context, { filename: "model.js" });
export const shared = runInContext("window.NS", context) as Shared;
export const original = runInContext("window.NSM", context) as OriginalModel;
export const modelSha = createHash("sha256").update(modelSource).digest("hex");

export function propertyOf(p: MockProperty): Port.NightProperty {
  return {
    id: p.id,
    base: p.base,
    rooms: p.rooms,
    phase: p.phase,
    roomTypes: p.rooms_types.map((rt) => ({ rateMultiplier: rt.m })),
  };
}
