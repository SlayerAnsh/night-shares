import { expect, test } from "bun:test";
import { create } from "@bufbuild/protobuf";
import { createHandlerContext } from "@connectrpc/connect";
import {
  CatalogService,
  GetPropertyRequestSchema,
} from "@night-shares/proto/catalog/v1/catalog_pb";
import {
  GetPriceCalendarRequestSchema,
  StayService,
} from "@night-shares/proto/stay/v1/stay_pb";
import { buildContainer } from "../../container/build-container";
import { createCatalogModule } from "../catalog/module";
import { createStayModule } from "./module";

test("property detail and calendar expose chain mode before the first quote", async () => {
  for (const chain of [false, true]) {
    const { ports } = buildContainer({
      port: 0,
      adapters: "mock",
      dbPath: ":memory:",
      today: "2026-12-01",
    });
    if (chain)
      ports.chainExecutor = { mode: "fork" } as NonNullable<
        typeof ports.chainExecutor
      >;
    const catalog = createCatalogModule(ports).handler;
    const property = await catalog.getProperty(
      create(GetPropertyRequestSchema, { propertyId: "prop_velana" }),
      createHandlerContext({
        service: CatalogService,
        method: CatalogService.method.getProperty,
        protocolName: "connect",
        requestMethod: "POST",
        url: "http://localhost",
      }),
    );
    expect(property.onChain).toBe(chain);
    const stay = createStayModule(ports).handler;
    const pending = stay.getPriceCalendar(
      create(GetPriceCalendarRequestSchema, {
        propertyId: "prop_velana",
        roomTypeId: "rt_velana_0",
        startDate: "2026-12-01",
        endDate: "2026-12-02",
      }),
      createHandlerContext({
        service: StayService,
        method: StayService.method.getPriceCalendar,
        protocolName: "connect",
        requestMethod: "POST",
        url: "http://localhost",
      }),
    );
    if (chain)
      await expect(Promise.resolve(pending)).rejects.toThrow(
        "Chain market custody and deployment must be configured.",
      );
    else expect((await pending).onChain).toBe(false);
    ports.db.close();
  }
});
