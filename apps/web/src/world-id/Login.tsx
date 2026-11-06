"use client";
import { WorldIdMode } from "@night-shares/proto/identity/v1/identity_pb";
import { type AccessLevel, canAccess } from "../session/access";
import { AlreadyStep } from "./login/AlreadyStep";
import { browseHref } from "./login/browse-href";
import { ErrorNote } from "./login/ErrorNote";
import { IntroStep } from "./login/IntroStep";
import { LoginFrame } from "./login/LoginFrame";
import { LoginLinks } from "./login/LoginLinks";
import { ScanStep } from "./login/ScanStep";
import { VerifyingStep } from "./login/VerifyingStep";
import { Success } from "./Success";
import { useLogin } from "./use-login";

const reasons: Record<string, string> = {
  trade: "To trade room nights on Night Shares.",
  host: "To manage your hotels on Night Shares.",
  book: "To book this stay or see your trips.",
  portfolio: "To see your portfolio on Night Shares.",
  watchlist: "To save stays and room nights to your list.",
  continue: "To book, trade and host on Night Shares.",
};
const levelNames = { device: "Device", orb: "Orb" };

export function Login({
  next,
  why,
  need,
}: {
  next: string;
  why: string;
  need: AccessLevel;
}) {
  const login = useLogin(need);
  const { session, request, stage, busy } = login;
  const already = session.user && canAccess(session.level, need);
  const onSwitch = session.user ? () => void login.switchAccount() : undefined;
  const links = (browse?: string) => (
    <LoginLinks browse={browse} onSwitch={onSwitch} busy={busy} />
  );
  function step() {
    if (stage === "success")
      return (
        <Success
          next={next}
          user={session.user}
          levelName={levelNames[session.level ?? need]}
        />
      );
    if (stage === "verifying") return <VerifyingStep need={need} />;
    if (already && session.user)
      return (
        <AlreadyStep
          levelName={levelNames[session.level ?? need]}
          wallet={session.user.walletAddress}
          busy={busy}
          onContinue={() => login.router.replace(next)}
          links={links()}
        />
      );
    if (request)
      return (
        <ScanStep
          need={need}
          isWorldId={request.mode === WorldIdMode.WORLD_ID}
          payload={request.qrPayload}
          seed={login.seed}
          onSeed={login.setSeed}
          busy={busy}
          onScan={() => void login.scan()}
          links={links()}
        />
      );
    const needsOrb = session.user
      ? " You are signed in with Device, this needs Orb."
      : "";
    return (
      <IntroStep
        reason={(reasons[why] ?? reasons.continue) + needsOrb}
        why={why}
        need={need}
        busy={busy}
        onStart={() => void login.start()}
        links={links(browseHref(next))}
      />
    );
  }
  return (
    <LoginFrame>
      <ErrorNote message={login.error} />
      {step()}
    </LoginFrame>
  );
}
