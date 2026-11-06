import { createHash } from "node:crypto";
import { createRemoteJWKSet, customFetch } from "jose";
import type { Clock } from "../clock/clock";
import type { AgentPass } from "./agent-pass";
import { claimCheckpoint } from "./claim";
import { CheckpointFailure } from "./failure";
import type { CheckpointStore } from "./store";
import { validateToken } from "./validate-token";

type Metadata = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
};
export function createOidcAgentPass(deps: {
  store: CheckpointStore;
  clock: Clock;
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  fetch?: typeof fetch;
}): AgentPass {
  const request = deps.fetch ?? fetch;
  let discovery: Promise<Metadata> | undefined;
  let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;
  async function metadata() {
    discovery ??= (async () => {
      const r = await request(
        `${deps.issuer}/.well-known/openid-configuration`,
        { signal: AbortSignal.timeout(10000), redirect: "error" },
      );
      if (!r.ok) throw new CheckpointFailure("login_required");
      const m = (await r.json()) as Metadata;
      if (m.issuer !== deps.issuer) throw new CheckpointFailure("mismatch");
      for (const endpoint of [
        m.authorization_endpoint,
        m.token_endpoint,
        m.jwks_uri,
      ]) {
        const url = new URL(endpoint);
        if (url.protocol !== "https:" || url.username || url.password)
          throw new CheckpointFailure("mismatch");
      }
      return m;
    })();
    try {
      return await discovery;
    } catch (error) {
      discovery = undefined;
      throw error;
    }
  }
  return {
    async startCheckpoint(input) {
      const m = await metadata();
      const a = deps.store.create(input);
      const url = new URL(m.authorization_endpoint);
      url.search = new URLSearchParams({
        client_id: deps.clientId,
        redirect_uri: deps.redirectUri,
        response_type: "code",
        scope: "openid",
        state: a.state,
        nonce: a.nonce,
        code_challenge: createHash("sha256")
          .update(a.verifier)
          .digest("base64url"),
        code_challenge_method: "S256",
        max_age: "0",
        prompt: "login",
        claims: JSON.stringify({
          id_token: { acr: { essential: true, value: a.acr } },
        }),
      }).toString();
      return { attemptId: a.id, authorizeUrl: url.href };
    },
    async completeCheckpoint({ state, code }) {
      const a = claimCheckpoint(deps.store, state);
      const m = await metadata();
      const encode = (s: string) =>
        new URLSearchParams({ v: s }).toString().slice(2);
      const credentials = Buffer.from(
        `${encode(deps.clientId)}:${encode(deps.clientSecret)}`,
      ).toString("base64");
      const r = await request(m.token_endpoint, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(10000),
        headers: {
          authorization: `Basic ${credentials}`,
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: deps.redirectUri,
          code_verifier: a.verifier,
        }),
      });
      if (!r.ok) throw new CheckpointFailure("access_denied");
      const body = (await r.json()) as { id_token?: unknown };
      if (typeof body.id_token !== "string")
        throw new CheckpointFailure("access_denied");
      jwks ??= createRemoteJWKSet(new URL(m.jwks_uri), {
        timeoutDuration: 10000,
        [customFetch]: request,
      });
      return validateToken(body.id_token, jwks, a, deps);
    },
  };
}
