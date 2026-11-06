"use client";
import type { StartVerifyActionResponse } from "@night-shares/proto/identity/v1/identity_pb";
import {
  IDKitWidget,
  type ISuccessResult,
  useIDKit,
  VerificationLevel,
} from "@worldcoin/idkit";
import { useEffect, useRef } from "react";
import type { AccessLevel } from "../session/access";

export function IdKitPrompt(props: {
  request: Pick<StartVerifyActionResponse, "appId" | "action" | "signal">;
  level: AccessLevel;
  handleVerify: (proof: ISuccessResult) => Promise<void>;
  onSuccess: () => void;
  onCancel: () => void;
  onError: () => void;
}) {
  const { open, setOpen } = useIDKit();
  const opened = useRef(false);
  useEffect(() => {
    setOpen(true);
    const timer = setTimeout(props.onCancel, 300_000);
    return () => {
      clearTimeout(timer);
      setOpen(false);
    };
  }, [setOpen, props.onCancel]);
  useEffect(() => {
    if (open) opened.current = true;
    else if (opened.current) props.onCancel();
  }, [open, props.onCancel]);
  return (
    <IDKitWidget
      app_id={props.request.appId as `app_${string}`}
      action={props.request.action}
      signal={props.request.signal}
      verification_level={
        props.level === "orb" ? VerificationLevel.Orb : VerificationLevel.Device
      }
      handleVerify={props.handleVerify}
      onSuccess={props.onSuccess}
      onError={props.onError}
    />
  );
}
