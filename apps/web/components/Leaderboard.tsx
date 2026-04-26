/**
 * Leaderboard — ranked table of all registered Sibyl analysts.
 * Server component, reads via lib/kite.ts loadLeaderboard().
 */

import { type AnalystEntry, EXPLORER, formatBps, truncateAddress } from '@/lib/kite';

interface LeaderboardProps {
  entries: AnalystEntry[];
}

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
  if (entries.length === 0) {
    return (
      <div className="card-paper p-12 text-center text-ink-muted rounded-sm">
        Loading analysts from Kite L1…
      </div>
    );
  }

  return (
    <div className="border border-rule-subtle rounded-sm overflow-hidden bg-paper-elevated shadow-card">
      {/* Header */}
      <div className="grid grid-cols-12 gap-3 px-5 py-3.5 bg-paper-subtle border-b border-rule-subtle label-caps">
        <div className="col-span-1">#</div>
        <div className="col-span-4">analyst</div>
        <div className="col-span-2 text-right">hit rate</div>
        <div className="col-span-2 text-right">cumulative</div>
        <div className="col-span-1 text-right">attests</div>
        <div className="col-span-2 text-right">status</div>
      </div>

      {entries.map((e) => {
        const isLeader = e.rank === 1 && e.hasHistory;
        const cumColor = e.cumulativeBps > 0 ? 'text-signal-deep' : e.cumulativeBps < 0 ? 'text-warn-deep' : 'text-ink-muted';

        return (
          <a
            key={e.aa}
            href={`${EXPLORER}/address/${e.aa}`}
            target="_blank"
            rel="noopener noreferrer"
            className="grid grid-cols-12 gap-3 px-5 py-5 items-center border-b border-rule-subtle last:border-b-0 hover:bg-paper-subtle transition-colors group relative"
          >
            {/* Leader accent bar */}
            {isLeader && (
              <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-signal" aria-hidden />
            )}

            {/* Rank */}
            <div className="col-span-1 font-mono tabular text-sm text-ink-muted">
              {String(e.rank).padStart(3, '0')}
            </div>

            {/* Analyst — name + strategy glyph + truncated address */}
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
              </div>
            </div>

            {/* Hit rate */}
            <div className="col-span-2 text-right">
              {e.hasHistory ? (
                <div className="font-mono tabular text-lg text-ink">
                  {(e.hitRate * 100).toFixed(1)}<span className="text-ink-tertiary">%</span>
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
            <div className="col-span-2 text-right">
              {e.hasHistory ? (
                <span className="label-caps !text-signal-deep">live ↗</span>
              ) : (
                <span className="label-caps !text-ink-tertiary">just joined</span>
              )}
            </div>
          </a>
        );
      })}

      {/* Footer */}
      <div className="grid grid-cols-12 gap-3 px-5 py-3 bg-paper-subtle border-t border-rule-subtle label-caps">
        <div className="col-span-6 flex items-center gap-2">
          <span className="w-1 h-1 bg-signal-deep rounded-full animate-pulse-soft" />
          {entries.length} analyst{entries.length === 1 ? '' : 's'} · ranked by cumulative bps
        </div>
        <div className="col-span-6 text-right">re-reads every 10s</div>
      </div>
    </div>
  );
}
