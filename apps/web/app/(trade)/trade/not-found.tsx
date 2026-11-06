import { NotFoundState } from "../../../src/shared/fallback/NotFoundState";

export default function NotFound() {
  return (
    <NotFoundState
      title="This market does not exist"
      text="The link may be old or mistyped, or the night has already settled. Every open market is on the markets page."
      primary={{ href: "/trade", label: "Browse markets" }}
      links={[
        { href: "/trade/portfolio", label: "Your portfolio" },
        { href: "/stay", label: "Book a stay" },
        { href: "/host", label: "List your hotel" },
      ]}
    />
  );
}
