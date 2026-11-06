"use client";
import { Code } from "@connectrpc/connect";
import {
  Alert,
  Button,
  buttonClass,
  Card,
  cx,
} from "@night-shares/design-system";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { type AccessLevel, loginHref } from "../../session/access";
import { errorCopy } from "./error-copy";
import styles from "./Fallback.module.css";

export type FallbackLink = { href: string; label: string };

export type ErrorStateProps = {
  error: unknown;
  // What failed, for the not found title ("This stay could not be found").
  thing?: string;
  // Replaces the title picked from the error code.
  title?: string;
  // Defaults to refetching every query on screen that failed.
  onRetry?: () => void;
  retrying?: boolean;
  back?: FallbackLink;
  // Level to ask for when the session has ended.
  need?: AccessLevel;
  // inline: no card, for a failed block inside a page.
  inline?: boolean;
  // A hint under the message, for example where else to look.
  children?: ReactNode;
  className?: string;
};

/** A failed load: what happened in plain words, a retry, and a way back. */
export function ErrorState({
  error,
  thing,
  title,
  onRetry,
  retrying,
  back,
  need = "device",
  inline = false,
  children,
  className,
}: ErrorStateProps) {
  // Router, not useRequireAccess: this also renders outside SessionProvider.
  const router = useRouter();
  const cache = useQueryClient();
  const fetching = useIsFetching() > 0;
  const copy = errorCopy(error, thing);
  const retry = copy.canRetry;
  function retryFailed() {
    void cache.refetchQueries({
      type: "active",
      predicate: (query) => query.state.status === "error",
    });
  }
  const body = (
    <>
      <span className={styles.eyebrow}>
        {copy.needsSignIn
          ? "Signed out"
          : copy.code === Code.NotFound
            ? "Not found"
            : "Could not load"}
      </span>
      <h2 className={styles.title}>{title ?? copy.title}</h2>
      <Alert className={styles.alert}>{copy.message}</Alert>
      {children && <p className={styles.text}>{children}</p>}
      <div className={styles.actions}>
        {copy.needsSignIn && (
          <Button
            variant="primary"
            onClick={() =>
              router.push(
                loginHref(
                  window.location.pathname + window.location.search,
                  "continue",
                  need,
                ),
              )
            }
          >
            Sign in with World ID
          </Button>
        )}
        {retry && (
          <Button
            variant={copy.needsSignIn ? "ghost" : "primary"}
            disabled={retrying ?? fetching}
            onClick={onRetry ?? retryFailed}
          >
            {(retrying ?? fetching) ? "Trying again…" : "Try again"}
          </Button>
        )}
        {back && (
          <Link
            href={back.href}
            className={buttonClass({ variant: retry ? "text" : "ghost" })}
          >
            {back.label}
          </Link>
        )}
      </div>
    </>
  );
  if (inline)
    return (
      <div className={cx(styles.state, styles.inline, className)}>{body}</div>
    );
  return (
    <Card as="section" className={cx(styles.state, className)}>
      {body}
    </Card>
  );
}
