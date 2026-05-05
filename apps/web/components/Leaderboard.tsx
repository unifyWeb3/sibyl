'use client';

/**
 * Leaderboard — ranked table of all registered Sibyl analysts.
 *
 * Day 9 changes:
 *   - Show first 5 by default, "Show more" reveals 5 at a time.
 *   - Mobile (under 768px): rows stack as cards, no horizontal scroll.
 *   - Server-fetched data passed in as props from page.tsx (unchanged contract).
 */

import { useState } from 'react';
import { type AnalystEntry, EXPLORER, formatBps, truncateAddress } from '@/lib/kite';
import { SubscribeButton } from './SubscribeButton';
import { SubscriberCount } from './SubscriberCount';

interface LeaderboardProps {
  entries: AnalystEntry[];
}

const PAGE_SIZE = 5;

const STRATEGY_GLYPHS: Record<string, React.ReactNode> = {
  Bear: (
    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.25">
      <path d="M 3 12 L 8 4 L 13 12" />
    </svg>
  ),
  Chaser: (
    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.25">
      <path d="M 2 12 L 6 7 L 10 9 L 14 4" />
      <path d="M 11 4 L 14 4 L 14 7" />
    </svg>
  ),
  Reverter: (
    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.25">
      <path d="M 2 8 Q 5 2, 8 8 T 14 8" />
    </svg>
  ),
  Custom: (
    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.25">
      <circle cx="8" cy="8" r="5" />
    </svg>
  ),
};

function CrownGlyph() {
  return (
    <svg viewBox="0 0 16 16" className="w-3 h-3 inline-block" fill="currentColor">
      <path d="M 1 5 L 4 9 L 8 3 L 12 9 L 15 5 L 13 13 L 3 13 Z" />
    </svg>
  );
}

export function Leaderboard({ entries }: LeaderboardProps) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  if (entries.length === 0) {
    return (
      <div className="card-paper p-12 text-center text-ink-muted rounded-sm">
        Loading analysts from Kite L1…
      </div>
    );
  }

  const visible = entries.slice(0, visibleCount);
  const hasMore = visibleCount < entries.length;
  const remaining = entries.length - visibleCount;

  return (
    <div className="border border-rule-subtle rounded-sm overflow-hidden bg-paper-elevated shadow-card">
      {/* Header — desktop only */}
      <div className="hidden md:grid grid-cols-12 gap-3 px-5 py-3.5 bg-paper-subtle border-b border-rule-subtle label-caps">
        <div className="col-span-1">#</div>
        <div className="col-span-4">analyst</div>
        <div className="col-span-2 text-right">hit rate</div>
        <div className="col-span-2 text-right">cumulative</div>
        <div className="col-span-1 text-right">attests</div>
        <div className="col-span-2 text-right">status</div>
      </div>

      {visible.map((e) => {
        const isLeader = e.rank === 1 && e.hasHistory;
        const cumColor =
          e.cumulativeBps > 0
            ? 'text-signal-deep'
            : e.cumulativeBps < 0
              ? 'text-warn-deep'
              : 'text-ink-muted';

        return (
          <a
            key={e.aa}
            href={`${EXPLORER}/address/${e.aa}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block md:grid md:grid-cols-12 gap-3 px-5 py-5 md:items-center border-b border-rule-subtle last:border-b-0 hover:bg-paper-subtle transition-colors group relative"
          >
            {/* Leader accent bar */}
            {isLeader && (
              <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-signal" aria-hidden />
            )}

            {/* MOBILE LAYOUT — stacked card */}
            <div className="md:hidden">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono tabular text-xs text-ink-muted">
                      #{String(e.rank).padStart(3, '0')}
                    </span>
                    <div className="font-display italic text-xl text-ink leading-tight">
                      {e.name}
                    </div>
                    {isLeader && (
                      <span className="text-signal-deep" title="Leader">
                        <CrownGlyph />
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-ink-muted">
                    <span className="opacity-70">{STRATEGY_GLYPHS[e.strategy]}</span>
                    <span className="label-caps !text-ink-muted">{e.strategy}</span>
                    <span className="text-ink-tertiary">·</span>
                    <span className="font-mono text-xs text-ink-tertiary">
                      {truncateAddress(e.aa, 4)}
                    </span>
                    <SubscriberCount analyst={e.aa} />
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  {e.hasHistory ? (
                    <span className="label-caps !text-signal-deep">live ↗</span>
                  ) : (
                    <span className="label-caps !text-ink-tertiary">just joined</span>
                  )}
                </div>
              </div>

              {/* Mobile stat row — only show when there's history */}
              {e.hasHistory && (
                <div className="flex items-center gap-5 mt-3 pt-3 border-t border-rule-subtle">
                  <div>
                    <div className="label-caps mb-0.5 text-[0.6rem]">hit rate</div>
                    <div className="font-mono tabular text-base text-ink">
                      {(e.hitRate * 100).toFixed(1)}
                      <span className="text-ink-tertiary">%</span>
                    </div>
                  </div>
                  <div>
                    <div className="label-caps mb-0.5 text-[0.6rem]">cumulative</div>
                    <div className={`font-mono tabular text-base ${cumColor}`}>
                      {formatBps(e.cumulativeBps)}
                    </div>
                  </div>
                  <div>
                    <div className="label-caps mb-0.5 text-[0.6rem]">attests</div>
                    <div className="font-mono tabular text-base text-ink">{e.total}</div>
                  </div>
                </div>
              )}

              {/* Mobile subscribe row */}
              <div
                className="mt-3 pt-3 border-t border-rule-subtle"
                onClick={(ev) => {
                  ev.preventDefault();
                  ev.stopPropagation();
                }}
              >
                <SubscribeButton
                  analyst={e.aa}
                  analystName={e.name}
                  variant="inline"
                  hasHistory={e.hasHistory}
                />
              </div>
            </div>

            {/* DESKTOP LAYOUT — 12-col grid */}
            <div className="hidden md:contents">
              {/* Rank */}
              <div className="col-span-1 font-mono tabular text-sm text-ink-muted">
                {String(e.rank).padStart(3, '0')}
              </div>

              {/* Analyst */}
              <div className="col-span-4">
                <div className="flex items-center gap-2">
                  <div className="font-display italic text-xl md:text-2xl text-ink leading-tight">
                    {e.name}
                  </div>
                  {isLeader && (
                    <span className="text-signal-deep" title="Leader">
                      <CrownGlyph />
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1.5 text-ink-muted">
                  <span className="opacity-70">{STRATEGY_GLYPHS[e.strategy]}</span>
                  <span className="label-caps !text-ink-muted">{e.strategy}</span>
                  <span className="text-ink-tertiary">·</span>
                  <span className="font-mono text-xs text-ink-tertiary">
                    {truncateAddress(e.aa, 4)}
                  </span>
                  <SubscriberCount analyst={e.aa} />
                </div>
              </div>

              {/* Hit rate */}
              <div className="col-span-2 text-right">
                {e.hasHistory ? (
                  <div className="font-mono tabular text-lg text-ink">
                    {(e.hitRate * 100).toFixed(1)}
                    <span className="text-ink-tertiary">%</span>
                  </div>
                ) : (
                  <div className="font-mono text-lg text-ink-tertiary">—</div>
                )}
              </div>

              {/* Cumulative */}
              <div className="col-span-2 text-right">
                {e.hasHistory ? (
                  <div className={`font-mono tabular text-lg ${cumColor}`}>
                    {formatBps(e.cumulativeBps)}
                  </div>
                ) : (
                  <div className="font-mono text-lg text-ink-tertiary">—</div>
                )}
              </div>

              {/* Attestations count */}
              <div className="col-span-1 text-right font-mono tabular text-sm text-ink-muted">
                {e.total}
              </div>

              {/* Status */}
              <div className="col-span-2 text-right flex items-center justify-end gap-2">
                {e.hasHistory ? (
                  <span className="label-caps !text-signal-deep">live ↗</span>
                ) : (
                  <span className="label-caps !text-ink-tertiary">just joined</span>
                )}
                <span
                  onClick={(ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                  }}
                >
                  <SubscribeButton
                    analyst={e.aa}
                    analystName={e.name}
                    variant="inline"
                    hasHistory={e.hasHistory}
                  />
                </span>
              </div>
            </div>
          </a>
        );
      })}

      {/* Show more / Footer */}
      {hasMore ? (
        <div className="px-5 py-4 bg-paper-subtle border-t border-rule-subtle flex items-center justify-between gap-3">
          <span className="label-caps">
            showing {visibleCount} of {entries.length}
          </span>
          <button
            type="button"
            onClick={() => setVisibleCount((c) => Math.min(c + PAGE_SIZE, entries.length))}
            className="group inline-flex items-center gap-2 text-sm font-medium text-ink hover:text-signal-deep transition-colors"
          >
            Show {Math.min(PAGE_SIZE, remaining)} more
            <span className="text-signal-deep group-hover:translate-y-0.5 transition-transform">↓</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 px-5 py-3 bg-paper-subtle border-t border-rule-subtle label-caps">
          <div className="md:col-span-6 flex items-center gap-2">
            <span className="w-1 h-1 bg-signal-deep rounded-full animate-pulse-soft" />
            {entries.length} analyst{entries.length === 1 ? '' : 's'} · ranked by cumulative bps
          </div>
          <div className="md:col-span-6 md:text-right">re-reads every 10s</div>
        </div>
      )}
    </div>
  );
}
