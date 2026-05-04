/**
 * GET /api/reputation-card?aa=0x...
 *
 * Returns an SVG reputation card for the given analyst AA address.
 * Pulls live on-chain state from SibylAttestationsV2 + SibylAnalysts.
 * Browser shows it inline; right-click → save downloads as .svg.
 *
 * For Twitter/CT shareability, SVG works for direct image embeds and
 * preserves crisp typography at any zoom level.
 */

import { NextRequest } from 'next/server';
import {
  publicClient,
  SIBYL_CONTRACTS,
  SIBYL_ATTESTATIONS_ABI,
  SIBYL_ANALYSTS_ABI,
  outcomeLabel,
  strategyLabel,
} from '@/lib/kite';
import { renderReputationCardSvg, type ReputationCardData } from '@/lib/reputation-card-svg';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Cache for 60s — reputation doesn't change that fast
export const revalidate = 60;

export async function GET(req: NextRequest) {
  const aa = req.nextUrl.searchParams.get('aa') as `0x${string}` | null;

  if (!aa || !/^0x[a-fA-F0-9]{40}$/.test(aa)) {
    return new Response('invalid analyst address', { status: 400 });
  }

  try {
    // ─── Read analyst metadata from registry ──
    const analyst = (await publicClient.readContract({
      address: SIBYL_CONTRACTS.analysts,
      abi: SIBYL_ANALYSTS_ABI,
      functionName: 'getAnalyst',
      args: [aa],
    })) as { aa: string; name: string; strategy: number; creator: string; createdAt: bigint };

    if (!analyst.name || analyst.aa === '0x0000000000000000000000000000000000000000') {
      return new Response('analyst not registered', { status: 404 });
    }

    // ─── Compute rank from full leaderboard ──
    // (Rank = position when sorted by hasHistory desc, cumBps desc, total desc)
    const allAnalysts = (await publicClient.readContract({
      address: SIBYL_CONTRACTS.analysts,
      abi: SIBYL_ANALYSTS_ABI,
      functionName: 'analystsPaged',
      args: [0n, 50n],
    })) as readonly { aa: string; name: string; strategy: number; creator: string; createdAt: bigint }[];

    // ─── Read attestation summary for THIS analyst ──
    const [total, wins, losses, neutrals, cumulativeBps] = (await publicClient.readContract({
      address: SIBYL_CONTRACTS.attestations,
      abi: SIBYL_ATTESTATIONS_ABI,
      functionName: 'analystSummary',
      args: [aa],
    })) as [bigint, bigint, bigint, bigint, bigint];

    // ─── Read recent attestation IDs + outcomes ──
    const recentOutcomes: ('Win' | 'Loss' | 'Neutral')[] = [];
    const totalN = Number(total);
    if (totalN > 0) {
      // V2 stores attestations in a public mapping. Iterate by index.
      // Take the last min(total, 12) attestations chronologically.
      const startIdx = Math.max(0, totalN - 12);
      for (let i = startIdx; i < totalN; i++) {
        try {
          const id = (await publicClient.readContract({
            address: SIBYL_CONTRACTS.attestations,
            abi: SIBYL_ATTESTATIONS_ABI,
            functionName: 'attestationsByAnalyst',
            args: [aa, BigInt(i)],
          })) as `0x${string}`;
          const a = (await publicClient.readContract({
            address: SIBYL_CONTRACTS.attestations,
            abi: SIBYL_ATTESTATIONS_ABI,
            functionName: 'getAttestation',
            args: [id],
          })) as any;
          const label = outcomeLabel(Number(a.outcome));
          if (label === 'Win' || label === 'Loss' || label === 'Neutral') {
            recentOutcomes.push(label);
          }
        } catch {
          // skip missing
        }
      }
    }

    // ─── Compute rank ──
    const summaries = await Promise.all(
      allAnalysts.map(async (a) => {
        try {
          const [t, w, , , c] = (await publicClient.readContract({
            address: SIBYL_CONTRACTS.attestations,
            abi: SIBYL_ATTESTATIONS_ABI,
            functionName: 'analystSummary',
            args: [a.aa as `0x${string}`],
          })) as [bigint, bigint, bigint, bigint, bigint];
          return { aa: a.aa, total: Number(t), wins: Number(w), cumulativeBps: Number(c), hasHistory: Number(t) > 0 };
        } catch {
          return { aa: a.aa, total: 0, wins: 0, cumulativeBps: 0, hasHistory: false };
        }
      })
    );
    summaries.sort((x, y) => {
      if (x.hasHistory !== y.hasHistory) return x.hasHistory ? -1 : 1;
      if (x.cumulativeBps !== y.cumulativeBps) return y.cumulativeBps - x.cumulativeBps;
      return y.total - x.total;
    });
    const rank = summaries.findIndex((s) => s.aa.toLowerCase() === aa.toLowerCase()) + 1;

    // ─── Hit rate ──
    const scored = Number(wins) + Number(losses) + Number(neutrals);
    const hitRate = scored > 0 ? Number(wins) / scored : 0;

    const data: ReputationCardData = {
      rank: rank || 999,
      name: analyst.name,
      strategy: strategyLabel(Number(analyst.strategy)) as ReputationCardData['strategy'],
      aa,
      total: Number(total),
      wins: Number(wins),
      losses: Number(losses),
      neutrals: Number(neutrals),
      hitRate,
      cumulativeBps: Number(cumulativeBps),
      recentOutcomes,
    };

    const svg = renderReputationCardSvg(data);

    return new Response(svg, {
      status: 200,
      headers: {
        'content-type': 'image/svg+xml',
        'cache-control': 'public, max-age=60, s-maxage=60',
        'content-disposition': `inline; filename="sibyl-${analyst.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.svg"`,
      },
    });
  } catch (err: any) {
    console.error('reputation-card error:', err);
    return new Response(`error: ${err.message ?? 'unknown'}`, { status: 500 });
  }
}
