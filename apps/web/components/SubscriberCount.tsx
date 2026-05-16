'use client';

/**
 * SubscriberCount — silently renders nothing when count is 0.
 *
 * Day 14: avoid signaling "nobody uses this" — better to show nothing
 * until at least one subscriber exists.
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
