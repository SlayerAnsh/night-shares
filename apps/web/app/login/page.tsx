import { safeNext } from "../../src/session/safe-next";
import { Login } from "../../src/world-id/Login";
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = safeNext(
    typeof params.next === "string" ? params.next : undefined,
  );
  const need = params.need === "orb" ? "orb" : "device";
  return (
    <Login
      key={`${next}:${need}`}
      next={next}
      why={typeof params.why === "string" ? params.why : "continue"}
      need={need}
    />
  );
}
