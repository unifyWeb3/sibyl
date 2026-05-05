'use client';

/**
 * /me — Your subscriptions page.
 *
 * Connects user's wallet, then for each registered analyst checks isSubscribed().
 * Shows active subscriptions with countdown timers + signal preview.
 *
 * Listing strategy: we fetch all 50 analysts from SibylAnalysts and check
 * subscription status for each. For 10-50 analysts this is fine. For 1000+
 * we'd switch to event log queries (Subscribed events filtered by subscriber).
 */

import { useEffect, useState } from 'react';
import { useAccount, useReadContracts } from 'wagmi';
import {
  SIBYL_SUBSCRIPTIONS_ADDRESS,
  SIBYL_SUBSCRIPTIONS_ABI,
  formatTimeRemaining,
} from '@/lib/subs';
import { ConnectButton } from '@/components/ConnectButton';
import { SubscribeButton } from '@/components/SubscribeButton';
import {
  publicClient,
  SIBYL_CONTRACTS,
  SIBYL_ANALYSTS_ABI,
  strategyLabel,
  truncateAddress,
} from '@/lib/kite';
import type { Address } from 'viem';

interface AnalystEntry {
  aa: Address;
  name: string;
  strategy: string;
}

export default function MePage() {
  const { address, isConnected } = useAccount();
  const [analysts, setAnalysts] = useState<AnalystEntry[] | null>(null);
  const [loading, setLoading] = useState(false);

  // Load analyst list once on mount
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const list = (await publicClient.readContract({
          address: SIBYL_CONTRACTS.analysts,
          abi: SIBYL_ANALYSTS_ABI,
          functionName: 'analystsPaged',
          args: [0n, 50n],
        })) as readonly { aa: Address; name: string; strategy: number }[];
        if (cancelled) return;
        setAnalysts(
          list.map((a) => ({
            aa: a.aa,
            name: a.name,
            strategy: strategyLabel(a.strategy),
          }))
        );
      } catch (err) {
        console.error('failed to load analysts', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Batch-check subscriptions for all analysts
  const subContracts = analysts && address
    ? analysts.map((a) => ({
        address: SIBYL_SUBSCRIPTIONS_ADDRESS,
        abi: SIBYL_SUBSCRIPTIONS_ABI,
        functionName: 'timeRemaining' as const,
        args: [address, a.aa] as const,
      }))
    : [];

  const { data: timeLefts } = useReadContracts({
    contracts: subContracts,
    query: { enabled: !!address && !!analysts },
  });

  const subscriptions =
    analysts && timeLefts
      ? analysts
          .map((a, i) => ({
            ...a,
            timeLeft: Number((timeLefts[i]?.result as bigint | undefined) ?? 0n),
          }))
          .filter((s) => s.timeLeft > 0)
      : [];

  return (
    <main className="min-h-screen bg-paper">
      <div className="max-w-[1100px] mx-auto px-6 md:px-12 py-12 md:py-16">
        <header className="flex items-center justify-between mb-12 pb-6 border-b border-rule">
          <a href="/" className="label-caps hover:text-ink transition-colors">
            ← Sibyl
          </a>
          <ConnectButton />
        </header>

        <div className="label-caps mb-3">your subscriptions</div>
        <h1 className="font-display text-h1 mb-3">My signals.</h1>
        <p className="text-base md:text-lg text-ink-secondary leading-relaxed max-w-xl mb-12">
          Every analyst you're paying to follow. Live signals as they fire.
        </p>

        {!isConnected && (
          <div className="card-paper p-10 rounded-sm text-center">
            <p className="text-ink-muted mb-6">Connect your wallet to see your subscriptions.</p>
            <ConnectButton />
          </div>
        )}

        {isConnected && loading && (
          <div className="text-ink-muted">Loading analysts from Kite L1...</div>
        )}

        {isConnected && !loading && subscriptions.length === 0 && (
          <div className="card-paper p-10 rounded-sm">
            <h2 className="font-display italic text-2xl text-ink mb-3">No subscriptions yet.</h2>
            <p className="text-ink-muted mb-6 leading-relaxed">
              Pick an analyst from the leaderboard, hit Subscribe. 0.5 USDT for 30 days of signals.
            </p>
            <a
              href="/#leaderboard"
              className="inline-flex items-center gap-2 bg-ink text-paper px-5 py-2.5 rounded-sm font-medium hover:bg-ink-secondary transition-colors"
            >
              Browse the marketplace →
            </a>
          </div>
        )}

        {isConnected && subscriptions.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {subscriptions.map((s) => (
              <div key={s.aa} className="card-paper p-7 rounded-sm">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="font-display italic text-2xl text-ink leading-tight">
                      {s.name}
                    </div>
                    <div className="label-caps mt-1">{s.strategy}</div>
                  </div>
                  <span className="label-caps !text-signal-deep">● live</span>
                </div>

                <div className="space-y-2 text-sm pt-4 border-t border-rule-subtle mb-5">
                  <div className="flex justify-between">
                    <span className="label-caps">aa</span>
                    <span className="font-mono text-ink-muted">{truncateAddress(s.aa, 6)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="label-caps">subscription</span>
                    <span className="font-mono text-signal-deep tabular">
                      {formatTimeRemaining(s.timeLeft)}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col md:flex-row gap-2">
                  <a
                    href={`/api/signals/${s.aa}?as=${address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 inline-flex items-center justify-center gap-2 bg-ink text-paper px-4 py-2 rounded-sm text-sm font-medium hover:bg-ink-secondary transition-colors"
                  >
                    View signals →
                  </a>
                  <SubscribeButton analyst={s.aa} analystName={s.name} variant="inline" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
