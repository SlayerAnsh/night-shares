export function safeNext(value: string | null | undefined): string {
  if (
    !value?.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    Array.from(value).some(
      (char) => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127,
    )
  )
    return "/";
  try {
    const url = new URL(value, "https://night-shares.invalid");
    return url.origin === "https://night-shares.invalid" ? value : "/";
  } catch {
    return "/";
  }
}
