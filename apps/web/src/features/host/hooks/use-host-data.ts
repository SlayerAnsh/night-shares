"use client";
import { createClient } from "@connectrpc/connect";
import {
  createConnectQueryKey,
  useMutation,
  useQuery,
  useTransport,
} from "@connectrpc/connect-query";
import { CatalogService } from "@night-shares/proto/catalog/v1/catalog_pb";
import { getProperty } from "@night-shares/proto/catalog/v1/catalog-CatalogService_connectquery";
import { HostService } from "@night-shares/proto/host/v1/host_pb";
import * as rpc from "@night-shares/proto/host/v1/host-HostService_connectquery";
import { MarketService } from "@night-shares/proto/market/v1/market_pb";
import { StayService } from "@night-shares/proto/stay/v1/stay_pb";
import { WalletService } from "@night-shares/proto/wallet/v1/wallet_pb";
import { getBalance } from "@night-shares/proto/wallet/v1/wallet-WalletService_connectquery";
import {
  keepPreviousData,
  useQueryClient,
  useMutation as useTanstackMutation,
  useQuery as useTanstackQuery,
} from "@tanstack/react-query";

export const usePortfolio = () => useQuery(rpc.getPortfolio);
// Keep the shown month while the next one loads, so paging the calendar does not flash.
export const useHotel = (propertyId: string, month = "") =>
  useQuery(
    rpc.getHotel,
    { propertyId, month },
    { placeholderData: keepPreviousData },
  );
export const useNight = (propertyId: string, date: string) =>
  useQuery(rpc.getNight, { propertyId, date });
export function usePayout(propertyId: string) {
  const transport = useTransport();
  return useTanstackQuery({
    queryKey: createConnectQueryKey({
      schema: rpc.getPayout,
      input: { propertyId },
      cardinality: "finite",
    }),
    queryFn: async () => {
      let chain:
        | { payoutCredit: bigint; debt: bigint; owedToGuest: bigint }
        | undefined;
      const response = await createClient(HostService, transport).getPayout(
        { propertyId },
        {
          onHeader(headers) {
            if (headers.has("x-host-payout-block"))
              chain = {
                payoutCredit: BigInt(
                  headers.get("x-host-payout-credit") ?? "0",
                ),
                debt: BigInt(headers.get("x-host-debt") ?? "0"),
                owedToGuest: BigInt(headers.get("x-host-owed-to-guest") ?? "0"),
              };
          },
        },
      );
      return { ...response, chain };
    },
  });
}
export const useBalance = () => useQuery(getBalance);
export const useProperty = (propertyId: string) =>
  useQuery(getProperty, { propertyId });

export function useHostMutations() {
  const client = useQueryClient();
  const transport = useTransport();
  const onSuccess = async () => {
    await Promise.all(
      [
        HostService,
        WalletService,
        CatalogService,
        MarketService,
        StayService,
      ].map((schema) =>
        client.invalidateQueries({
          queryKey: createConnectQueryKey({ schema, cardinality: undefined }),
        }),
      ),
    );
  };
  return {
    connect: useTanstackMutation({
      mutationFn: ({
        payoutAddress,
        ...request
      }: {
        propertyId: string;
        pms: import("@night-shares/proto/host/v1/opening_pb").Pms;
        payoutAddress?: string;
      }) =>
        createClient(HostService, transport).connectChannelManager(request, {
          headers: payoutAddress
            ? { "x-host-payout-address": payoutAddress }
            : undefined,
        }),
      onSuccess,
    }),
    open: useMutation(rpc.openNights, { onSuccess }),
  };
}
