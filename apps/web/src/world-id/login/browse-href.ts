// Where "Continue browsing" goes: the public page behind the one that asked for sign in.
export function browseHref(next: string) {
  if (next.startsWith("/host")) return "/";
  if (next.startsWith("/stay/trips")) return "/stay";
  if (next.startsWith("/trade/portfolio")) return "/trade";
  return next;
}
