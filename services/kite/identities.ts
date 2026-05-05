import { readFileSync } from 'fs';

export const AGENT_ROLES = {
  ANALYST: 'analyst',
  TRADER: 'trader',
  GUARDIAN: 'guardian',
} as const;

export type AgentRole = typeof AGENT_ROLES[keyof typeof AGENT_ROLES];

export interface AgentIdentity {
  role: AgentRole;
  aaAddress: string;
  kitepassAddress?: string;
}

export function getAgent(role: AgentRole): AgentIdentity | null {
  try {
    const agents = JSON.parse(readFileSync('.sibyl/agents.json', 'utf-8')).agents;
    return agents[role] || null;
  } catch { return null; }
}
