/**
 * services/kite/registry.ts
 *
 * Persists agent identities + their KitePass vaults to disk.
 * Writes to .sibyl/agents.json (gitignored).
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import type { AgentRole } from './identities.ts';

const REGISTRY_DIR = '.sibyl';
const REGISTRY_FILE = join(REGISTRY_DIR, 'agents.json');

export interface AgentRecord {
  role: AgentRole;
  eoaSigner: string;
  aaAddress: string;
  salt: string;
  deployed: boolean;
  deployedAt?: string;
  deployTxHash?: string;

  // Added in Milestone 3
  kitepassAddress?: string;
  kitepassDeployTxHash?: string;
  rulesConfiguredTxHash?: string;
  fundedUsdtAmount?: string;
  fundedTxHash?: string;
}

export interface AgentRegistry {
  network: string;
  chainId: number;
  createdAt: string;
  agents: Partial<Record<AgentRole, AgentRecord>>;
}

export function loadRegistry(): AgentRegistry {
  if (!existsSync(REGISTRY_FILE)) {
    return {
      network: 'kite_testnet',
      chainId: 2368,
      createdAt: new Date().toISOString(),
      agents: {},
    };
  }
  const raw = readFileSync(REGISTRY_FILE, 'utf-8');
  return JSON.parse(raw) as AgentRegistry;
}

export function saveRegistry(registry: AgentRegistry): void {
  const dir = dirname(REGISTRY_FILE);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(REGISTRY_FILE, JSON.stringify(registry, null, 2));
}

/**
 * Merge-update an existing agent record. Throws if the agent doesn't exist yet.
 * Use for M3+ to augment records created in M2.
 */
export function upsertAgent(role: AgentRole, updates: Partial<AgentRecord>): AgentRegistry {
  const registry = loadRegistry();
  const existing = registry.agents[role];
  if (!existing) {
    throw new Error(
      `Agent "${role}" not registered yet. Run \`pnpm day1:passport\` (Milestone 2) first.`
    );
  }
  registry.agents[role] = { ...existing, ...updates };
  saveRegistry(registry);
  return registry;
}

/**
 * Create a new agent record from scratch. Used by Milestone 2.
 */
export function createAgent(role: AgentRole, record: AgentRecord): AgentRegistry {
  const registry = loadRegistry();
  registry.agents[role] = record;
  saveRegistry(registry);
  return registry;
}

export function getAgent(role: AgentRole): AgentRecord | undefined {
  const registry = loadRegistry();
  return registry.agents[role];
}

export function getAllAgents(): AgentRecord[] {
  const registry = loadRegistry();
  return Object.values(registry.agents).filter(Boolean) as AgentRecord[];
}
