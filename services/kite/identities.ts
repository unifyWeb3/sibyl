/**
 * services/kite/identities.ts
 *
 * The three agent roles in the Sibyl economy.
 * Each gets its own deterministic AA wallet address under your EOA.
 */

export const AGENT_ROLES = {
  ANALYST: 'analyst',
  TRADER: 'trader',
  GUARDIAN: 'guardian',
} as const;

export type AgentRole = (typeof AGENT_ROLES)[keyof typeof AGENT_ROLES];

/**
 * Each agent gets a deterministic salt so its AA wallet address
 * is reproducible across re-runs. The salt is a stable string per role.
 *
 * This means: run `pnpm day1:passport` twice, you get the same three
 * addresses both times. Deterministic = debuggable.
 */
export const AGENT_SALTS: Record<AgentRole, bigint> = {
  [AGENT_ROLES.ANALYST]: 1001n,
  [AGENT_ROLES.TRADER]: 1002n,
  [AGENT_ROLES.GUARDIAN]: 1003n,
};

/**
 * Human-readable descriptions for display in logs and the eventual UI.
 */
export const AGENT_DESCRIPTIONS: Record<AgentRole, string> = {
  [AGENT_ROLES.ANALYST]:
    'Generates trading signals from market data, charges per signal call',
  [AGENT_ROLES.TRADER]:
    'Subscribes to analyst signals, executes trades, posts attested P&L',
  [AGENT_ROLES.GUARDIAN]:
    'Watches trader positions, intervenes on volatility, hedges downside',
};
