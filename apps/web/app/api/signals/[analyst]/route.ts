/**
 * GET /api/signals/[analyst]?as=0x<subscriber>
 *
 * Returns recent signals (= attestations) for an analyst. Behaves as an x402
 * paywall:
 *   - If `as` is missing or invalid → 400
 *   - If `as` is not subscribed to `analyst` → 402 Payment Required + price hint
 *   - If subscribed → 200 with last N attestations including outcomes
 *
 * Note: `as` is read-only. A spoofed value can VIEW data, not act on chain.
 * For production, replace with SIWE-signed cookie after challenge. For
 * hackathon demo, on-chain check is enough.
 */

import { NextRequest } from 'next/server';
import {
  publicClient,
  SIBYL_CONTRACTS,
  SIBYL_ATTESTATIONS_ABI,
  outcomeLabel,
} from '@/lib/kite';
import {
  SIBYL_SUBSCRIPTIONS_ADDRESS,
  SIBYL_SUBSCRIPTIONS_ABI,
  PRICE_PER_PERIOD_WEI,
} from '@/lib/subs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { analyst: string } }
) {
  const analyst = params.analyst as `0x${string}`;
  const subscriber = req.nextUrl.searchParams.get('as') as `0x${string}` | null;

  if (!analyst || !/^0x[a-fA-F0-9]{40}$/.test(analyst)) {
    return Response.json({ error: 'invalid analyst address' }, { status: 400 });
  }
  if (!subscriber || !/^0x[a-fA-F0-9]{40}$/.test(subscriber)) {
    return Response.json(
      {
        error: 'wallet required',
        hint: 'connect your wallet, then pass it as ?as=0x...',
      },
      { status: 400 }
    );
  }

  // ─── Verify subscription on-chain ──
  let isSub = false;
  try {
    isSub = (await publicClient.readContract({
      address: SIBYL_SUBSCRIPTIONS_ADDRESS,
      abi: SIBYL_SUBSCRIPTIONS_ABI,
      functionName: 'isSubscribed',
      args: [subscriber, analyst],
    })) as boolean;
  } catch (err: any) {
    return Response.json(
      { error: `subscription check failed: ${err.message ?? 'unknown'}` },
      { status: 502 }
    );
  }

  if (!isSub) {
    // x402 paywall — return Payment Required with price hint
    return Response.json(
      {
        error: 'subscription required',
        analyst,
        priceWei: PRICE_PER_PERIOD_WEI.toString(),
        priceHuman: '0.5 USDT',
        periodDays: 30,
        contract: SIBYL_SUBSCRIPTIONS_ADDRESS,
        hint: 'subscribe via /api/.. UI or call SibylSubscriptions.subscribe(analyst)',
      },
      {
        status: 402,
        headers: {
          'x-payment-required': 'true',
          'x-payment-amount': PRICE_PER_PERIOD_WEI.toString(),
          'x-payment-currency': 'USDT',
          'x-payment-contract': SIBYL_SUBSCRIPTIONS_ADDRESS,
        },
      }
    );
  }

  // ─── Subscribed → fetch recent signals ──
  try {
    const total = (await publicClient.readContract({
      address: SIBYL_CONTRACTS.attestations,
      abi: SIBYL_ATTESTATIONS_ABI,
      functionName: 'analystSummary',
      args: [analyst],
    })) as [bigint, bigint, bigint, bigint, bigint];

    const totalN = Number(total[0]);
    if (totalN === 0) {
      return Response.json({
        analyst,
        subscribed: true,
        signals: [],
        message: 'No signals fired yet. The cron runs every 4h.',
      });
    }

    // Last 20 signals — walk indices descending
    const start = Math.max(0, totalN - 20);
    const signals = [];
    for (let i = totalN - 1; i >= start; i--) {
      try {
        const id = (await publicClient.readContract({
          address: SIBYL_CONTRACTS.attestations,
          abi: SIBYL_ATTESTATIONS_ABI,
          functionName: 'attestationsByAnalyst',
          args: [analyst, BigInt(i)],
        })) as `0x${string}`;
        const a = (await publicClient.readContract({
          address: SIBYL_CONTRACTS.attestations,
          abi: SIBYL_ATTESTATIONS_ABI,
          functionName: 'getAttestation',
          args: [id],
        })) as any;
        signals.push({
          id,
          signalId: a.signalId,
          realizedBps: Number(a.realizedBps),
          holdSeconds: Number(a.holdSeconds),
          outcome: outcomeLabel(Number(a.outcome)),
          timestamp: Number(a.timestamp),
          priceUpdateHash: a.priceUpdateHash,
        });
      } catch {
        // skip missing
      }
    }

    return Response.json({
      analyst,
      subscribed: true,
      signals,
      total: totalN,
    });
  } catch (err: any) {
    return Response.json(
      { error: `signal fetch failed: ${err.message ?? 'unknown'}` },
      { status: 502 }
    );
  }
}
