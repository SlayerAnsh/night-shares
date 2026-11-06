import type { Ports } from "../../../container/ports";
import type { OrderSigner } from "../../../ports/order-signer/order-signer";
import { createMockOrderSigner } from "../../../ports/order-signer/order-signer.mock";
import { defaultDomain, type OrderDomain } from "./typed-data";
export type OrderSettings = {
  domain: OrderDomain;
  signer: OrderSigner;
  custodial: boolean;
};
const settings = new WeakMap<Ports, OrderSettings>();
export function configureOrders(ports: Ports, value: OrderSettings) {
  settings.set(ports, value);
}
export function orderSettings(ports: Ports): OrderSettings {
  return (
    settings.get(ports) ?? {
      domain: defaultDomain,
      signer: createMockOrderSigner(),
      custodial: true,
    }
  );
}
