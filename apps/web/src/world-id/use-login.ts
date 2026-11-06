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
      setRequest(
        await worldId.start(
          need,
          localStorage.getItem(`world-id-session:${need}`) ?? undefined,
        ),
      );
      setStage("scan");
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Unable to start sign in.",
      );
      setStage("intro");
    }
  }
  async function scan(outcome: "success" | "cancel" | "reject" = "success") {
    if (!request) return;
    setStage("verifying");
    setError("");
    try {
      const submit = async (proof: CompleteSignInRequest["proof"]) => {
        const result = await completeSignIn(request.requestId, proof);
        if ("error" in result) throw new Error(result.error);
        if (result.sessionId)
          localStorage.setItem(`world-id-session:${need}`, result.sessionId);
        return result;
      };
      if (request.mode === WorldIdMode.WORLD_ID) {
        await verifyWithIdkit(request, need, submit);
      } else if (request.mode === WorldIdMode.MOCK) {
        await submit({
          case: "mockProof",
          value:
            outcome === "success" ? `mock:${seed}:${need}` : `mock:${outcome}`,
        });
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
      localStorage.removeItem("world-id-session:device");
      localStorage.removeItem("world-id-session:orb");
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
    cancel: () => scan("cancel"),
    reject: () => scan("reject"),
    recover: async () => {
      localStorage.removeItem(`world-id-session:${need}`);
      await start();
    },
  };
}
