/**
 * Sibyl Subscriptions — contract metadata + ABI + helpers.
 */

import type { Address } from 'viem';

export const SIBYL_SUBSCRIPTIONS_ADDRESS =
  '0xb1e3d3f6A4F32239F2CE0bCa99e9c092BCfaC0C6' as Address;

export const USDT_ADDRESS = '0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63' as Address;

/** 0.5 USDT (18 decimals on Kite testnet) */
export const PRICE_PER_PERIOD_WEI = 500000000000000000n;

/** 30 days in seconds */
export const PERIOD_SECONDS = 30 * 24 * 3600;

export const SIBYL_SUBSCRIPTIONS_ABI = [
  {
    type: 'function',
    name: 'subscribe',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'analyst', type: 'address' }],
    outputs: [{ type: 'uint64' }],
  },
  {
    type: 'function',
    name: 'isSubscribed',
    stateMutability: 'view',
    inputs: [
      { name: 'subscriber', type: 'address' },
      { name: 'analyst', type: 'address' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'expiresAt',
    stateMutability: 'view',
    inputs: [
      { name: 'subscriber', type: 'address' },
      { name: 'analyst', type: 'address' },
    ],
    outputs: [{ type: 'uint64' }],
  },
  {
    type: 'function',
    name: 'timeRemaining',
    stateMutability: 'view',
    inputs: [
      { name: 'subscriber', type: 'address' },
      { name: 'analyst', type: 'address' },
    ],
    outputs: [{ type: 'uint64' }],
  },
  {
    type: 'function',
    name: 'totalSubscribersByAnalyst',
    stateMutability: 'view',
    inputs: [{ type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'revenueByAnalyst',
    stateMutability: 'view',
    inputs: [{ type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'event',
    name: 'Subscribed',
    inputs: [
      { name: 'subscriber', type: 'address', indexed: true },
      { name: 'analyst', type: 'address', indexed: true },
      { name: 'expiresAt', type: 'uint64', indexed: false },
      { name: 'amountPaid', type: 'uint256', indexed: false },
    ],
  },
] as const;

export const ERC20_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [{ type: 'address' }, { type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [{ type: 'address' }, { type: 'uint256' }],
    outputs: [{ type: 'bool' }],
  },
] as const;

/** Format remaining seconds into a human string. */
export function formatTimeRemaining(seconds: bigint | number): string {
  const s = Number(seconds);
  if (s <= 0) return 'expired';
  const days = Math.floor(s / 86400);
  if (days >= 1) return `${days}d remaining`;
  const hours = Math.floor(s / 3600);
  if (hours >= 1) return `${hours}h remaining`;
  return `<1h remaining`;
}
