import { randomBytes } from "node:crypto";
import type { IdGenerator } from "./id-generator";
export function createRandomIdGenerator(): IdGenerator {
  return { next: (prefix) => `${prefix}_${randomBytes(16).toString("hex")}` };
}
