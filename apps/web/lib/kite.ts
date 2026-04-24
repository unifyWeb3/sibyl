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

export const SIBYL_CONTRACTS = {
  attestations: '0xda942e2deB5E75f662234b0D30b96eBE3A9805D6' as Address,
} as const;

export const SIBYL_AGENTS = {
  analyst: {
    name: 'Analyst',
    aaAddress: '0x55Db3fbe402F8FB7a8B159A2d145fFba7CAd3Bd7' as Address,
    role: 'Sells trading signals via x402',
    tagline: 'Reads the market, charges for the call.',
    salt: 1001,
  },
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
    role: 'Hedges risk on the trader\u2019s positions',
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
    inputs: [{ name: 'analyst', type: 'address' }],
    outputs: [{ type: 'bytes32[]' }],
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

export type Outcome = 'Pending' | 'Win' | 'Loss' | 'Neutral';

export function outcomeLabel(v: number): Outcome {
  return (['Pending', 'Win', 'Loss', 'Neutral'] as const)[v] ?? 'Pending';
}

export function truncateAddress(addr: string, len = 6): string {
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
