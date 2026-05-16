'use client';

/**
 * LiveStatusBanner — surfaces autonomous loop health publicly.
 *
 * Reads the most recent attestation timestamp on chain and shows:
 *   ● LIVE          — last attestation < 5h ago (4h cron cadence + 1h grace)
 *   ⚠ RECOVERING    — 5h to 12h ago (one missed cycle, expect catch-up)
 *   ⚠ COLD          — > 12h ago (system unhealthy, honest signal)
 *
 * Polls every 60s. Renders nothing while loading to avoid flash.
 *
 * Placement: directly under page header. Sticky? No — judges scroll past hero
 * quickly. Inline at top works.
 */

import { useEffect, useState } from 'react';
import { getLatestAttestationTimestamp } from '@/lib/kite';

type Status = 'live' | 'recovering' | 'cold' | 'unknown';

function ageString(seconds: number): string {
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function statusFromAge(ageSec: number): Status {
  if (ageSec <= 0) return 'unknown';
  if (ageSec < 5 * 3600) return 'live';
  if (ageSec < 12 * 3600) return 'recovering';
  return 'cold';
}

export function LiveStatusBanner() {
  const [lastTs, setLastTs] = useState<number | null>(null);
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      const ts = await getLatestAttestationTimestamp();
      if (!cancelled) setLastTs(ts);
    }
    poll();
    const id = setInterval(poll, 60_000);
    const tick = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
      clearInterval(tick);
    };
  }, []);

  if (lastTs === null) return null;
  if (lastTs === 0) {
    return (
      <div className="border-b border-rule-subtle bg-paper-subtle">
        <div className="max-w-[1400px] mx-auto px-6 md:px-12 py-2 flex items-center justify-between label-caps">
          <span className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-ink-tertiary" />
            no attestations yet
          </span>
          <span className="hidden md:inline">autonomous cron runs every 4h</span>
        </div>
      </div>
    );
  }

  const ageSec = Math.max(0, now - lastTs);
  const status = statusFromAge(ageSec);

  const config = {
    live: {
      dot: 'bg-signal animate-pulse-soft',
      label: '● LIVE',
      labelColor: 'text-signal-deep',
      detail: `Last attestation ${ageString(ageSec)}`,
    },
    recovering: {
      dot: 'bg-warn animate-pulse-soft',
      label: '⚠ RECOVERING',
      labelColor: 'text-warn-deep',
      detail: `Last attestation ${ageString(ageSec)} · cron catches up at next cycle`,
    },
    cold: {
      dot: 'bg-warn-deep',
      label: '⚠ COLD',
      labelColor: 'text-warn-deep',
      detail: `Last attestation ${ageString(ageSec)} · cron disrupted`,
    },
    unknown: {
      dot: 'bg-ink-tertiary',
      label: 'STATUS',
      labelColor: 'text-ink-muted',
      detail: 'reading chain...',
    },
  }[status];

  return (
    <div className="border-b border-rule-subtle bg-paper-subtle">
      <div className="max-w-[1400px] mx-auto px-6 md:px-12 py-2 flex items-center justify-between gap-3 label-caps">
        <span className="flex items-center gap-2 flex-shrink-0">
          <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
          <span className={config.labelColor}>{config.label}</span>
        </span>
        <span className="text-ink-muted text-right truncate">{config.detail}</span>
      </div>
    </div>
  );
}
