/**
 * Sibyl — Analyst Signal Generator
 *
 * For M4: generates deterministic stub signals with realistic structure.
 * Day 2: this gets replaced with Claude + Pyth price feed reasoning.
 */

export type MarketRegime = 'trending_up' | 'trending_down' | 'ranging' | 'volatile';
export type SignalAction = 'BUY' | 'SELL' | 'HOLD';

export interface TradingSignal {
  id: string;
  pair: string;
  action: SignalAction;
  confidence: number;          // 0-100
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  timeHorizon: string;         // e.g. "4h", "1d"
  regime: MarketRegime;
  rationale: string;
  generatedAt: string;         // ISO timestamp
  analystId: string;           // AA wallet address
}

const STUB_SIGNALS: Record<string, Omit<TradingSignal, 'id' | 'generatedAt' | 'analystId'>> = {
  'BTCUSD': {
    pair: 'BTCUSD',
    action: 'BUY',
    confidence: 74,
    entryPrice: 93_500,
    targetPrice: 97_800,
    stopLoss: 91_200,
    timeHorizon: '4h',
    regime: 'trending_up',
    rationale:
      'Funding rates normalized after three-day compression. Open interest recovering with spot flows positive. Structure supports continuation toward the 97.8k liquidity cluster.',
  },
  'ETHUSD': {
    pair: 'ETHUSD',
    action: 'HOLD',
    confidence: 58,
    entryPrice: 3_240,
    targetPrice: 3_410,
    stopLoss: 3_110,
    timeHorizon: '1d',
    regime: 'ranging',
    rationale:
      'Price consolidating in the 3,100–3,350 band for four sessions. Insufficient directional bias. Await a decisive close above 3,350 before adding exposure.',
  },
};

/**
 * Generate a trading signal for the given pair.
 * Falls back to a generic HOLD if the pair isn't in the stub set.
 */
export function generateSignal(pair: string, analystId: string): TradingSignal {
  const normalized = pair.toUpperCase().replace(/[-_\/]/, '');
  const stub = STUB_SIGNALS[normalized] ?? {
    pair: normalized,
    action: 'HOLD' as SignalAction,
    confidence: 50,
    entryPrice: 0,
    targetPrice: 0,
    stopLoss: 0,
    timeHorizon: '1d',
    regime: 'ranging' as MarketRegime,
    rationale: 'Insufficient data for high-conviction call. Standing aside.',
  };

  return {
    ...stub,
    id: `sig_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    generatedAt: new Date().toISOString(),
    analystId,
  };
}
