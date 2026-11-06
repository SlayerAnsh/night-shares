import { createClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import { IdentityService } from "@night-shares/proto/identity/v1/identity_pb";
import { cookies } from "next/headers";
import { apiUrl } from "../shared/api-url";
import { sessionCookie } from "./cookie";
export async function identityServer() {
  const token = (await cookies()).get(sessionCookie.name)?.value;
  const headers = new Headers();
  if (token) headers.set("authorization", `Bearer ${token}`);
  // Connect uses POST by default, so Next never caches these session requests.
  const client = createClient(
    IdentityService,
    createConnectTransport({ baseUrl: apiUrl }),
  );
  return { client, options: { headers } };
}
