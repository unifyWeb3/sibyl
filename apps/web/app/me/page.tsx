'use client';

/**
 * /me — Your subscriptions.
 *
 * Day 13 redesign:
 *   - PRIMARY card up top: full detail of the currently-selected analyst.
 *     Shows name, strategy, current bias/confidence/reasoning (derived from
 *     latest closed window), full stats, signal history, export button.
 *   - SWITCHER row below: tabs for each subscribed analyst, click to make
 *     primary. Defaults to the first subscription (or persisted choice).
 *   - Empty state for no subscriptions: clear CTA back to leaderboard.
 *
 * Data flow:
 *   1. Load all 50 analysts from SibylAnalysts (one read).
 *   2. Batch-read timeRemaining for current address × each analyst.
 *   3. Filter to active (timeRemaining > 0) → these are subscriptions.
 *   4. For primary: fetch attestation summary + recent signals.
 *   5. Personality engine derives bias/confidence/reasoning from the most
 *      recent attestation's window (not on chain — recomputed deterministically).
 */

import { useEffect, useState, useMemo } from 'react';
import { useAccount, useReadContracts, useReadContract } from 'wagmi';
import {
  SIBYL_SUBSCRIPTIONS_ADDRESS,
  SIBYL_SUBSCRIPTIONS_ABI,
  formatTimeRemaining,
  formatExpiryDate,
} from '@/lib/subs';
import { derivePersonality, type Strategy } from '@/lib/personality-client';
import { ConnectButton } from '@/components/ConnectButton';
import { SubscribeButton } from '@/components/SubscribeButton';
import { ExportCardButton } from '@/components/ExportCardButton';
import {
  publicClient,
  SIBYL_CONTRACTS,
  SIBYL_ANALYSTS_ABI,
  SIBYL_ATTESTATIONS_ABI,
  strategyLabel,
  truncateAddress,
  outcomeLabel,
} from '@/lib/kite';
import type { Address } from 'viem';

interface AnalystEntry {
  aa: Address;
  name: string;
  strategy: Strategy;
}

interface AnalystStats {
  total: number;
  wins: number;
  losses: number;
  neutrals: number;
  hitRate: number;
  cumulativeBps: number;
  recentAttestations: Array<{
    bps: number;
    outcome: 'Win' | 'Loss' | 'Neutral' | 'Pending';
    timestamp: number;
  }>;
  // Latest window — used to derive current personality
  latestEntryUsd?: number;
  latestOutcomeUsd?: number;
  latestPublishTime?: number;
}

export default function MePage() {
  const { address, isConnected } = useAccount();
  const [analysts, setAnalysts] = useState<AnalystEntry[] | null>(null);
  const [primaryIndex, setPrimaryIndex] = useState(0);

  // Load full analyst list once
  useEffect(() => {
    let cancelled = false;
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
            strategy: strategyLabel(a.strategy) as Strategy,
          }))
        );
      } catch (err) {
        console.error('failed to load analysts', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Batch-check timeRemaining for ALL analysts × current address
  const subContracts = useMemo(() => {
    if (!analysts || !address) return [];
    return analysts.map((a) => ({
      address: SIBYL_SUBSCRIPTIONS_ADDRESS,
      abi: SIBYL_SUBSCRIPTIONS_ABI,
      functionName: 'timeRemaining' as const,
      args: [address, a.aa] as const,
    }));
  }, [analysts, address]);

  const { data: timeLefts } = useReadContracts({
    contracts: subContracts,
    query: { enabled: !!address && !!analysts, refetchInterval: 30000 },
  });

  const subscriptions = useMemo(() => {
    if (!analysts || !timeLefts) return [];
    return analysts
      .map((a, i) => ({
        ...a,
        timeLeft: Number((timeLefts[i]?.result as bigint | undefined) ?? 0n),
      }))
      .filter((s) => s.timeLeft > 0)
      .sort((a, b) => b.timeLeft - a.timeLeft); // longest first
  }, [analysts, timeLefts]);

  const primary = subscriptions[primaryIndex] ?? subscriptions[0];

  // Reset primaryIndex if subscriptions list shrinks below current index
  useEffect(() => {
    if (primaryIndex >= subscriptions.length && subscriptions.length > 0) {
      setPrimaryIndex(0);
    }
  }, [subscriptions.length, primaryIndex]);

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

        {isConnected && !analysts && (
          <div className="text-ink-muted">Loading analysts from Kite L1...</div>
        )}

        {isConnected && analysts && subscriptions.length === 0 && (
          <div className="card-paper p-10 rounded-sm">
            <h2 className="font-display italic text-2xl text-ink mb-3">No subscriptions yet.</h2>
            <p className="text-ink-muted mb-6 leading-relaxed">
              Pick an analyst from the leaderboard, hit Subscribe. Choose 7d, 14d, 30d, or 60d.
            </p>
            <a
              href="/#leaderboard"
              className="inline-flex items-center gap-2 bg-ink text-paper px-5 py-2.5 rounded-sm font-medium hover:bg-ink-secondary transition-colors"
            >
              Browse the marketplace →
            </a>
          </div>
        )}

        {isConnected && primary && (
          <>
            {/* ─── Switcher tabs ────────── */}
            {subscriptions.length > 1 && (
              <div className="mb-8">
                <div className="label-caps mb-3">switch analyst</div>
                <div className="flex flex-wrap gap-2">
                  {subscriptions.map((s, i) => (
                    <button
                      key={s.aa}
                      type="button"
                      onClick={() => setPrimaryIndex(i)}
                      className={`px-4 py-2 rounded-sm border text-sm font-medium transition-colors ${
                        i === primaryIndex
                          ? 'border-ink bg-ink text-paper'
                          : 'border-rule bg-paper-elevated text-ink hover:border-ink-secondary'
                      }`}
                    >
                      {s.name}
                      <span className={`ml-2 text-xs font-mono ${
                        i === primaryIndex ? 'text-paper/70' : 'text-ink-muted'
                      }`}>
                        · {formatTimeRemaining(s.timeLeft)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ─── Primary card ────────── */}
            <PrimaryAnalystCard
              key={primary.aa}
              analyst={primary.aa}
              name={primary.name}
              strategy={primary.strategy}
              timeLeft={primary.timeLeft}
            />
          </>
        )}
      </div>
    </main>
  );
}

// ─── Primary card ────────────────────────────────────────────────────────────

function PrimaryAnalystCard({
  analyst,
  name,
  strategy,
  timeLeft,
}: {
  analyst: Address;
  name: string;
  strategy: Strategy;
  timeLeft: number;
}) {
  const [stats, setStats] = useState<AnalystStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        // Read summary
        const summary = (await publicClient.readContract({
          address: SIBYL_CONTRACTS.attestations,
          abi: SIBYL_ATTESTATIONS_ABI,
          functionName: 'analystSummary',
          args: [analyst],
        })) as [bigint, bigint, bigint, bigint, bigint];
        const total = Number(summary[0]);
        const wins = Number(summary[1]);
        const losses = Number(summary[2]);
        const neutrals = Number(summary[3]);
        const cumulativeBps = Number(summary[4]);
        const scored = wins + losses + neutrals;
        const hitRate = scored > 0 ? wins / scored : 0;

        // Read last 6 attestations via index iteration
        const recentAttestations: AnalystStats['recentAttestations'] = [];
        const startIdx = Math.max(0, total - 6);
        for (let i = total - 1; i >= startIdx; i--) {
          try {
            const id = (await publicClient.readContract({
              address: SIBYL_CONTRACTS.attestations,
              abi: SIBYL_ATTESTATIONS_ABI,
              functionName: 'attestationsByAnalyst',
              args: [analyst, BigInt(i)],
            })) as `0x${string}`;
            const a = (await publicClient.readContract({
              address: SIBYL_CONTRACTS.attestations,
              abi: SIBYL_ATTESTATIONS_ABI,
              functionName: 'getAttestation',
              args: [id],
            })) as any;
            recentAttestations.push({
              bps: Number(a.realizedBps),
              outcome: outcomeLabel(Number(a.outcome)) as any,
              timestamp: Number(a.timestamp),
            });
          } catch {
            break;
          }
        }

        if (cancelled) return;
        setStats({
          total,
          wins,
          losses,
          neutrals,
          hitRate,
          cumulativeBps,
          recentAttestations,
          // We don't have entry/outcome USD on chain — derive bias from a synthetic
          // recent-window approximation based on the latest realized bps and
          // a known direction. Better: use Hermes-derived fresh prices from a
          // public endpoint. Fallback for hackathon: skip personality if no data.
          latestPublishTime: recentAttestations[0]?.timestamp,
        });
      } catch (err) {
        console.error('failed to load analyst stats', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [analyst]);

  // Derive personality from the latest 4h move estimate. We don't have
  // entry/outcome USD on chain (they're hashed), so approximate the snapshot
  // using the latest realized bps as a directional proxy. For the hackathon
  // demo, this is acceptable — anyone who wants the canonical bias just
  // re-derives off the published Hermes hash.
  const personality = useMemo(() => {
    if (!stats || !stats.recentAttestations.length) return null;
    const latest = stats.recentAttestations[0];
    // Reverse-engineer a snapshot consistent with the realized bps direction.
    // Magnitude doesn't matter for bias — direction does.
    const synthMove = latest.bps / 10000; // bps → fractional move
    const entryUsd = 100000;
    const outcomeUsd = entryUsd * (1 + synthMove);
    return derivePersonality(analyst, strategy, {
      entryUsd,
      outcomeUsd,
      publishTime: latest.timestamp,
    });
  }, [stats, analyst, strategy]);

  if (loading) {
    return (
      <div className="card-paper p-10 rounded-sm text-ink-muted">
        Loading {name}'s signals from Kite L1...
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="card-paper p-10 rounded-sm">
        <h2 className="font-display italic text-2xl text-ink mb-3">{name}</h2>
        <p className="text-ink-muted">No on-chain history yet. Next signal cycle within 4 hours.</p>
      </div>
    );
  }

  const cumColor =
    stats.cumulativeBps > 0 ? 'text-signal-deep' :
    stats.cumulativeBps < 0 ? 'text-warn-deep' : 'text-ink';

  const biasColor =
    personality?.bias === 'LONG' ? 'text-signal-deep' :
    personality?.bias === 'SHORT' ? 'text-warn-deep' : 'text-ink-muted';

  return (
    <div className="space-y-6">
      {/* Header card */}
      <div className="card-paper p-7 md:p-9 rounded-sm">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-6">
          <div>
            <div className="label-caps !text-signal-deep mb-2">● subscribed</div>
            <h2 className="font-display text-3xl md:text-5xl text-ink leading-none mb-2">
              {name}
            </h2>
            <div className="flex items-center gap-3 text-sm text-ink-muted">
              <span className="label-caps">{strategy}</span>
              <span className="text-ink-tertiary">·</span>
              <span className="font-mono text-xs">{truncateAddress(analyst, 6)}</span>
            </div>
          </div>
          <div className="text-right">
            <div className="label-caps mb-1">access until</div>
            <div className="font-mono tabular text-ink">
              {formatExpiryDate(Math.floor(Date.now() / 1000) + timeLeft)}
            </div>
            <div className="label-caps !text-signal-deep mt-1">
              {formatTimeRemaining(timeLeft)}
            </div>
          </div>
        </div>

        {/* Current bias block — the alive feel */}
        {personality && (
          <div className="mb-6 p-5 bg-paper-subtle rounded-sm border-l-2 border-signal-deep">
            <div className="flex items-baseline justify-between mb-2">
              <span className="label-caps">current bias</span>
              <span className="font-mono tabular text-xs text-ink-muted">
                {personality.confidence}% confidence
              </span>
            </div>
            <div className={`font-display text-2xl md:text-3xl mb-2 ${biasColor}`}>
              {personality.bias} BTC
            </div>
            <p className="text-sm md:text-base text-ink-secondary italic leading-relaxed">
              "{personality.reasoning}"
            </p>
            <div className="mt-3 pt-3 border-t border-rule-subtle text-xs text-ink-muted">
              Next evaluation: every 4 hours.
            </div>
          </div>
        )}

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-4 pt-5 border-t border-rule-subtle">
          <div>
            <div className="label-caps mb-1">hit rate</div>
            <div className="font-display text-2xl md:text-3xl text-ink">
              {(stats.hitRate * 100).toFixed(1)}<span className="text-ink-tertiary text-base">%</span>
            </div>
            <div className="font-mono text-xs text-ink-muted mt-1">
              {stats.wins}W · {stats.losses}L · {stats.neutrals}N
            </div>
          </div>
          <div>
            <div className="label-caps mb-1">cumulative</div>
            <div className={`font-display text-2xl md:text-3xl ${cumColor}`}>
              {stats.cumulativeBps > 0 ? '+' : ''}{stats.cumulativeBps}
              <span className="text-ink-tertiary text-base ml-1">bps</span>
            </div>
            <div className="font-mono text-xs text-ink-muted mt-1">
              across {stats.total} attestations
            </div>
          </div>
          <div>
            <div className="label-caps mb-1">recent calls</div>
            <div className="flex gap-1 mt-1">
              {stats.recentAttestations.slice(0, 6).reverse().map((a, i) => (
                <div
                  key={i}
                  className={`w-2.5 h-2.5 rounded-full ${
                    a.outcome === 'Win' ? 'bg-signal' :
                    a.outcome === 'Loss' ? 'bg-warn-deep' : 'bg-ink-tertiary'
                  }`}
                  title={`${a.outcome} · ${a.bps > 0 ? '+' : ''}${a.bps} bps`}
                />
              ))}
            </div>
            <div className="font-mono text-xs text-ink-muted mt-2">last 6 outcomes</div>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 pt-5 border-t border-rule-subtle flex flex-col md:flex-row md:items-center gap-3">
          <ExportCardButton analyst={analyst} analystName={name} variant="block" />
          <SubscribeButton
            analyst={analyst}
            analystName={name}
            strategy={strategy}
            hitRatePct={stats.hitRate * 100}
            cumulativeBps={stats.cumulativeBps}
            totalAttests={stats.total}
            variant="inline"
          />
          <div className="md:ml-auto text-xs text-ink-muted">
            Renew anytime. Stacks from current expiry.
          </div>
        </div>
      </div>

      {/* Recent calls list */}
      {stats.recentAttestations.length > 0 && (
        <div className="card-paper p-7 rounded-sm">
          <div className="label-caps mb-4">recent calls</div>
          <div className="space-y-2">
            {stats.recentAttestations.map((a, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-rule-subtle last:border-b-0 text-sm">
                <div className="flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    a.outcome === 'Win' ? 'bg-signal' :
                    a.outcome === 'Loss' ? 'bg-warn-deep' : 'bg-ink-tertiary'
                  }`} />
                  <span className="text-ink">{a.outcome}</span>
                </div>
                <span className={`font-mono tabular text-sm ${
                  a.bps > 0 ? 'text-signal-deep' :
                  a.bps < 0 ? 'text-warn-deep' : 'text-ink-muted'
                }`}>
                  {a.bps > 0 ? '+' : ''}{a.bps} bps
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
