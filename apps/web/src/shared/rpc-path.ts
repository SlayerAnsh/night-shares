export function isRpcPath(path: readonly string[]): boolean {
  if (path.length !== 2) return false;
  const [service, method] = path;
  if (!service || !method) return false;
  // Session tokens may only be issued through the httpOnly server action.
  if (
    service === "night_shares.identity.v1.IdentityService" &&
    method === "CompleteSignIn"
  )
    return false;
  return (
    /^night_shares\.[a-z][a-z0-9_]*\.v1\.[A-Z][A-Za-z0-9]*Service$/.test(
      service,
    ) && /^[A-Z][A-Za-z0-9]*$/.test(method)
  );
}
