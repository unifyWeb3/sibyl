'use client';

/**
 * SubscriberCount — tiny client read showing total subscribers for an analyst.
 *
 * Renders silently as nothing while loading or if zero. When > 0, shows
 * "· N subscriber(s)" inline next to the analyst's address on the leaderboard.
 *
 * Note: totalSubscribersByAnalyst counts EVERY subscribe call, not unique
 * subscribers. Renewals stack into the count. For the demo this still reads
 * as marketplace activity which is the right signal.
 */

import { useReadContract } from 'wagmi';
import type { Address } from 'viem';
import { SIBYL_SUBSCRIPTIONS_ADDRESS, SIBYL_SUBSCRIPTIONS_ABI } from '@/lib/subs';

export function SubscriberCount({ analyst }: { analyst: Address }) {
  const { data } = useReadContract({
    address: SIBYL_SUBSCRIPTIONS_ADDRESS,
    abi: SIBYL_SUBSCRIPTIONS_ABI,
    functionName: 'totalSubscribersByAnalyst',
    args: [analyst],
  });

  const count = data ? Number(data) : 0;
  if (count === 0) return null;

  return (
    <>
      <span className="text-ink-tertiary">·</span>
      <span className="font-mono text-xs text-signal-deep">
        {count} {count === 1 ? 'sub' : 'subs'}
      </span>
    </>
  );
}
