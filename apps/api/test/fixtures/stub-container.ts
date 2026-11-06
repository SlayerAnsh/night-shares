import { Code, ConnectError } from "@connectrpc/connect";
import { buildContainer } from "../../src/container/build-container";

// Keep infrastructure smoke tests stable as domain teams replace their handlers.
export function createStubContainer() {
  const container = buildContainer({
    port: 0,
    adapters: "mock",
    dbPath: ":memory:",
    clock: "mock",
    ids: "sequential",
    today: "2026-12-01",
  });
  for (const module of Object.values(container.modules)) {
    for (const method of module.service.methods) {
      Object.defineProperty(module.handler, method.localName, {
        configurable: true,
        value: () => {
          throw new ConnectError("not built yet", Code.Unimplemented);
        },
      });
    }
  }
  return container;
}
