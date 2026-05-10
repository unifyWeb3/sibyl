/**
 * Browser-side personality engine. Mirror of services/personality/index.ts
 * but using viem's keccak256 instead of ethers (so it bundles small).
 *
 * Used by the frontend to show:
 *   - "current bias" (LONG/SHORT/NEUTRAL) on each analyst card
 *   - confidence percentage
 *   - reasoning text
 *
 * Inputs: analyst.aa + current BTC snapshot (entry/outcome USD)
 *
 * The browser doesn't have the actual outcome 4h before it lands, so we use
 * the LAST closed window — same one the cron will attest. This means:
 *   - Until next cron fires: shows bias for the previous window (matches the
 *     latest attestation on chain — internally consistent).
 *   - After next cron: chain attestation is canonical.
 *
 * For the UI's "current intent" line, this gives users a real preview that
 * lines up with the latest signal. No fake forecasting.
 */

import { keccak256, toBytes, type Address } from 'viem';

export type Strategy = 'Bear' | 'Chaser' | 'Reverter' | 'Custom';
export type Bias = 'LONG' | 'SHORT' | 'NEUTRAL';

export interface MarketSnapshot {
  entryUsd: number;
  outcomeUsd: number;
  publishTime?: number;
}

export interface Personality {
  bias: Bias;
  confidence: number;
  reasoning: string;
  direction: 'long' | 'short';
}

function seededFloat(analystAa: string, key: string): number {
  const h = keccak256(toBytes(`${analystAa.toLowerCase()}:${key}`));
  const slice = h.slice(-8);
  return parseInt(slice, 16) / 0xffffffff;
}

function seededPick<T>(analystAa: string, key: string, arr: readonly T[]): T {
  const r = seededFloat(analystAa, key);
  return arr[Math.floor(r * arr.length)];
}

const BEAR_BULLISH = [
  'Pump appears extended — fading euphoria.',
  'Buyers exhausted at resistance. Short bias.',
  'Vertical move; mean reversion likely.',
  'Counter-trend setup forming. Fading the rally.',
  'Topping signals on momentum oscillators.',
  'Market overbought; structural short.',
];
const BEAR_BEARISH = [
  'Trend confirms thesis. Holding short.',
  'Breakdown momentum building. Adding to bias.',
  'Lower highs intact. Continuation expected.',
  'Distribution phase clear. Short conviction high.',
  'Bearish structure preserved.',
  'Sellers in control — trend trade.',
];
const CHASER_BULLISH = [
  'Momentum accelerating above 4h average.',
  'Breakout confirmed. Riding the move.',
  'Strength persists; trend trade.',
  'Volume expansion on green candles.',
  'Higher highs forming. Following through.',
  'Range break held. Chasing strength.',
];
const CHASER_BEARISH = [
  'Downward momentum building. Following.',
  'Breakdown clean — riding the decline.',
  'Lower highs structure intact.',
  'Selling pressure persistent.',
  'Trend continuation setup. Short.',
  'Failure to bounce; momentum short.',
];
const REVERTER_BULLISH = [
  'Rally appears stretched. Fading the extension.',
  'Overbought conditions; mean reversion play.',
  'Vertical move unsustainable. Short.',
  'RSI extreme; expecting pullback.',
  'Move is too clean to last.',
  'Counter-trend; fade the spike.',
];
const REVERTER_BEARISH = [
  'Capitulation flush. Buying weakness.',
  'Oversold; bounce setup forming.',
  'Sellers exhausted at support.',
  'Reversal candle on lower timeframe.',
  'Mean-reversion long here.',
  'Selling climax; fading the dump.',
];
const NEUTRAL = [
  'Range-bound. Waiting for direction.',
  'No clean signal. Standing aside.',
  'Choppy tape; sitting out.',
  'Volatility too low to commit.',
  'Awaiting better setup.',
  'Indecisive structure; neutral stance.',
];

export function derivePersonality(
  analystAa: Address | string,
  strategy: Strategy,
  snapshot: MarketSnapshot
): Personality {
  const movePct = (snapshot.outcomeUsd - snapshot.entryUsd) / snapshot.entryUsd;
  const movePctAbs = Math.abs(movePct);
  const went: 'up' | 'down' | 'flat' =
    movePct > 0.0001 ? 'up' : movePct < -0.0001 ? 'down' : 'flat';

  const personalThreshold = 0.0001 + seededFloat(analystAa, 'threshold') * 0.0007;

  let direction: 'long' | 'short';
  let bias: Bias;
  let baseConfidence: number;
  let templates: readonly string[];

  switch (strategy) {
    case 'Bear':
      direction = 'short';
      if (went === 'up') {
        bias = 'SHORT';
        baseConfidence = 60 + Math.min(30, movePctAbs * 4000);
        templates = BEAR_BULLISH;
      } else if (went === 'down') {
        bias = 'SHORT';
        baseConfidence = 50 + Math.min(20, movePctAbs * 3000);
        templates = BEAR_BEARISH;
      } else {
        bias = 'NEUTRAL';
        baseConfidence = 40;
        templates = NEUTRAL;
      }
      break;

    case 'Chaser':
      if (movePctAbs < personalThreshold) {
        bias = 'NEUTRAL';
        direction = seededFloat(analystAa, 'tiebreaker') > 0.5 ? 'long' : 'short';
        baseConfidence = 35 + Math.floor(seededFloat(analystAa, 'neutral_conf') * 15);
        templates = NEUTRAL;
      } else if (went === 'up') {
        bias = 'LONG';
        direction = 'long';
        baseConfidence = 55 + Math.min(35, movePctAbs * 5000);
        templates = CHASER_BULLISH;
      } else {
        bias = 'SHORT';
        direction = 'short';
        baseConfidence = 55 + Math.min(35, movePctAbs * 5000);
        templates = CHASER_BEARISH;
      }
      break;

    case 'Reverter':
      if (movePctAbs < personalThreshold) {
        bias = 'NEUTRAL';
        direction = seededFloat(analystAa, 'tiebreaker') > 0.5 ? 'long' : 'short';
        baseConfidence = 30 + Math.floor(seededFloat(analystAa, 'neutral_conf') * 15);
        templates = NEUTRAL;
      } else if (went === 'up') {
        bias = 'SHORT';
        direction = 'short';
        baseConfidence = 50 + Math.min(35, movePctAbs * 4500);
        templates = REVERTER_BULLISH;
      } else {
        bias = 'LONG';
        direction = 'long';
        baseConfidence = 50 + Math.min(35, movePctAbs * 4500);
        templates = REVERTER_BEARISH;
      }
      break;

    default:
      bias = 'NEUTRAL';
      direction = 'short';
      baseConfidence = 30;
      templates = NEUTRAL;
  }

  const confVariance = (seededFloat(analystAa, 'conf_variance') - 0.5) * 10;
  const confidence = Math.max(10, Math.min(95, Math.round(baseConfidence + confVariance)));

  const reasoning = seededPick(
    analystAa,
    `reason:${snapshot.publishTime ?? 0}`,
    templates
  );

  return { bias, confidence, reasoning, direction };
}
