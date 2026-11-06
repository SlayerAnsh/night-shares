"use client";
import { WorldIdMode } from "@night-shares/proto/identity/v1/identity_pb";
import { type AccessLevel, canAccess } from "../session/access";
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
export function Login({
  next,
  why,
  need,
}: {
  next: string;
  why: string;
  need: AccessLevel;
}) {
  const {
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
  } = useLogin(need);
  const already = session.user && canAccess(session.level, need);
  return (
    <main>
      <h1>Sign in with World ID</h1>
      <p>{reasons[why] ?? reasons.continue}</p>
      <p>World ID level: {need === "orb" ? "Orb" : "Device"}</p>
      {session.user && (
        <p>
          Signed in: {session.level}. Wallet: {session.user.walletAddress}
        </p>
      )}
      {session.user && !already && <p>This action needs Orb verification.</p>}
      {error && <p role="alert">{error}</p>}
      {stage === "success" ? (
        <Success next={next} />
      ) : (
        <>
          {stage === "verifying" ? (
            <ol aria-live="polite">
              <li>Proof received</li>
              <li>{need} credential checked</li>
              <li>USDC wallet on Arc ready</li>
            </ol>
          ) : already ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => router.replace(next)}
            >
              Continue
            </button>
          ) : request?.mode === WorldIdMode.WORLD_ID ? (
            <button type="button" disabled={busy} onClick={() => void scan()}>
              Verify with World ID
            </button>
          ) : request ? (
            <>
              <p>Scan with World App</p>
              <div
                style={{
                  border: "1px solid",
                  padding: 16,
                  overflowWrap: "anywhere",
                }}
              >
                {request.qrPayload}
              </div>
              {process.env.NODE_ENV === "development" && (
                <label>
                  Demo seed{" "}
                  <input
                    value={seed}
                    onChange={(event) => setSeed(event.target.value)}
                  />
                </label>
              )}
              <button
                type="button"
                disabled={busy || !seed.trim()}
                onClick={() => void scan()}
              >
                Simulate scan
              </button>
            </>
          ) : (
            <button type="button" disabled={busy} onClick={() => void start()}>
              Sign in with World ID
            </button>
          )}
          {session.user && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void switchAccount()}
            >
              Switch account
            </button>
          )}
        </>
      )}
    </main>
  );
}
