import { NotFoundState } from "../src/shared/fallback/NotFoundState";
import { AppNav } from "../src/shared/nav/AppNav";

export default function NotFound() {
  return (
    <>
      <AppNav app={null} />
      <main>
        <NotFoundState
          title="This page does not exist"
          text="The link may be old or mistyped. Night Shares has three apps; pick the one you came for."
          primary={{ href: "/", label: "Go to the home page" }}
          links={[
            { href: "/stay", label: "Book a stay" },
            { href: "/trade", label: "Trade room nights" },
            { href: "/host", label: "List your hotel" },
          ]}
        />
      </main>
    </>
  );
}
