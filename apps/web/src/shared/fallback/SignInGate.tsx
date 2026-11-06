"use client";
import {
  Button,
  buttonClass,
  Card,
  cx,
  Icon,
} from "@night-shares/design-system";
import Link from "next/link";
import type { ReactNode } from "react";
import type { AccessLevel } from "../../session/access";
import { useRequireAccess } from "../../session/require-access";
import { useSession } from "../../session/SessionProvider";
import { WorldIdGlyph } from "../nav/WorldIdGlyph";
import type { FallbackLink } from "./ErrorState";
import styles from "./Gate.module.css";

export type GatePerk = { title: string; text: string };

const LEVELS: Record<AccessLevel, { name: string; why: string }> = {
  orb: {
    name: "Orb",
    why: "Needs World ID Orb, a one time check that you are one unique person. It keeps one account per person and the per person cap on each night fair.",
  },
  device: {
    name: "Selfie Check",
    why: "Needs World ID Selfie Check, a quick camera check that a real person is booking. No Orb needed.",
  },
};

export type SignInGateProps = {
  need: AccessLevel;
  // Sent to the login page as `why` (its headline picks copy from it).
  reason: string;
  title: string;
  lead: string;
  perks: GatePerk[];
  browse: FallbackLink;
  // Shown blurred behind the card: what the page looks like once signed in.
  preview?: ReactNode;
  className?: string;
};

/** Signed out, or signed in below the level a page needs: say what the page is for and how to get in. */
export function SignInGate({
  need,
  reason,
  title,
  lead,
  perks,
  browse,
  preview,
  className,
}: SignInGateProps) {
  const access = useRequireAccess();
  const { isSignedIn } = useSession();
  const level = LEVELS[need];
  const upgrade = isSignedIn && need === "orb";
  return (
    <div
      className={cx(
        styles.gate,
        preview ? styles.withPreview : undefined,
        className,
      )}
    >
      {preview && (
        <div className={styles.preview} aria-hidden="true" inert>
          {preview}
        </div>
      )}
      <Card as="section" className={styles.card} aria-labelledby="gate-title">
        <span className={styles.level}>
          <WorldIdGlyph className={styles.glyph} />
          World ID · {level.name}
        </span>
        <h2 id="gate-title" className={styles.title}>
          {title}
        </h2>
        <p className={styles.lead}>{lead}</p>
        <ul className={styles.perks}>
          {perks.map((perk) => (
            <li key={perk.title}>
              <span className={styles.tick}>
                <Icon name="check" size={14} />
              </span>
              <span>
                <b>{perk.title}</b>
                {perk.text}
              </span>
            </li>
          ))}
        </ul>
        <p className={styles.why}>
          {upgrade
            ? "You are signed in with Selfie Check. This page needs World ID Orb, a one time check that you are one unique person."
            : level.why}
        </p>
        <div className={styles.actions}>
          <Button
            variant="primary"
            size="lg"
            onClick={() => access.require(reason, need)}
          >
            <WorldIdGlyph className={styles.glyph} />
            {upgrade ? "Verify with Orb" : "Sign in with World ID"}
          </Button>
          <Link href={browse.href} className={buttonClass({ variant: "text" })}>
            {browse.label}
          </Link>
        </div>
      </Card>
    </div>
  );
}
