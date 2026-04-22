/**
 * services/kite/rules.ts
 *
 * Per-role spending rule schemes for Sibyl.
 *
 * These rules are what the Kite chain ENFORCES on-chain — not our app logic.
 * If an agent is compromised, the chain itself refuses to let it exceed these limits.
 *
 *   Trader:   daily $10 cap + per-tx $2 cap + provider-specific $5/day on analyst signals
 *   Guardian: 4-hour rolling $5 cap + per-tx $3 cap (emergency hedges only)
 *   Analyst:  no rules (receive-only; never spends)
 */

import { parseUnits } from 'ethers';
import { AGENT_ROLES, type AgentRole } from './identities.ts';
import { providerId, type SpendingRule } from './kitepass.ts';

/**
 * Returns start-of-today timestamp in unix seconds, local time.
 * Used as the anchor for rolling-window rules.
 */
function todayStartTimestamp(): bigint {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return BigInt(Math.floor(start.getTime() / 1000));
}

/**
 * USDT uses 18 decimals on Kite testnet (per NETWORKS config we inspected).
 */
function usdt(amount: string): bigint {
  return parseUnits(amount, 18);
}

/**
 * Build the rule set for a given agent role.
 * Rules are role-scoped — each tells a piece of Sibyl's on-chain story.
 */
export function buildRulesFor(role: AgentRole): SpendingRule[] {
  const today = todayStartTimestamp();

  switch (role) {
    case AGENT_ROLES.ANALYST:
      // Receive-only. No rules means no spend is ever authorized.
      return [];

    case AGENT_ROLES.TRADER:
      return [
        {
          // Daily global cap — $10/day across everything
          timeWindow: 86400n,
          budget: usdt('10'),
          initialWindowStartTime: today,
          targetProviders: [],
        },
        {
          // Per-transaction cap — no single tx > $2
          timeWindow: 0n,
          budget: usdt('2'),
          initialWindowStartTime: 0n,
          targetProviders: [],
        },
        {
          // Analyst-specific cap — up to $5/day specifically on analyst signals
          timeWindow: 86400n,
          budget: usdt('5'),
          initialWindowStartTime: today,
          targetProviders: [providerId('analyst')],
        },
      ];

    case AGENT_ROLES.GUARDIAN:
      return [
        {
          // 4-hour emergency window — $5 max in any rolling 4h
          timeWindow: 14400n,
          budget: usdt('5'),
          initialWindowStartTime: today,
          targetProviders: [],
        },
        {
          // Per-tx cap — single hedge never exceeds $3
          timeWindow: 0n,
          budget: usdt('3'),
          initialWindowStartTime: 0n,
          targetProviders: [],
        },
      ];

    default:
      return [];
  }
}

/**
 * Human-readable summary of what a rule means — used for demo output.
 */
export function describeRule(rule: SpendingRule): string {
  const budget = Number(rule.budget) / 1e18;
  const providerScope =
    rule.targetProviders.length === 0
      ? 'any provider'
      : `${rule.targetProviders.length} specific provider(s)`;

  if (rule.timeWindow === 0n) {
    return `max $${budget} per transaction (${providerScope})`;
  }

  const hours = Number(rule.timeWindow) / 3600;
  const label =
    rule.timeWindow === 86400n
      ? 'daily'
      : rule.timeWindow === 604800n
        ? 'weekly'
        : `${hours}h rolling`;

  return `max $${budget} ${label} (${providerScope})`;
}
