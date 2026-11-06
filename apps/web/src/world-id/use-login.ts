"use client";
import {
  type CompleteSignInRequest,
  WorldIdMode,
} from "@night-shares/proto/identity/v1/identity_pb";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AccessLevel } from "../session/access";
import { completeSignIn, signOut } from "../session/actions";
import { useSession } from "../session/SessionProvider";
import type { WorldIdClient } from "./world-id-client";
import { verifyWithIdkit } from "./world-id-client.idkit";
import { useMockWorldIdClient } from "./world-id-client.mock";

export function useLogin(need: AccessLevel) {
  const router = useRouter();
  const session = useSession();
  const worldId = useMockWorldIdClient();
  const [request, setRequest] = useState<Awaited<
    ReturnType<WorldIdClient["start"]>
  > | null>(null);
  const [seed, setSeed] = useState(need === "orb" ? "trader" : "guest");
  const [stage, setStage] = useState("intro");
  const [error, setError] = useState("");
  const busy =
    stage === "starting" || stage === "verifying" || stage === "switching";
  async function start() {
    setStage("starting");
    setError("");
    try {
      setRequest(await worldId.start(need));
      setStage("scan");
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Unable to start sign in.",
      );
      setStage("intro");
    }
  }
  async function scan() {
    if (!request) return;
    setStage("verifying");
    setError("");
    try {
      const submit = (proof: CompleteSignInRequest["proof"]) =>
        completeSignIn(request.requestId, proof);
      if (request.mode === WorldIdMode.WORLD_ID) {
        await verifyWithIdkit(request, need, submit);
      } else if (request.mode === WorldIdMode.MOCK) {
        await submit({ case: "mockProof", value: `mock:${seed}:${need}` });
      } else throw new Error("Unsupported World ID mode.");
      await session.refresh();
      setStage("success");
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Unable to verify World ID.",
      );
      setStage("intro");
      setRequest(null);
    }
  }
  async function switchAccount() {
    setStage("switching");
    setError("");
    try {
      await signOut();
      await session.refresh();
      setRequest(null);
      setStage("intro");
      router.refresh();
    } catch (error) {
      await session.refresh();
      setError(error instanceof Error ? error.message : "Unable to sign out.");
      setStage("intro");
    }
  }

  return {
    router,
    session,
    request,
    seed,
    setSeed,
    stage,
    error,
    busy,
    start,
    scan,
    switchAccount,
  };
}
