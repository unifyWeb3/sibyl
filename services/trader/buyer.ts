/**
 * services/trader/buyer.ts
 *
 * The Trader agent's x402 payment flow.
 *
 * Given a service URL:
 *   1. GET → expect 402 Payment Required with accepts[]
 *   2. Pick kite-testnet option, build EIP-712 TransferWithAuthorization
 *   3. Sign with EOA (acts on behalf of the AA wallet)
 *   4. Resend request with X-Payment header (base64 payload)
 *   5. Return the service response
 *
 * The signed authorization is what the facilitator later settles on-chain.
 * Settlement moves USDT from Trader's AA wallet → Analyst's AA wallet.
 */

import { randomBytes, hexlify, Wallet, parseUnits, formatUnits } from 'ethers';
import { ofetch } from 'ofetch';
import type { AgentRecord } from '../kite/registry.ts';

const TRANSFER_AUTH_TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'token', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
};

function getEIP712Domain(aaWallet: string, chainId: bigint) {
  return {
    name: 'GokiteAccount',
    version: '1',
    chainId,
    verifyingContract: aaWallet,
  };
}

export interface BuySignalResult {
  success: boolean;
  signal?: any;
  paidAmount?: string;
  settledTxHash?: string;
  error?: string;
  // Timing breakdown for demo display
  timings?: {
    request402Ms: number;
    signMs: number;
    requestPaidMs: number;
    totalMs: number;
  };
}

/**
 * Execute the full x402 buy flow against a service URL.
 */
export async function buySignal(params: {
  serviceUrl: string;
  endpoint: string; // e.g. '/api/signal?pair=BTC/USDT'
  trader: AgentRecord;
  signerWallet: Wallet; // EOA — signs on behalf of the AA wallet
  chainId: bigint;
}): Promise<BuySignalResult> {
  const { serviceUrl, endpoint, trader, signerWallet, chainId } = params;
  const startTotal = Date.now();

  // ── Step 1: unpaid request, expect 402 ──
  const t1 = Date.now();
  let paymentReqs: any;
  try {
    const initialRes = await ofetch<any>(`${serviceUrl}${endpoint}`, {
      ignoreResponseError: true,
    });
    // ofetch auto-parses. We need the raw 402 body, so fall through to fetch.
    paymentReqs = initialRes;
  } catch (err) {
    return { success: false, error: `initial request failed: ${err}` };
  }

  // ofetch's ignoreResponseError returns body on non-2xx. The 402 body shape:
  // { accepts: [...], x402Version, error }
  if (!paymentReqs?.accepts || !Array.isArray(paymentReqs.accepts)) {
    return { success: false, error: `no 402 accepts: ${JSON.stringify(paymentReqs).slice(0, 200)}` };
  }

  const kiteOption = paymentReqs.accepts.find((a: any) => a.network === 'kite-testnet');
  if (!kiteOption) {
    return {
      success: false,
      error: `no kite-testnet option in 402 accepts (available: ${paymentReqs.accepts.map((a: any) => a.network).join(', ')})`,
    };
  }
  const request402Ms = Date.now() - t1;

  // ── Step 2: build + sign EIP-712 authorization ──
  const t2 = Date.now();
  const nonce = hexlify(randomBytes(32));
  const now = BigInt(Math.floor(Date.now() / 1000));
  const auth = {
    from: trader.aaAddress,
    to: kiteOption.payTo,
    token: kiteOption.asset,
    value: BigInt(kiteOption.maxAmountRequired),
    validAfter: now - 60n,
    validBefore: now + 3600n,
    nonce,
  };

  const domain = getEIP712Domain(trader.aaAddress, chainId);
  const signature = await signerWallet.signTypedData(domain, TRANSFER_AUTH_TYPES, auth);
  const signMs = Date.now() - t2;

  const paymentPayload = {
    x402Version: 1,
    scheme: 'gokite-aa',
    network: kiteOption.network,
    payload: {
      signature,
      authorization: {
        from: auth.from,
        to: auth.to,
        token: auth.token,
        value: auth.value.toString(),
        validAfter: auth.validAfter.toString(),
        validBefore: auth.validBefore.toString(),
        nonce: auth.nonce,
      },
      sessionId: trader.kitepassAddress || trader.aaAddress,
    },
  };

  // ── Step 3: resend with X-Payment header ──
  const t3 = Date.now();
  const xPayment = Buffer.from(JSON.stringify(paymentPayload)).toString('base64');

  let paidRes: any;
  try {
    paidRes = await ofetch<any>(`${serviceUrl}${endpoint}`, {
      headers: { 'X-Payment': xPayment },
      ignoreResponseError: true,
      timeout: 45_000,
    });
  } catch (err: any) {
    return { success: false, error: `paid request failed: ${err.message || err}` };
  }
  const requestPaidMs = Date.now() - t3;

  if (paidRes?.error) {
    return {
      success: false,
      error: `service returned error: ${paidRes.error}${paidRes.details ? ' — ' + paidRes.details : ''}`,
    };
  }

  if (!paidRes?.signal) {
    return { success: false, error: `unexpected response shape: ${JSON.stringify(paidRes).slice(0, 200)}` };
  }

  return {
    success: true,
    signal: paidRes.signal,
    paidAmount: paidRes.paidAmount,
    settledTxHash: paidRes.settledTxHash,
    timings: {
      request402Ms,
      signMs,
      requestPaidMs,
      totalMs: Date.now() - startTotal,
    },
  };
}
