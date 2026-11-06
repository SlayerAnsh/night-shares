import type { ConnectRouter } from "@connectrpc/connect";
import type { Container } from "../container/build-container";
export function registerRoutes(
  router: ConnectRouter,
  modules: Container["modules"],
): void {
  router.service(modules.identity.service, modules.identity.handler);
  router.service(modules.catalog.service, modules.catalog.handler);
  router.service(modules.stay.service, modules.stay.handler);
  router.service(modules.market.service, modules.market.handler);
  router.service(modules.host.service, modules.host.handler);
  router.service(modules.wallet.service, modules.wallet.handler);
}
