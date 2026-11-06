import { NotFoundState } from "../../../src/shared/fallback/NotFoundState";

export default function NotFound() {
  return (
    <NotFoundState
      title="This page is not in your console"
      text="The hotel or night may not be connected to your account, or the link is mistyped."
      primary={{ href: "/host", label: "All hotels" }}
      links={[
        { href: "/host/payout", label: "Payouts" },
        { href: "/stay", label: "Book a stay" },
        { href: "/trade", label: "Trade room nights" },
      ]}
    />
  );
}
