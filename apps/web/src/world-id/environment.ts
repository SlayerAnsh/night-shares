export function idkitEnvironment(value: string): "production" | "staging" {
  if (value === "production" || value === "staging") return value;
  throw new Error("World ID environment must be production or staging.");
}
