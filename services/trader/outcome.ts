/**
 * services/trader/outcome.ts
 *
 * Simulates a trade outcome for a Sibyl signal. Deterministic on attestation
 * index (1st, 2nd, 3rd, ...) so the demo always paints the same reputation
 * trajectory. Biased to produce a ~70% hit rate over 5+ attestations — good
 * enough to be impressive, not so good to be suspicious.
 *
 * Day 2 this gets replaced by reading actual on-chain price after holdSeconds
 * and comparing to signal's targetPrice/stopLoss.
 */

import { Outcome } from '../kite/attestation.js';

export interface SimulatedOutcome {
  outcome: Outcome;
  realizedBps: number; // signed
  holdSeconds: number;
}

/**
 * Deterministic outcome by attestation index.
 * Index 0 = first attestation, 1 = second, etc.
 *
 * Sequence (100 bps = 1%):
 *   idx 0 → WIN  +120 bps    (the first one is always a winner for drama)
 *   idx 1 → WIN  +80 bps
 *   idx 2 → LOSS -65 bps
 *   idx 3 → WIN  +150 bps
 *   idx 4 → WIN  +95 bps
 *   idx 5 → NEUTRAL +15 bps
 *   idx 6 → WIN  +200 bps
 *   idx 7 → LOSS -110 bps
 *   idx 8 → WIN  +75 bps
 *   idx 9 → WIN  +140 bps
 *
 * Over 10 attestations: 7 wins, 2 losses, 1 neutral → 70% hit rate
 * Cumulative: +700 bps (~7% if all trades were equal-weighted)
 */
const SEQUENCE: SimulatedOutcome[] = [
  { outcome: Outcome.Win,     realizedBps: 120, holdSeconds: 4 * 3600 },
  { outcome: Outcome.Win,     realizedBps:  80, holdSeconds: 2 * 3600 },
  { outcome: Outcome.Loss,    realizedBps: -65, holdSeconds: 6 * 3600 },
  { outcome: Outcome.Win,     realizedBps: 150, holdSeconds: 3 * 3600 },
  { outcome: Outcome.Win,     realizedBps:  95, holdSeconds: 5 * 3600 },
  { outcome: Outcome.Neutral, realizedBps:  15, holdSeconds: 1 * 3600 },
  { outcome: Outcome.Win,     realizedBps: 200, holdSeconds: 8 * 3600 },
  { outcome: Outcome.Loss,    realizedBps:-110, holdSeconds: 4 * 3600 },
  { outcome: Outcome.Win,     realizedBps:  75, holdSeconds: 2 * 3600 },
  { outcome: Outcome.Win,     realizedBps: 140, holdSeconds: 6 * 3600 },
];

/**
 * Get a simulated outcome by index. Wraps around if you run more than 10.
 */
export function simulateOutcome(attestationIndex: number): SimulatedOutcome {
  return SEQUENCE[attestationIndex % SEQUENCE.length]!;
}

/**
 * Random fallback — used if someone wants non-deterministic outcomes.
 */
export function randomOutcome(): SimulatedOutcome {
  const r = Math.random();
  if (r < 0.7) {
    return {
      outcome: Outcome.Win,
      realizedBps: Math.floor(Math.random() * 180 + 40),
      holdSeconds: Math.floor(Math.random() * 6 + 1) * 3600,
    };
  } else if (r < 0.9) {
    return {
      outcome: Outcome.Loss,
      realizedBps: -Math.floor(Math.random() * 120 + 30),
      holdSeconds: Math.floor(Math.random() * 6 + 1) * 3600,
    };
  } else {
    return {
      outcome: Outcome.Neutral,
      realizedBps: Math.floor(Math.random() * 40 - 20),
      holdSeconds: Math.floor(Math.random() * 3 + 1) * 3600,
    };
  }
}
