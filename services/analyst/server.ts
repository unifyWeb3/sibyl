/**
 * Sibyl — Analyst x402 Server
 *
 * Implements x402 Payment Required protocol.
 * Payment verification happens on Kite L1 directly — we read the tx receipt
 * and look for an ERC-20 Transfer event. No facilitator dependency.
 *
 *   GET /api/signal?pair=BTCUSD                   → 402 Payment Required
 *   GET /api/signal?pair=BTCUSD + X-Payment hdr   → 200 Signal JSON
 *   GET /health                                    → 200 { status: 'ok' }
 */

import express, { type Request, type Response, type Express } from 'express';
import { JsonRpcProvider, parseUnits } from 'ethers';
import { generateSignal, type TradingSignal } from './signal.js';

// ─── Config ──────────────────────────────────────────────────────────────────

const PORT = 8099;
const SIGNAL_PRICE_USDT = '0.005';
const SIGNAL_PRICE_WEI = parseUnits(SIGNAL_PRICE_USDT, 18);
const MAX_TIMEOUT_SECONDS = 300;

// keccak256("Transfer(address,address,uint256)")
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AnalystServerConfig {
  analystAddress: string;
  usdtAddress: string;
  rpcUrl: string;
}

interface PaymentHeader {
  txHash: string;
  from: string;
  to: string;
  amount: string;
  token: string;
  network: string;
  paidAt: string;
}

// ─── Payment verification ────────────────────────────────────────────────────

async function verifyOnChainPayment(
  provider: JsonRpcProvider,
  header: PaymentHeader,
  expectedTo: string,
  expectedToken: string,
  minimumAmount: bigint
): Promise<{ ok: boolean; reason?: string }> {
  const receipt = await provider.getTransactionReceipt(header.txHash);
  if (!receipt) {
    return { ok: false, reason: `tx ${header.txHash} not found on chain` };
  }
  if (receipt.status !== 1) {
    return { ok: false, reason: `tx ${header.txHash} reverted` };
  }

  for (const log of receipt.logs) {
    if (
      log.address.toLowerCase() !== expectedToken.toLowerCase() ||
      log.topics[0] !== TRANSFER_TOPIC ||
      log.topics.length < 3
    ) {
      continue;
    }

    // ERC-20 Transfer(address indexed from, address indexed to, uint256 value)
    const logTo = '0x' + log.topics[2].slice(26);
    const logValue = BigInt(log.data);

    if (
      logTo.toLowerCase() === expectedTo.toLowerCase() &&
      logValue >= minimumAmount
    ) {
      return { ok: true };
    }
  }

  return {
    ok: false,
    reason: `no Transfer to ${expectedTo} of ≥${SIGNAL_PRICE_USDT} USDT in tx logs`,
  };
}

// ─── 402 payment requirements body ───────────────────────────────────────────

function buildPaymentRequirements(
  analystAddress: string,
  usdtAddress: string,
  resource: string
) {
  return {
    x402Version: 2,
    accepts: [
      {
        scheme: 'exact',
        network: 'eip155:2368',
        maxAmountRequired: SIGNAL_PRICE_WEI.toString(),
        resource,
        description: 'Sibyl analyst signal — pay per call, attested on Kite',
        mimeType: 'application/json',
        payTo: analystAddress,
        maxTimeoutSeconds: MAX_TIMEOUT_SECONDS,
        asset: usdtAddress,
        extra: null,
        merchantName: 'Sibyl Analyst Agent',
      },
    ],
  };
}

// ─── Parse X-Payment header ──────────────────────────────────────────────────

function parseXPaymentHeader(raw: string | undefined): PaymentHeader | null {
  if (!raw) return null;

  // Try base64-decoded JSON first (our Trader emits this)
  try {
    const decoded = Buffer.from(raw, 'base64').toString('utf-8');
    const parsed = JSON.parse(decoded);
    if (parsed.txHash) return parsed as PaymentHeader;
  } catch {
    // fall through
  }

  // Fallback: raw JSON (for debugging / manual testing)
  try {
    const parsed = JSON.parse(raw);
    if (parsed.txHash) return parsed as PaymentHeader;
  } catch {
    // fall through
  }

  return null;
}

// ─── Server factory ──────────────────────────────────────────────────────────

export function createAnalystServer(config: AnalystServerConfig): Express {
  const { analystAddress, usdtAddress, rpcUrl } = config;
  const provider = new JsonRpcProvider(rpcUrl);
  const app = express();

  let requestCount = 0;

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', agent: 'analyst', address: analystAddress });
  });

  app.get('/api/signal', async (req: Request, res: Response) => {
    const requestId = ++requestCount;
    const pair = (req.query.pair as string) || 'BTCUSD';
    const resource = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    const xPayment = req.headers['x-payment'] as string | undefined;

    console.log(
      `  [analyst]  #${requestId} ← GET /api/signal?pair=${pair}${
        xPayment ? ' (with payment)' : ' (no payment)'
      }`
    );

    // No payment header → return 402
    if (!xPayment) {
      const requirements = buildPaymentRequirements(analystAddress, usdtAddress, resource);
      res.status(402).json({
        error: 'X-Payment header required',
        ...requirements,
      });
      console.log(`  [analyst]  #${requestId} → 402 sent. Price: ${SIGNAL_PRICE_USDT} USDT`);
      return;
    }

    // Payment header present → parse and verify on-chain
    const payment = parseXPaymentHeader(xPayment);
    if (!payment) {
      res.status(400).json({ error: 'Could not parse X-Payment header' });
      console.log(`  [analyst]  #${requestId} ✗ malformed X-Payment header`);
      return;
    }

    console.log(`  [analyst]  #${requestId} → verifying tx ${payment.txHash.slice(0, 12)}... on Kite L1`);

    const verification = await verifyOnChainPayment(
      provider,
      payment,
      analystAddress,
      usdtAddress,
      SIGNAL_PRICE_WEI
    );

    if (!verification.ok) {
      console.log(`  [analyst]  #${requestId} ✗ payment invalid: ${verification.reason}`);
      res.status(402).json({
        error: 'Payment verification failed',
        reason: verification.reason,
        ...buildPaymentRequirements(analystAddress, usdtAddress, resource),
      });
      return;
    }

    // Verified → generate and return signal
    console.log(`  [analyst]  #${requestId} ✓ payment verified on-chain`);
    const signal: TradingSignal = generateSignal(pair, analystAddress);
    console.log(
      `  [analyst]  #${requestId} ✓ signal: ${signal.action} ${signal.pair} (conf ${signal.confidence}%)`
    );

    res.json({ signal, paymentTxHash: payment.txHash });
  });

  return app;
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────

export async function startAnalystServer(
  config: AnalystServerConfig
): Promise<() => Promise<void>> {
  const app = createAnalystServer(config);

  return new Promise((resolve) => {
    const server = app.listen(PORT, () => {
      console.log(`  [analyst]  listening on http://localhost:${PORT}`);
      console.log(`  [analyst]  payTo: ${config.analystAddress}`);
      console.log(`  [analyst]  price: ${SIGNAL_PRICE_USDT} USDT per signal`);

      const stop = () =>
        new Promise<void>((res) => {
          server.close(() => res());
        });

      resolve(stop);
    });
  });
}
