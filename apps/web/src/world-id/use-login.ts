"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AccessLevel } from "../session/access";
import { completeSignIn, signOut } from "../session/actions";
import { useSession } from "../session/SessionProvider";
import type { WorldIdClient } from "./world-id-client";
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
      await completeSignIn(request.requestId, `mock:${seed}:${need}`);
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
