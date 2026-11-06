import { create } from "@bufbuild/protobuf";
import {
  DemandPreset,
  OpenNightsSelectionSchema,
  ReleasePolicy,
} from "@night-shares/proto/host/v1/opening_pb";
import { buildContainer } from "../../../container/build-container";
import { mockSubjectFor } from "../../../ports/identity-verifier/identity-verifier.mock";
import { createMemoryHostRepo } from "../repo/host-repo.memory";
import { createHostUseCases } from "./create-host-use-cases";
export function fixture() {
  const { ports } = buildContainer({
    port: 0,
    adapters: "mock",
    today: "2026-12-01",
  });
  const repo = createMemoryHostRepo(ports.catalog);
  repo.initialize({
    id: "usr_host",
    humanId: mockSubjectFor("host"),
    level: "orb",
    walletAddress: "",
  });
  const deps = { ports, repo };
  const selection = create(OpenNightsSelectionSchema, {
    propertyId: "prop_velana",
    roomTypeIds: ["rt_velana_0"],
    dates: ["2026-12-24"],
    allotmentPercent: 100,
    demandPreset: DemandPreset.PEAK,
    releasePolicy: ReleasePolicy.DAY_BEFORE_18,
  });
  return {
    ...deps,
    use: createHostUseCases(deps),
    selection,
    userId: "usr_host",
    key: "prop_velana:rt_velana_0:2026-12-24",
  };
}
