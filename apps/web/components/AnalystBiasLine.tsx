'use client';

/**
 * AnalystBiasLine — public bias/confidence/reasoning for any analyst.
 *
 * Renders one line under the analyst's name on the leaderboard:
 *
 *   SHORT BTC · 70% "Fading euphoria at resistance."
 *
 * Logic:
 *   - Fetch the latest on-chain attestation for this analyst
 *   - Reconstruct a synthetic snapshot from the realized bps direction
 *   - Run the personality engine (same deterministic function used by cron)
 *   - Result is identical to what the cron computed last cycle
 *
 * No API call. No paywall. This is the emotional layer that makes the
 * marketplace feel alive — judges see distinct personalities in 2 seconds.
 *
 * Render gracefully on missing data:
 *   - No attestations yet → "Awaiting first signal"
 *   - Fetch failed → render nothing (silent — the rest of the row still works)
 */

import { useEffect, useState } from 'react';
import { derivePersonality, type Strategy } from '@/lib/personality-client';
import { getLatestSnapshotForAnalyst } from '@/lib/kite';
import type { Address } from 'viem';

interface AnalystBiasLineProps {
  analyst: Address;
  strategy: Strategy;
  hasHistory: boolean;
}

interface BiasState {
  bias: 'LONG' | 'SHORT' | 'NEUTRAL';
  confidence: number;
  reasoning: string;
}

export function AnalystBiasLine({ analyst, strategy, hasHistory }: AnalystBiasLineProps) {
  const [state, setState] = useState<BiasState | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!hasHistory) {
      setLoaded(true);
      return;
    }
    (async () => {
      try {
        const snap = await getLatestSnapshotForAnalyst(analyst);
        if (cancelled) return;
        if (!snap) {
          setLoaded(true);
          return;
        }
        const p = derivePersonality(analyst, strategy, snap);
        setState({ bias: p.bias, confidence: p.confidence, reasoning: p.reasoning });
      } catch {
        // silent
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [analyst, strategy, hasHistory]);

  if (!loaded) return null;

  if (!hasHistory) {
    return (
      <div className="mt-2 text-xs text-ink-tertiary italic">
        Awaiting first signal
      </div>
    );
  }

  if (!state) return null;

  const biasColor =
    state.bias === 'LONG' ? 'text-signal-deep' :
    state.bias === 'SHORT' ? 'text-warn-deep' :
    'text-ink-muted';

  return (
    <div className="mt-1.5 flex items-baseline gap-2 text-xs leading-relaxed">
      <span className={`font-mono font-medium ${biasColor}`}>
        {state.bias} BTC
      </span>
      <span className="font-mono text-ink-muted tabular">
        · {state.confidence}%
      </span>
      <span className="text-ink-secondary italic truncate">
        "{state.reasoning}"
      </span>
    </div>
  );
}
