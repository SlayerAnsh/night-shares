import { timestampFromMs } from "@bufbuild/protobuf/wkt";
import type { QuoteLock } from "../repo/stay-repo";
export const lockToProto = (lock: QuoteLock) => ({
  lockId: lock.id,
  expiresAt: timestampFromMs(lock.expiresAt),
});
