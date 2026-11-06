import type { IncomingMessage, ServerResponse } from "node:http";
import type { Container } from "../container/build-container";
import { createSqliteMarketRepo } from "../modules/market/repo/market-repo.sqlite";
import { completeAgentCheckpoint } from "../modules/market/use-cases/agent/complete-checkpoint";
import { agentPassSettings } from "../ports/agent-pass/settings";
import { secret } from "../ports/agent-pass/store";
export function createAgentPassRoute(container: Container) {
  const { ports } = container;
  const deps = { ports, repo: createSqliteMarketRepo(ports.db) };
  const { config, store } = agentPassSettings(ports);
  const cookieName =
    config.agentPassMode === "oidc" ? "__Host-ns_checkpoint" : "ns_checkpoint";
  const cookie = (value: string) =>
    `${cookieName}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600${config.agentPassMode === "oidc" ? "; Secure" : ""}`;
  function redirect(res: ServerResponse, url: string) {
    res.writeHead(303, { location: url }).end();
  }
  return async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", config.agentPassRedirectUri);
    if (!url.pathname.startsWith("/agent-pass/")) return false;
    res.setHeader("cache-control", "no-store");
    res.setHeader("referrer-policy", "no-referrer");
    res.setHeader(
      "content-security-policy",
      "default-src 'none'; form-action 'self'; frame-ancestors 'none'",
    );
    if (req.method !== "GET") {
      res.writeHead(405).end();
      return true;
    }
    if (url.pathname === "/agent-pass/begin") {
      const a = store.get(url.searchParams.get("attempt") ?? "");
      const ticket = url.searchParams.get("ticket");
      if (
        a?.status !== "pending" ||
        !ticket ||
        ticket !== a.handoff ||
        !a.authorizeUrl ||
        !ports.sessions.get(a.sessionToken ?? "")
      ) {
        res.writeHead(403).end("Checkpoint handoff rejected.");
        return true;
      }
      a.handoff = undefined;
      a.browser = secret();
      store.save(a);
      res.setHeader("set-cookie", cookie(a.browser));
      redirect(res, a.authorizeUrl);
      return true;
    }
    const browser =
      req.headers.cookie
        ?.split(";")
        .map((v) => v.trim())
        .find((v) => v.startsWith(`${cookieName}=`))
        ?.slice(cookieName.length + 1) ?? "";
    if (
      url.pathname === "/agent-pass/mock" &&
      config.agentPassMode === "mock" &&
      config.adapters === "mock"
    ) {
      const a = store.byState(url.searchParams.get("state") ?? "");
      if (!a || !browser || browser !== a.browser || a.status !== "pending") {
        res.writeHead(403).end("Checkpoint unavailable.");
        return true;
      }
      // State is server-generated base64url, never arbitrary HTML.
      res
        .writeHead(200, { "content-type": "text/html; charset=utf-8" })
        .end(
          `<!doctype html><html lang="en"><meta charset="utf-8"><title>Mock World ID checkpoint</title><h1>Approve agent order</h1><p>Local mock authentication. Approve, deny, cancel, or leave this page for ten minutes to expire.</p><form action="/agent-pass/callback"><input type="hidden" name="state" value="${a.state}"><button name="code" value="approve">Approve</button><button name="error" value="access_denied">Deny</button><button name="error" value="cancelled">Cancel</button></form></html>`,
        );
      return true;
    }
    if (url.pathname === "/agent-pass/callback") {
      const duplicate = [...new Set(url.searchParams.keys())].some(
        (k) => url.searchParams.getAll(k).length !== 1,
      );
      const status = duplicate
        ? "mismatch"
        : await completeAgentCheckpoint(deps, {
            state: url.searchParams.get("state") ?? "",
            code: url.searchParams.get("code") ?? undefined,
            error: url.searchParams.get("error") ?? undefined,
            iss: url.searchParams.get("iss") ?? undefined,
            browser,
          });
      redirect(res, `${config.webOrigin}/trade/portfolio?checkpoint=${status}`);
      return true;
    }
    res.writeHead(404).end();
    return true;
  };
}
