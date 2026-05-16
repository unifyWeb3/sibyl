/**
 * Personality engine — turns an analyst's strategy + seed into a recognizable
 * market personality.
 *
 * Day 13a v2 fix:
 *   - Lower personal threshold range from [0.1%, 0.5%] to [0.01%, 0.08%]
 *   - Crypto 4h moves on testnet are often 0.05-0.3%; old thresholds made
 *     everyone go NEUTRAL. New range commits ~70% of analysts on moves >0.05%.
 *
 * Determinism preserved. Same inputs → same outputs.
 */

import { keccak256, toUtf8Bytes } from 'ethers';

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
  const h = keccak256(toUtf8Bytes(`${analystAa.toLowerCase()}:${key}`));
  const slice = h.slice(-8);
  return parseInt(slice, 16) / 0xffffffff;
}

function seededPick<T>(analystAa: string, key: string, arr: readonly T[]): T {
  const r = seededFloat(analystAa, key);
  return arr[Math.floor(r * arr.length)];
}

const REASONING_BEAR_BULLISH_WINDOW = [
  'Pump appears extended — fading euphoria.',
  'Buyers exhausted at resistance. Short bias.',
  'Vertical move; mean reversion likely.',
  'Counter-trend setup forming. Fading the rally.',
  'Topping signals on momentum oscillators.',
  'Market overbought; structural short.',
];

const REASONING_BEAR_BEARISH_WINDOW = [
  'Trend confirms thesis. Holding short.',
  'Breakdown momentum building. Adding to bias.',
  'Lower highs intact. Continuation expected.',
  'Distribution phase clear. Short conviction high.',
  'Bearish structure preserved.',
  'Sellers in control — trend trade.',
];

const REASONING_CHASER_BULLISH = [
  'Momentum accelerating above 4h average.',
  'Breakout confirmed. Riding the move.',
  'Strength persists; trend trade.',
  'Volume expansion on green candles.',
  'Higher highs forming. Following through.',
  'Range break held. Chasing strength.',
];

const REASONING_CHASER_BEARISH = [
  'Downward momentum building. Following.',
  'Breakdown clean — riding the decline.',
  'Lower highs structure intact.',
  'Selling pressure persistent.',
  'Trend continuation setup. Short.',
  'Failure to bounce; momentum short.',
];

const REASONING_REVERTER_BULLISH = [
  'Rally appears stretched. Fading the extension.',
  'Overbought conditions; mean reversion play.',
  'Vertical move unsustainable. Short.',
  'RSI extreme; expecting pullback.',
  'Move is too clean to last.',
  'Counter-trend; fade the spike.',
];

const REASONING_REVERTER_BEARISH = [
  'Capitulation flush. Buying weakness.',
  'Oversold; bounce setup forming.',
  'Sellers exhausted at support.',
  'Reversal candle on lower timeframe.',
  'Mean-reversion long here.',
  'Selling climax; fading the dump.',
];

const REASONING_NEUTRAL = [
  'Range-bound. Waiting for direction.',
  'No clean signal. Standing aside.',
  'Choppy tape; sitting out.',
  'Volatility too low to commit.',
  'Awaiting better setup.',
  'Indecisive structure; neutral stance.',
];

export function derivePersonality(
  analystAa: string,
  strategy: Strategy,
  snapshot: MarketSnapshot
): Personality {
  const movePct = (snapshot.outcomeUsd - snapshot.entryUsd) / snapshot.entryUsd;
  const movePctAbs = Math.abs(movePct);
  const went: 'up' | 'down' | 'flat' =
    movePct > 0.0001 ? 'up' : movePct < -0.0001 ? 'down' : 'flat';

  // FIXED: was [0.001, 0.005] = 0.1%-0.5%. Crypto 4h moves on testnet are
  // typically 0.03-0.3%, so most analysts went NEUTRAL. New range is
  // [0.0001, 0.0008] = 0.01%-0.08%, much more honest about typical volatility.
  const personalThreshold = 0.0001 + seededFloat(analystAa, 'threshold') * 0.0007;

  let direction: 'long' | 'short';
  let bias: Bias;
  let baseConfidence: number;
  let templates: readonly string[];

  switch (strategy) {
    case 'Bear': {
      direction = 'short';
      bias = 'SHORT';
      if (went === 'up') {
        baseConfidence = 60 + Math.min(30, movePctAbs * 4000);
        templates = REASONING_BEAR_BULLISH_WINDOW;
      } else if (went === 'down') {
        baseConfidence = 50 + Math.min(20, movePctAbs * 3000);
        templates = REASONING_BEAR_BEARISH_WINDOW;
      } else {
        baseConfidence = 40;
        templates = REASONING_NEUTRAL;
        bias = 'NEUTRAL';
      }
      break;
    }

    case 'Chaser': {
      if (movePctAbs < personalThreshold) {
        bias = 'NEUTRAL';
        direction = seededFloat(analystAa, 'tiebreaker') > 0.5 ? 'long' : 'short';
        baseConfidence = 35 + Math.floor(seededFloat(analystAa, 'neutral_conf') * 15);
        templates = REASONING_NEUTRAL;
      } else if (went === 'up') {
        bias = 'LONG';
        direction = 'long';
        baseConfidence = 55 + Math.min(35, movePctAbs * 5000);
        templates = REASONING_CHASER_BULLISH;
      } else {
        bias = 'SHORT';
        direction = 'short';
        baseConfidence = 55 + Math.min(35, movePctAbs * 5000);
        templates = REASONING_CHASER_BEARISH;
      }
      break;
    }

    case 'Reverter': {
      if (movePctAbs < personalThreshold) {
        bias = 'NEUTRAL';
        direction = seededFloat(analystAa, 'tiebreaker') > 0.5 ? 'long' : 'short';
        baseConfidence = 30 + Math.floor(seededFloat(analystAa, 'neutral_conf') * 15);
        templates = REASONING_NEUTRAL;
      } else if (went === 'up') {
        bias = 'SHORT';
        direction = 'short';
        baseConfidence = 50 + Math.min(35, movePctAbs * 4500);
        templates = REASONING_REVERTER_BULLISH;
      } else {
        bias = 'LONG';
        direction = 'long';
        baseConfidence = 50 + Math.min(35, movePctAbs * 4500);
        templates = REASONING_REVERTER_BEARISH;
      }
      break;
    }

    default: {
      bias = 'NEUTRAL';
      direction = 'short';
      baseConfidence = 30;
      templates = REASONING_NEUTRAL;
    }
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
