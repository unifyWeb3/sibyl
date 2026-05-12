/**
 * Sibyl Subscriptions V2 — contract metadata + ABI + helpers.
 *
 * V2 changes (Day 13):
 *   - Address: 0x7A65C08AB0DC4D02c8FcD508c9Ce6A90e184837c
 *   - subscribe(analyst, daysCount) replaces subscribe(analyst)
 *   - Pricing per-day: PRICE_PER_DAY = 16666666666666667 wei (~0.01667 USDT/day)
 *   - Standard durations the UI offers: 7, 14, 30, 60 days
 */

import type { Address } from 'viem';

export const SIBYL_SUBSCRIPTIONS_ADDRESS =
  '0x7A65C08AB0DC4D02c8FcD508c9Ce6A90e184837c' as Address;

export const USDT_ADDRESS = '0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63' as Address;

/** 0.5 USDT / 30 days, in wei (18 decimals on Kite testnet) */
export const PRICE_PER_DAY_WEI = 16_666_666_666_666_667n;

export const SECONDS_PER_DAY = 86400;

/** Standard durations the UI surfaces. Custom values are also accepted on-chain. */
export const DURATION_OPTIONS = [
  { days: 7,  label: '7 days',  popular: false },
  { days: 14, label: '14 days', popular: false },
  { days: 30, label: '30 days', popular: true  },
  { days: 60, label: '60 days', popular: false },
] as const;

export const SIBYL_SUBSCRIPTIONS_ABI = [
  {
    type: 'function',
    name: 'subscribe',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'analyst', type: 'address' },
      { name: 'daysCount', type: 'uint64' },
    ],
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
    name: 'quoteCost',
    stateMutability: 'pure',
    inputs: [{ name: 'daysCount', type: 'uint64' }],
    outputs: [{ type: 'uint256' }],
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
    name: 'PRICE_PER_DAY',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'event',
    name: 'Subscribed',
    inputs: [
      { name: 'subscriber', type: 'address', indexed: true },
      { name: 'analyst', type: 'address', indexed: true },
      { name: 'expiresAt', type: 'uint64', indexed: false },
      { name: 'daysAdded', type: 'uint64', indexed: false },
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

/** Quote cost in wei for N days. Mirror of contract's quoteCost. */
export function quoteCostDays(days: number): bigint {
  return PRICE_PER_DAY_WEI * BigInt(days);
}

/** Format wei cost as human "0.5000 USDT" — 4 decimals max. */
export function formatCostUsdt(wei: bigint): string {
  // 18 decimals, take first 4
  const whole = wei / 10n ** 18n;
  const frac = wei % 10n ** 18n;
  const fracStr = frac.toString().padStart(18, '0').slice(0, 4);
  return `${whole}.${fracStr} USDT`;
}

export function formatTimeRemaining(seconds: bigint | number): string {
  const s = Number(seconds);
  if (s <= 0) return 'expired';
  const days = Math.ceil(s / 86400);
  if (days >= 1) return `${days}d remaining`;
  const hours = Math.floor(s / 3600);
  if (hours >= 1) return `${hours}h remaining`;
  return `<1h remaining`;
}

export function formatExpiryDate(expiresAtSeconds: bigint | number): string {
  const ms = Number(expiresAtSeconds) * 1000;
  return new Date(ms).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
