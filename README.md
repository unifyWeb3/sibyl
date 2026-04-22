# Sibyl

**Proof of Alpha — verifiable agent reputation, settled on Kite.**

Sibyl is a multi-agent trading system where autonomous analyst agents sell signals to trader agents for sub-cent USDC, guardian agents protect positions in volatility, and every action accrues a cryptographically-attested track record to the agent's Kite Passport. Built for the Kite AI Global Hackathon 2026.

## Architecture

```
┌─────────────┐   x402 signal $0.005    ┌─────────────┐
│   Analyst   │ ──────────────────────▶ │   Trader    │
│   Agent     │                          │   Agent     │
│             │ ◀────── attestation ─── │             │
└─────────────┘    (realized P&L bps)    └──────┬──────┘
                                                │
                                    subscription│ hedge fee
                                                ▼
                                         ┌─────────────┐
                                         │  Guardian   │
                                         │   Agent     │
                                         └─────────────┘
```

All three agents are delegations under a single user Kite Passport. Each has its own Session with its own spending cap. Every payment is settled in Test USDT on Kite L1. Every trade outcome posts a signed attestation back to the contributing analyst's reputation.

## Day 1 quickstart

```bash
# Install deps
pnpm install

# Copy env template, fill in your values
cp .env.example .env.local

# Hit the faucet for gas + USDT
# → https://faucet.gokite.ai/

# Verify everything is wired up
pnpm check:env
```

If the env check passes with green ticks, Milestone 1 is cleared.

## Repo layout

```
sibyl/
├── scripts/          # Day 1 smoke tests (sequential milestones)
├── services/
│   ├── kite/         # Kite primitive wrappers (passport, session, x402, attestation)
│   ├── analyst/      # Day 2 — signal generation
│   ├── trader/       # Day 2 — execution loop
│   └── guardian/     # Day 3 — risk overlay
├── apps/web/         # Day 3+ — Next.js consumer UI
└── docs/             # build logs, architecture notes
```

## Kite testnet reference

| Resource | Value |
|----------|-------|
| RPC | https://rpc-testnet.gokite.ai |
| Bundler | https://bundler-service.staging.gokite.ai/rpc/ |
| Explorer | https://testnet.kitescan.ai |
| Faucet | https://faucet.gokite.ai/ |
| Test USDT | 0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63 |
| Pieverse facilitator | https://facilitator.pieverse.io |
| Portal | https://x402-portal-eight.vercel.app/ |

## Scripts

| Command | What it does | Milestone |
|---------|--------------|-----------|
| `pnpm check:env` | Sanity-check env vars + testnet connection | Day 1 · M1 |
| `pnpm day1:passport` | Register Passport + delegate agent identities | Day 1 · M2 |
| `pnpm day1:session` | Create Sessions with spending caps | Day 1 · M3 |
| `pnpm day1:x402` | Execute full x402 round-trip agent→agent | Day 1 · M4 |
| `pnpm day1:attest` | Post first attestation to Passport | Day 1 · M5 |

Tagline: **"Agents who earn your trust, one signal at a time."**
