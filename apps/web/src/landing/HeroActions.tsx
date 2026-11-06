"use client";
import { buttonClass, cx } from "@night-shares/design-system";
import Link from "next/link";
import { loginHref } from "../session/access";
import { useSession } from "../session/SessionProvider";
import { WorldIdGlyph } from "../shared/nav/WorldIdGlyph";
import styles from "./HeroActions.module.css";

// The sign in action only makes sense while signed out.
export function HeroActions() {
  const { isSignedIn } = useSession();
  const button = (extra?: string) =>
    cx(buttonClass({ variant: "secondary", size: "lg" }), extra);
  return (
    <div className={styles.actions}>
      <Link className={button(styles.find)} href="/stay">
        Find a stay
      </Link>
      {!isSignedIn && (
        <Link
          className={button(styles.worldId)}
          href={loginHref("/", "continue", "device")}
        >
          <WorldIdGlyph />
          Sign in with World ID
        </Link>
      )}
    </div>
  );
}
