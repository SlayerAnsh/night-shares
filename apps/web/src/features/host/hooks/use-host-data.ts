"use client";
import {
  createConnectQueryKey,
  useMutation,
  useQuery,
} from "@connectrpc/connect-query";
import { CatalogService } from "@night-shares/proto/catalog/v1/catalog_pb";
import { getProperty } from "@night-shares/proto/catalog/v1/catalog-CatalogService_connectquery";
import { HostService } from "@night-shares/proto/host/v1/host_pb";
import * as rpc from "@night-shares/proto/host/v1/host-HostService_connectquery";
import { MarketService } from "@night-shares/proto/market/v1/market_pb";
import { StayService } from "@night-shares/proto/stay/v1/stay_pb";
import { WalletService } from "@night-shares/proto/wallet/v1/wallet_pb";
import { getBalance } from "@night-shares/proto/wallet/v1/wallet-WalletService_connectquery";
import { useQueryClient } from "@tanstack/react-query";

export const usePortfolio = () => useQuery(rpc.getPortfolio);
export const useHotel = (propertyId: string, month = "") =>
  useQuery(rpc.getHotel, { propertyId, month });
export const useNight = (propertyId: string, date: string) =>
  useQuery(rpc.getNight, { propertyId, date });
export const usePayout = (propertyId: string) =>
  useQuery(rpc.getPayout, { propertyId });
export const useBalance = () => useQuery(getBalance);
export const useProperty = (propertyId: string) =>
  useQuery(getProperty, { propertyId });

export function useHostMutations() {
  const client = useQueryClient();
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
    connect: useMutation(rpc.connectChannelManager, { onSuccess }),
    open: useMutation(rpc.openNights, { onSuccess }),
  };
}
