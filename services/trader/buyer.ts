/**
 * Sibyl — Trader Signal Buyer
 *
 * Full x402 purchase loop:
 *  1. Hit Analyst endpoint → receive 402
 *  2. Execute on-chain USDT transfer via userOp
 *  3. Re-hit Analyst with X-Payment header containing tx hash
 *  4. Analyst verifies on-chain, returns signal
 */

import { type TradingSignal } from '../analyst/signal.js';
import { payForSignal, type TraderConfig } from './payment.js';

export interface BuyResult {
  signal:              TradingSignal;
  paymentTxHash:       string;
  timings:             { payment_ms: number; signal_ms: number; total_ms: number };
  traderBalanceBefore: string;
  traderBalanceAfter:  string;
  analystBalanceBefore: string;
  analystBalanceAfter:  string;
}

export async function buySignal(
  analystUrl:   string,
  pair:         string,
  traderConfig: TraderConfig,
): Promise<BuyResult> {
  const t0      = Date.now();
  const endpoint = `${analystUrl}/api/signal?pair=${pair}`;

  // ── Step 1: Hit analyst, expect 402
  console.log(`  [trader]   → GET ${endpoint}`);
  const resp1 = await fetch(endpoint);

  if (resp1.status !== 402) {
    throw new Error(`Expected 402, got ${resp1.status} from Analyst`);
  }

  const body402 = await resp1.json() as any;
  console.log(`  [trader]   ← 402 received. Price: ${body402.accepts?.[0]?.maxAmountRequired ?? '?'} wei`);

  // ── Step 2: Execute on-chain payment
  console.log(`  [trader]   → executing on-chain USDT transfer...`);
  const t1 = Date.now();
  const {
    proof,
    xPaymentHeader,
    traderBalanceBefore,
    traderBalanceAfter,
    analystBalanceBefore,
    analystBalanceAfter,
  } = await payForSignal(traderConfig);
  const paymentMs = Date.now() - t1;

  // ── Step 3: Re-hit analyst with payment proof
  console.log(`  [trader]   → GET ${endpoint} [with X-Payment]`);
  const t2 = Date.now();
  const resp2 = await fetch(endpoint, {
    headers: { 'X-Payment': xPaymentHeader },
  });

  if (!resp2.ok) {
    const errBody = await resp2.text();
    throw new Error(`Analyst rejected payment: ${resp2.status} — ${errBody}`);
  }

  const body200  = await resp2.json() as any;
  const signalMs = Date.now() - t2;
  const totalMs  = Date.now() - t0;

  const signal: TradingSignal = body200.signal;

  return {
    signal,
    paymentTxHash: proof.txHash,
    timings: { payment_ms: paymentMs, signal_ms: signalMs, total_ms: totalMs },
    traderBalanceBefore,
    traderBalanceAfter,
    analystBalanceBefore,
    analystBalanceAfter,
  };
}
