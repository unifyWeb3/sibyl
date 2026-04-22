/**
 * services/analyst/server.ts
 *
 * Runs an x402-compliant HTTP server on localhost:8099.
 * GET /api/signal without X-Payment header → returns 402 Payment Required
 * GET /api/signal with valid X-Payment → verifies + settles via Pieverse, returns signal JSON
 *
 * This is the Analyst agent's "service endpoint" — the monetizable surface area
 * of its expertise. Trader pays $0.005 USDT per signal.
 */

import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'http';
import { parseUnits, formatUnits } from 'ethers';
import { ofetch } from 'ofetch';
import { generateSignal } from './signal.ts';
import type { AgentRecord } from '../kite/registry.ts';
import { KITE_ADDRESSES } from '../kite/kitepass.ts';

const PORT = 8099;
const PRICE_USDT = '0.005'; // per signal, in whole USDT
const PRICE_WEI = parseUnits(PRICE_USDT, 18);

interface PaymentPayload {
  x402Version: number;
  scheme: string;
  network: string;
  payload: {
    signature: string;
    authorization: {
      from: string;
      to: string;
      token: string;
      value: string;
      validAfter: string;
      validBefore: string;
      nonce: string;
    };
    sessionId?: string;
  };
}

/** Build the Payment Required response for x402 discovery */
function buildPaymentRequirements(analystPayTo: string) {
  return {
    error: 'X-PAYMENT header is required',
    accepts: [
      {
        scheme: 'gokite-aa',
        network: 'kite-testnet',
        maxAmountRequired: PRICE_WEI.toString(),
        resource: `http://localhost:${PORT}/api/signal`,
        description: 'Sibyl Analyst — structured trading signal (pair, action, confidence, rationale)',
        mimeType: 'application/json',
        outputSchema: {
          input: {
            discoverable: true,
            method: 'GET',
            queryParams: {
              pair: { description: 'Asset pair (e.g. BTC/USDT)', required: false, type: 'string' },
            },
            type: 'http',
          },
          output: {
            properties: {
              id: { type: 'string' },
              pair: { type: 'string' },
              action: { type: 'string', enum: ['BUY', 'SELL', 'HOLD'] },
              confidence: { type: 'number' },
              targetPrice: { type: 'number' },
              rationale: { type: 'string' },
            },
            required: ['id', 'pair', 'action', 'confidence'],
            type: 'object',
          },
        },
        payTo: analystPayTo,
        maxTimeoutSeconds: 300,
        asset: KITE_ADDRESSES.SETTLEMENT_TOKEN,
        extra: null,
        merchantName: 'Sibyl Analyst',
      },
    ],
    x402Version: 1,
  };
}

function sendJson(res: ServerResponse, status: number, body: object) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'X-Payment, Content-Type');
  res.end(JSON.stringify(body));
}

/**
 * Verify + settle a payment via Pieverse facilitator.
 *
 * The facilitator expects the envelope:
 *   { x402Version, paymentPayload, paymentRequirements }
 * where paymentRequirements is the exact accepts[] option the client selected.
 */
async function settlePayment(
  paymentPayload: PaymentPayload,
  paymentRequirements: ReturnType<typeof buildPaymentRequirements>['accepts'][0]
): Promise<{ ok: boolean; info?: any; error?: string }> {
  const facilitatorUrl = process.env.KITE_FACILITATOR_URL || 'https://facilitator.pieverse.io';

  const envelope = {
    x402Version: 1,
    paymentPayload,
    paymentRequirements,
  };

  try {
    // Step 1 — verify signature
    const verifyRes = await ofetch<any>(`${facilitatorUrl}/v2/verify`, {
      method: 'POST',
      body: envelope,
      timeout: 10_000,
      ignoreResponseError: true,
    });

    if (verifyRes?.isValid === false || verifyRes?.error) {
      return { ok: false, error: `verify failed: ${JSON.stringify(verifyRes)}` };
    }

    // Step 2 — settle on-chain
    const settleRes = await ofetch<any>(`${facilitatorUrl}/v2/settle`, {
      method: 'POST',
      body: envelope,
      timeout: 30_000,
      ignoreResponseError: true,
    });

    if (settleRes?.success === false || settleRes?.error) {
      return { ok: false, error: `settle failed: ${JSON.stringify(settleRes)}` };
    }

    return { ok: true, info: settleRes };
  } catch (err: any) {
    return { ok: false, error: `facilitator error: ${err.message || String(err)}` };
  }
}

/** Build the HTTP handler with closures over analyst identity */
function buildHandler(analyst: AgentRecord) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url || '/', `http://localhost:${PORT}`);

    // Health check
    if (url.pathname === '/health') {
      return sendJson(res, 200, { ok: true, analyst: analyst.aaAddress });
    }

    // Signal endpoint
    if (url.pathname === '/api/signal') {
      const xPayment = req.headers['x-payment'];

      // No payment header → return 402
      if (!xPayment) {
        console.log(`  [analyst]  402 ← ${req.method} ${url.pathname} (no payment header)`);
        return sendJson(res, 402, buildPaymentRequirements(analyst.aaAddress));
      }

      // Decode payment payload
      let paymentPayload: PaymentPayload;
      try {
        const decoded = Buffer.from(xPayment as string, 'base64').toString('utf-8');
        paymentPayload = JSON.parse(decoded);
      } catch (err) {
        return sendJson(res, 400, { error: 'invalid X-Payment header encoding' });
      }

      // Verify basic shape — amount, recipient, token
      const auth = paymentPayload.payload?.authorization;
      if (!auth) {
        return sendJson(res, 400, { error: 'malformed payment payload' });
      }
      if (auth.to.toLowerCase() !== analyst.aaAddress.toLowerCase()) {
        return sendJson(res, 400, { error: `wrong recipient: expected ${analyst.aaAddress}` });
      }
      if (auth.token.toLowerCase() !== KITE_ADDRESSES.SETTLEMENT_TOKEN.toLowerCase()) {
        return sendJson(res, 400, { error: 'wrong token' });
      }
      if (BigInt(auth.value) < PRICE_WEI) {
        return sendJson(res, 400, {
          error: `insufficient amount: ${formatUnits(auth.value, 18)} < ${PRICE_USDT}`,
        });
      }

      console.log(`  [analyst]  → received X-Payment from ${auth.from.slice(0, 10)}...`);
      console.log(`  [analyst]  → value: ${formatUnits(auth.value, 18)} Test USDT`);
      console.log(`  [analyst]  → calling Pieverse /v2/settle...`);

      // Settle via facilitator — we pass both the payload AND the requirements
      // we advertised in the 402, which the facilitator uses to verify the match.
      const requirements = buildPaymentRequirements(analyst.aaAddress).accepts[0];
      const settlement = await settlePayment(paymentPayload, requirements);
      if (!settlement.ok) {
        console.log(`  [analyst]  ✗ settlement failed: ${settlement.error}`);
        return sendJson(res, 402, {
          error: 'payment settlement failed',
          details: settlement.error,
        });
      }

      console.log(`  [analyst]  ✓ settled on-chain — generating signal...`);

      // Deliver the signal
      const pair = url.searchParams.get('pair') || undefined;
      const signal = generateSignal(pair);

      return sendJson(res, 200, {
        signal,
        paidBy: auth.from,
        paidAmount: formatUnits(auth.value, 18),
        settledTxHash: settlement.info?.transactionHash || settlement.info?.txHash,
      });
    }

    sendJson(res, 404, { error: 'not found' });
  };
}

export async function startAnalystServer(analyst: AgentRecord): Promise<Server> {
  return new Promise((resolve) => {
    const server = createServer(buildHandler(analyst));
    server.listen(PORT, () => {
      console.log(`  [analyst]  listening on http://localhost:${PORT}`);
      console.log(`  [analyst]  payTo address: ${analyst.aaAddress}`);
      console.log(`  [analyst]  price per signal: ${PRICE_USDT} USDT`);
      resolve(server);
    });
  });
}

export function stopAnalystServer(server: Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

export const ANALYST_URL = `http://localhost:${PORT}`;
export { PRICE_USDT, PRICE_WEI };
