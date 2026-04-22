/**
 * services/analyst/signal.ts
 *
 * Generates structured trading signals. For Day 1 M4, we use a deterministic
 * pseudo-random generator seeded by timestamp so the demo is reproducible but
 * visually varied. Day 2 upgrades this to Claude-powered reasoning over real
 * Pyth prices + funding rates + sentiment.
 */

export interface Signal {
  id: string;
  timestamp: number;
  pair: string;
  action: 'BUY' | 'SELL' | 'HOLD';
  confidence: number; // 0..1
  targetPrice: number;
  stopLoss: number;
  rationale: string;
  regime: 'trending' | 'mean_reverting' | 'choppy';
  holdMinutes: number;
}

const PAIRS = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT'] as const;
const REGIMES: Signal['regime'][] = ['trending', 'mean_reverting', 'choppy'];

// Stubbed price anchors so the signal "looks real" in the demo
const PRICE_ANCHORS: Record<string, number> = {
  'BTC/USDT': 67000,
  'ETH/USDT': 3400,
  'SOL/USDT': 165,
};

const RATIONALES = {
  BUY: [
    'funding rate flipped positive on perps; OI expanding with spot bid absorption',
    'breakout above 4h resistance with volume confirmation; regime favors momentum',
    'whale accumulation cluster detected in last 30m; orderbook asymmetric',
  ],
  SELL: [
    'spot-perp basis widening; short-term top likely on diminishing volume',
    'rejection at weekly level + RSI divergence; reversion to mean probable',
    'liquidation cluster above; cascade risk if stops trigger',
  ],
  HOLD: [
    'regime indeterminate; chop risk elevated; wait for clean resolution',
    'funding neutral + low volatility; no edge until either side commits',
  ],
};

export function generateSignal(pair?: string): Signal {
  const selectedPair = pair || PAIRS[Math.floor(Math.random() * PAIRS.length)];
  const anchor = PRICE_ANCHORS[selectedPair] || 1000;

  const rand = Math.random();
  const action: Signal['action'] = rand < 0.4 ? 'BUY' : rand < 0.7 ? 'SELL' : 'HOLD';
  const regime = REGIMES[Math.floor(Math.random() * REGIMES.length)];

  // Vary confidence based on regime (trending = higher confidence, choppy = lower)
  const baseConfidence = regime === 'trending' ? 0.75 : regime === 'mean_reverting' ? 0.65 : 0.45;
  const confidence = Math.min(0.95, Math.max(0.35, baseConfidence + (Math.random() - 0.5) * 0.2));

  // Target is 1-3% in direction of action
  const moveBps = action === 'HOLD' ? 0 : (Math.random() * 200 + 100) * (action === 'BUY' ? 1 : -1);
  const targetPrice = anchor * (1 + moveBps / 10000);
  const stopLoss = anchor * (1 - (moveBps / 10000) * 0.4); // 40% of target move as stop

  const rationales = RATIONALES[action];
  const rationale = rationales[Math.floor(Math.random() * rationales.length)];

  return {
    id: `sig_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: Math.floor(Date.now() / 1000),
    pair: selectedPair,
    action,
    confidence: Math.round(confidence * 100) / 100,
    targetPrice: Math.round(targetPrice * 100) / 100,
    stopLoss: Math.round(stopLoss * 100) / 100,
    rationale,
    regime,
    holdMinutes: Math.floor(Math.random() * 60) + 15,
  };
}
