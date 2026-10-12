/**
 * useRenewals
 * Subscriptions merged with their live billing checks. The checks run once per
 * hub open: the result is never considered stale and is not refetched on focus,
 * so moving between pages reuses it until the hub is reloaded. The page and the
 * reminder pop-up share the same query, so it only runs once for both.
 */
'use client';

import { useMemo } from 'react';
import { api } from '@/trpc/react';
import { getRenewals } from '@/lib/subscriptions';

export function useRenewals(options: { enabled?: boolean } = {}) {
  const { data: live, isLoading, isError } = api.subscriptions.getLive.useQuery(undefined, {
    enabled: options.enabled ?? true,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });

  const renewals = useMemo(() => getRenewals(new Date(), live ?? {}), [live]);

  return { renewals, liveLoading: isLoading, liveFailed: isError };
}
