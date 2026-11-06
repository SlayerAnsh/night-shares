"use client";
import { useMutation, useQuery } from "@connectrpc/connect-query";
import {
  checkIn,
  getReceipt,
  issueReceptionTag,
  listTrips,
  reportWalk,
  tapReception,
} from "@night-shares/proto/stay/v1/stay-StayService_connectquery";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useRequireAccess } from "../../../session/require-access";
import { useSession } from "../../../session/SessionProvider";
import { useVerifyAction } from "../../../world-id/use-verify-action";
export function useTrips() {
  const session = useSession();
  const access = useRequireAccess();
  const sessionPending = useIsFetching({
    predicate: (query) => query.meta?.session === true,
  });
  useEffect(() => {
    if (!sessionPending) access.require("trips", "device");
  });
  return useQuery(listTrips, {}, { enabled: session.isSignedIn });
}
export function useTripActions(tripId: string) {
  const access = useRequireAccess();
  const session = useSession();
  const cache = useQueryClient();
  const [showReceipt, setShowReceipt] = useState(false);
  const [seed, setSeed] = useState("guest");
  useEffect(() => {
    setSeed(window.localStorage.getItem("ns-stay-checkin-seed") || "guest");
  }, []);
  const receipt = useQuery(
    getReceipt,
    { tripId },
    { enabled: showReceipt && session.isSignedIn },
  );
  const tap = useMutation(tapReception);
  const issue = useMutation(issueReceptionTag);
  async function tapAtReception() {
    const { tagPayload } = await issue.mutateAsync({ bookingId: tripId });
    await tap.mutateAsync({ bookingId: tripId, tagPayload });
  }
  const walk = useMutation(reportWalk, {
    onSuccess: () => cache.invalidateQueries(),
  });
  const verify = useVerifyAction();
  const check = useMutation(checkIn, {
    onSuccess: () => cache.invalidateQueries(),
  });
  async function confirm() {
    if (!access.require("checkin", "device")) return;
    window.localStorage.setItem("ns-stay-checkin-seed", seed);
    const result = await verify.mutateAsync({
      action: "check_in",
      proof: `mock:${seed}:device`,
    });
    await check.mutateAsync({
      tripId,
      verificationToken: result.verificationToken,
    });
  }
  function toggleReceipt() {
    if (access.require("trips", "device")) setShowReceipt(!showReceipt);
  }
  return {
    tap,
    issue,
    tapAtReception,
    walk,
    seed,
    setSeed,
    showReceipt,
    toggleReceipt,
    receipt,
    verify,
    check,
    confirm,
  };
}
