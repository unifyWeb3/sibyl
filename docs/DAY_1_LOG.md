# Day 1 Build Log

> **Goal for Day 1:** retire all Kite-primitive risk. By end of day, we've proven that Passports register, Sessions enforce caps, x402 payments flow agent-to-agent, and attestations land on-chain.

## Milestones

- [ ] **M1 · Environment sanity check** — `pnpm check:env` passes with green ticks, KITE + USDT balances visible
- [ ] **M2 · Passport registration** — User passport created via Kite portal, API key captured
- [ ] **M3 · Session creation** — Three sessions (Analyst / Trader / Guardian) with distinct spending caps, visible on testnet
- [ ] **M4 · x402 round-trip** — Trader agent pays Analyst agent via Pieverse facilitator, settlement tx visible on KiteScan
- [ ] **M5 · First attestation** — Post signed P&L attestation from Trader to Analyst Passport

---

M4 pivot (end of Day 1): Discovered Pieverse facilitator upgraded to x402 v2 (expects scheme: exact, network: eip155:2368, x402Version: 2), but Kite's SDK reference and docs still describe v1 (gokite-aa, kite-testnet). Facilitator path blocked deeper by Test USDT (0x0fF5...) not implementing ERC-3009 - only exposes plain ERC-20 methods. Resolution: pivoting M4 to AA-direct payment via Trader's KitePass vault. Trader signs a userOp through Kite's bundler that calls usdt.transfer from the KitePass. This exercises our M3 spending rules on-chain (every signal purchase naturally hits the $2 per-tx cap check). Stronger narrative, no facilitator dependency, pure Kite stack.

---

## Notes as we go

### Setup

- Running on WSL Ubuntu 24.04 inside `/home/unify/projects/sibyl`
- Node via nvm, not apt
- pnpm as package manager
- Fresh hackathon wallet — **no mainnet funds ever touch this key**

### Open questions

- Does `gokite-aa-sdk` install cleanly from npm? (test during M1)
- What's the exact Passport registration flow — SDK, portal only, or both? (we think portal-first per docs; will confirm at M2)
- Does the x402 facilitator settle in < 5s as expected? (M4 will answer)

### Decisions made

- Three agent "identities" are **delegations** under one user Passport, not three separate Passports. Matches Kite's three-tier identity model (user → agent → session) cleanly.
- Using Test USDT (`0x0fF...`) as the settlement token for all x402 flows — this is what Kite's reference weather service uses, keeping us compatible with any existing Kite x402 tooling.
- Deferring any smart contract deployment. Sibyl Day 1–5 uses only Kite's built-in Settlement + Facilitator contracts.

### Blockers / surprises

_(log here in real time so future-you remembers why something took longer than expected)_

---

## Environment reference

```
RPC:           https://rpc-testnet.gokite.ai
Bundler:       https://bundler-service.staging.gokite.ai/rpc/
Explorer:      https://testnet.kitescan.ai
Faucet:        https://faucet.gokite.ai/
Portal:        https://x402-portal-eight.vercel.app/
Test USDT:     0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63
Facilitator:   https://facilitator.pieverse.io
Facil. addr:   0x12343e649e6b2b2b77649DFAb88f103c02F3C78b
```
