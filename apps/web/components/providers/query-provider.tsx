'use client';

import {
  isServer,
  QueryClient,
  QueryClientProvider,
  type DefaultOptions,
} from '@tanstack/react-query';

import { ApiClientError } from '@/lib/api-client';

const defaultQueryOptions: DefaultOptions = {
  queries: {
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry(failureCount, error) {
      if (error instanceof ApiClientError && error.status >= 400 && error.status < 500) {
        return false;
      }

      return failureCount < 1;
    },
  },
  mutations: {
    retry: false,
  },
};

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: defaultQueryOptions,
  });

let browserQueryClient: QueryClient | undefined;

const getQueryClient = () => {
  if (isServer) {
    return createQueryClient();
  }

  browserQueryClient ??= createQueryClient();
  return browserQueryClient;
};

export function QueryProvider({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={getQueryClient()}>{children}</QueryClientProvider>;
}
