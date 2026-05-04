import { createPublicClient, http, type Address } from 'viem';
import { defineChain } from 'viem';

export const kiteTestnet = defineChain({
  id: 2368,
  name: 'Kite Testnet',
  nativeCurrency: { name: 'Kite', symbol: 'KITE', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc-testnet.gokite.ai'] } },
  blockExplorers: {
    default: { name: 'KiteScan', url: 'https://testnet.kitescan.ai' },
  },
  testnet: true,
});

export const publicClient = createPublicClient({
  chain: kiteTestnet,
  transport: http(),
});

// ─── Sibyl on-chain contracts ────────────────────────────────────────────────

export const SIBYL_CONTRACTS = {
  // V2 — current. Adds priceUpdateHash for Pyth/Hermes verification.
  attestations: '0x2Dc6a66Fd4BF69Abe04953c0F51995B2cF773e29' as Address,
  // V1 — historical (Day 1 deterministic mock data). Kept for reference.
  attestationsV1: '0xda942e2deB5E75f662234b0D30b96eBE3A9805D6' as Address,
  analysts:     '0xF2438BF71bcE90265580c1C74aA0D685562F93e0' as Address,
} as const;

// ─── Static agent metadata (operational roles, not analysts) ─────────────────

export const SIBYL_AGENTS = {
  trader: {
    name: 'Trader',
    aaAddress: '0x425D2e74AB743F39E3d47418e866e1d20DB8b83A' as Address,
    role: 'Buys signals and executes trades',
    tagline: 'Pays on HTTP 402. Executes under rule.',
    salt: 1002,
    kitepass: '0xbc529F07ef0bdD4DF884E92e8B2196318CCcE4Ec' as Address,
  },
  guardian: {
    name: 'Guardian',
    aaAddress: '0x22CE0e27256775232a421BB32df6495762025606' as Address,
    role: "Hedges risk on the trader's positions",
    tagline: 'Holds the hedge. Enforces the cap.',
    salt: 1003,
    kitepass: '0x67a0C4f8a0DEa3Ea186Af93C2977bAD00e3aD826' as Address,
  },
} as const;

export const KNOWN_TXS = {
  firstX402Payment:
    '0xd61d776c67297830a545b1bc994baaa4a5f41c71a848e5eb2e6773ba4852750b' as const,
} as const;

export const USDT_ADDRESS = '0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63' as Address;
export const EXPLORER = 'https://testnet.kitescan.ai';

// ─── ABIs ────────────────────────────────────────────────────────────────────

export const SIBYL_ATTESTATIONS_ABI = [
  {
    type: 'function',
    name: 'analystSummary',
    stateMutability: 'view',
    inputs: [{ name: 'analyst', type: 'address' }],
    outputs: [
      { name: 'total', type: 'uint256' },
      { name: 'wins', type: 'uint256' },
      { name: 'losses', type: 'uint256' },
      { name: 'neutrals', type: 'uint256' },
      { name: 'cumulativeBps', type: 'int256' },
    ],
  },
  {
    type: 'function',
    name: 'attestationsByAnalyst',
    stateMutability: 'view',
    inputs: [
      { name: 'analyst', type: 'address' },
      { name: 'index', type: 'uint256' },
    ],
    outputs: [{ type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'totalByAnalyst',
    stateMutability: 'view',
    inputs: [{ name: 'analyst', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'getAttestation',
    stateMutability: 'view',
    inputs: [{ name: 'id', type: 'bytes32' }],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'signalId', type: 'bytes32' },
          { name: 'analyst', type: 'address' },
          { name: 'trader', type: 'address' },
          { name: 'realizedBps', type: 'int32' },
          { name: 'holdSeconds', type: 'uint32' },
          { name: 'outcome', type: 'uint8' },
          { name: 'timestamp', type: 'uint64' },
          { name: 'priceUpdateHash', type: 'bytes32' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'totalAttestations',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
] as const;

export const SIBYL_ANALYSTS_ABI = [
  // ─── reads ────────────────────────────────────────────────────────────────
  {
    type: 'function',
    name: 'totalAnalysts',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'allAnalysts',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address[]' }],
  },
  {
    type: 'function',
    name: 'isRegistered',
    stateMutability: 'view',
    inputs: [{ name: 'aa', type: 'address' }],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'getAnalyst',
    stateMutability: 'view',
    inputs: [{ name: 'aa', type: 'address' }],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'aa', type: 'address' },
          { name: 'name', type: 'string' },
          { name: 'strategy', type: 'uint8' },
          { name: 'creator', type: 'address' },
          { name: 'createdAt', type: 'uint64' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'analystsPaged',
    stateMutability: 'view',
    inputs: [
      { name: 'offset', type: 'uint256' },
      { name: 'limit', type: 'uint256' },
    ],
    outputs: [
      {
        type: 'tuple[]',
        components: [
          { name: 'aa', type: 'address' },
          { name: 'name', type: 'string' },
          { name: 'strategy', type: 'uint8' },
          { name: 'creator', type: 'address' },
          { name: 'createdAt', type: 'uint64' },
        ],
      },
    ],
  },
  // ─── writes ───────────────────────────────────────────────────────────────
  {
    type: 'function',
    name: 'registerSelf',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'aa', type: 'address' },
      { name: 'name', type: 'string' },
      { name: 'strategy', type: 'uint8' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'registerExisting',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'aa', type: 'address' },
      { name: 'name', type: 'string' },
      { name: 'strategy', type: 'uint8' },
      { name: 'creator', type: 'address' },
    ],
    outputs: [],
  },
  // ─── events ───────────────────────────────────────────────────────────────
  {
    type: 'event',
    name: 'AnalystRegistered',
    inputs: [
      { name: 'aa', type: 'address', indexed: true },
      { name: 'name', type: 'string', indexed: false },
      { name: 'strategy', type: 'uint8', indexed: false },
      { name: 'creator', type: 'address', indexed: true },
      { name: 'createdAt', type: 'uint64', indexed: false },
    ],
  },
] as const;

// ─── Types ───────────────────────────────────────────────────────────────────

export type Outcome = 'Pending' | 'Win' | 'Loss' | 'Neutral';
export type Strategy = 'Bear' | 'Chaser' | 'Reverter' | 'Custom';

export function outcomeLabel(v: number): Outcome {
  return (['Pending', 'Win', 'Loss', 'Neutral'] as const)[v] ?? 'Pending';
}

export function strategyLabel(v: number): Strategy {
  return (['Bear', 'Chaser', 'Reverter', 'Custom'] as const)[v] ?? 'Custom';
}

export interface AnalystEntry {
  rank: number;
  aa: Address;
  name: string;
  strategy: Strategy;
  creator: Address;
  createdAt: number;
  total: number;
  wins: number;
  losses: number;
  neutrals: number;
  hitRate: number;
  cumulativeBps: number;
  hasHistory: boolean;
}

// ─── Loaders ─────────────────────────────────────────────────────────────────

export async function loadLeaderboard(): Promise<AnalystEntry[]> {
  try {
    const analysts = (await publicClient.readContract({
      address: SIBYL_CONTRACTS.analysts,
      abi: SIBYL_ANALYSTS_ABI,
      functionName: 'analystsPaged',
      args: [0n, 50n],
    })) as readonly {
      aa: Address;
      name: string;
      strategy: number;
      creator: Address;
      createdAt: bigint;
    }[];

    const entries: AnalystEntry[] = [];

    for (const a of analysts) {
      let total = 0,
        wins = 0,
        losses = 0,
        neutrals = 0,
        cumulativeBps = 0;

      try {
        const [tot, w, l, n, cum] = (await publicClient.readContract({
          address: SIBYL_CONTRACTS.attestations,
          abi: SIBYL_ATTESTATIONS_ABI,
          functionName: 'analystSummary',
          args: [a.aa],
        })) as [bigint, bigint, bigint, bigint, bigint];
        total = Number(tot);
        wins = Number(w);
        losses = Number(l);
        neutrals = Number(n);
        cumulativeBps = Number(cum);
      } catch (e) {
        // Analyst exists in registry but has no attestations yet — fine
      }

      const scored = wins + losses + neutrals;
      const hitRate = scored > 0 ? wins / scored : 0;

      entries.push({
        rank: 0,
        aa: a.aa,
        name: a.name,
        strategy: strategyLabel(a.strategy),
        creator: a.creator,
        createdAt: Number(a.createdAt),
        total,
        wins,
        losses,
        neutrals,
        hitRate,
        cumulativeBps,
        hasHistory: total > 0,
      });
    }

    entries.sort((a, b) => {
      if (a.hasHistory !== b.hasHistory) return a.hasHistory ? -1 : 1;
      if (a.cumulativeBps !== b.cumulativeBps) return b.cumulativeBps - a.cumulativeBps;
      return b.total - a.total;
    });

    entries.forEach((e, i) => {
      e.rank = i + 1;
    });

    return entries;
  } catch (err) {
    console.error('Failed to load leaderboard:', err);
    return [];
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function truncateAddress(addr: string | null | undefined, len = 6): string {
  if (!addr || typeof addr !== 'string') return '\u2014'; // em dash
  if (addr.length <= len * 2 + 2) return addr;
  return `${addr.slice(0, len + 2)}\u2026${addr.slice(-len)}`;
}

export function formatBps(bps: number): string {
  const sign = bps > 0 ? '+' : '';
  return `${sign}${bps} bps`;
}

export function formatRelativeTime(timestamp: number): string {
  const now = Date.now() / 1000;
  const diff = Math.floor(now - timestamp);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
