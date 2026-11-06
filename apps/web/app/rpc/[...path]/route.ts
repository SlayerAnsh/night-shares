import { cookies } from "next/headers";
import { sessionCookie } from "../../../src/session/cookie";
import { apiUrl } from "../../../src/shared/api-url";
import { proxyHeaders } from "../../../src/shared/proxy-headers";
import { isRpcPath } from "../../../src/shared/rpc-path";

type Context = { params: Promise<{ path: string[] }> };
async function forward(request: Request, context: Context) {
  const { path } = await context.params;
  if (!isRpcPath(path)) return new Response(null, { status: 404 });
  const headers = new Headers();
  for (const name of [
    "content-type",
    "accept",
    "connect-protocol-version",
    "connect-timeout-ms",
  ]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const token = (await cookies()).get(sessionCookie.name)?.value;
  if (token) headers.set("authorization", `Bearer ${token}`);
  const url = new URL(path.join("/"), `${apiUrl.replace(/\/$/, "")}/`);
  url.search = new URL(request.url).search;
  try {
    const response = await fetch(url, {
      method: request.method,
      headers,
      body: request.method === "GET" ? undefined : await request.arrayBuffer(),
      cache: "no-store",
      redirect: "manual",
      signal: request.signal,
    });
    return new Response(response.body, {
      status: response.status,
      headers: proxyHeaders(response.headers),
    });
  } catch {
    return Response.json(
      { code: "unavailable", message: "API unavailable." },
      { status: 502 },
    );
  }
}
export const POST = forward;
export const GET = forward;
