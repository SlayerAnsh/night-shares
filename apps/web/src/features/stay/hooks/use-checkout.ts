"use client";
import { useMutation } from "@connectrpc/connect-query";
import {
  createBooking,
  lockQuote,
} from "@night-shares/proto/stay/v1/stay-StayService_connectquery";
import { PayMethod, type StayQuote } from "@night-shares/proto/stay/v1/trip_pb";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useRequireAccess } from "../../../session/require-access";
import { useSession } from "../../../session/SessionProvider";
import { remainingTime } from "../model/search";
import { useProperty } from "./use-property";
export function useCheckout(propertyId: string) {
  const model = useProperty(propertyId);
  const session = useSession();
  const access = useRequireAccess();
  const sessionPending = useIsFetching({
    predicate: (query) => query.meta?.session === true,
  });
  const cache = useQueryClient();
  const lock = useMutation(lockQuote);
  const booking = useMutation(createBooking, {
    onSuccess: () => cache.invalidateQueries(),
  });
  const [lockedQuote, setLockedQuote] = useState<StayQuote>();
  const [now, setNow] = useState(() => Date.now());
  const [payMethod, setPayMethod] = useState(PayMethod.USDC);
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const attempted = useRef(false);
  const quoteId = model.quote.data?.quote?.id;
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  async function relock() {
    if (!access.require("book", "device")) return;
    const fresh = await model.quote.refetch();
    if (fresh.data?.quote && !fresh.error) {
      await lock.mutateAsync({ quoteId: fresh.data.quote.id });
      setLockedQuote(fresh.data.quote);
    }
  }
  useEffect(() => {
    if (attempted.current || !quoteId || sessionPending) return;
    if (!access.require("book", "device")) return;
    attempted.current = true;
    const quote = model.quote.data?.quote;
    lock.mutate({ quoteId }, { onSuccess: () => setLockedQuote(quote) });
  });
  const countdown = remainingTime(lock.data?.expiresAt, now);
  async function pay() {
    if (
      !access.require("book", "device") ||
      !lock.data ||
      !countdown.seconds ||
      booking.isPending ||
      booking.data
    )
      return;
    await booking.mutateAsync({
      lockId: lock.data.lockId,
      guestName,
      guestEmail,
      payMethod,
    });
  }
  return {
    model,
    lockedQuote,
    session,
    lock,
    booking,
    countdown,
    payMethod,
    setPayMethod,
    guestName,
    setGuestName,
    guestEmail,
    setGuestEmail,
    relock,
    pay,
  };
}
