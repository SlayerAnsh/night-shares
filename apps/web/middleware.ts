import { type NextRequest, NextResponse } from "next/server";
export function middleware(request: NextRequest) {
  const headers = new Headers(request.headers);
  // Overwrite browser input so the server guard can preserve deep links safely.
  headers.set(
    "x-night-shares-path",
    request.nextUrl.pathname + request.nextUrl.search,
  );
  return NextResponse.next({ request: { headers } });
}
export const config = { matcher: ["/host/:path*"] };
