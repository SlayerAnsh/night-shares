import { HeroFrame } from "../../../src/features/stay/components/shared/HeroFrame";
import { NotFoundState } from "../../../src/shared/fallback/NotFoundState";

export default function NotFound() {
  return (
    <HeroFrame>
      <NotFoundState
        title="We could not find that stay"
        text="The link may be old, or the stay is no longer listed. Search above or browse every stay."
        primary={{ href: "/stay", label: "See all stays" }}
        links={[
          { href: "/stay/trips", label: "My trips" },
          { href: "/trade", label: "Trade room nights" },
          { href: "/host", label: "List your hotel" },
        ]}
      />
    </HeroFrame>
  );
}
