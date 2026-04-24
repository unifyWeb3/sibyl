# Day 1 Build Log

> **Goal for Day 1:** retire all Kite-primitive risk. By end of day, we've proven that Passports register, Sessions enforce caps, x402 payments flow agent-to-agent, and attestations land on-chain.

## Milestones

- [x] **M1 · Environment sanity check** — `pnpm check:env` passes with green ticks, KITE + USDT balances visible
- [x] **M2 · Passport registration** — Three AA wallets deployed on Kite testnet as agent Passports
  - Analyst: `0x55Db3fbe402F8FB7a8B159A2d145fFba7CAd3Bd7`
  - Trader:  `0x425D2e74AB743F39E3d47418e866e1d20DB8b83A`
  - Guardian: `0x22CE0e27256775232a421BB32df6495762025606`
- [x] **M3 · Session creation** — Two KitePass vaults deployed with spending rules enforced on-chain
  - Trader vault:   `0xbc529F07ef0bdD4DF884E92e8B2196318CCcE4Ec` (3 rules: daily $10, per-tx $2, analyst-scoped $5/day)
  - Guardian vault: `0x67a0C4f8a0DEa3Ea186Af93C2977bAD00e3aD826` (2 rules: 4h $5, per-tx $3)
- [x] **M4 · x402 round-trip COMPLETE** — Trader AA → Analyst AA, 0.005 USDT, settled in ~8.6s on Kite L1
  - First successful tx: `0xd61d776c67297830a545b1bc994baaa4a5f41c71a848e5eb2e6773ba4852750b`
  - Balance delta verified both sides (Trader 0.5 → 0.495, Analyst 0.0 → 0.005)
  - Pivoted from Pieverse facilitator → direct userOp + on-chain receipt verification
- [x] **M5 · Attestation primitive** — SibylAttestations.sol deployed, first attestation posted by Trader AA
  - Contract: see `.sibyl/contracts.json` for deployed address
  - Schema baked on-chain: `SignalOutcome(bytes32 signalId, address analyst, address trader, int32 realizedBps, uint32 holdSeconds, uint8 outcome, uint256 timestamp)`
  - Reputation grows visibly across multiple runs (70% hit rate by design, 10-outcome cycle)

---

## Notes

### Setup

- Running on WSL Ubuntu 24.04 inside `/home/unify/projects/sibyl`
- Node via nvm, not apt; pnpm as package manager
- Fresh hackathon wallet — **no mainnet funds ever touch this key**

### Key decisions

- **Three agent "identities" are delegations under one user EOA**, not three separate EOAs. Matches Kite's three-tier identity model (user → agent → session).
- **M4 pivoted from Pieverse facilitator to AA-direct payment** after discovering (a) Pieverse upgraded to x402 v2 expecting `scheme: exact`, `network: eip155:2368`, (b) Kite's SDK reference docs still describe v1, (c) Test USDT doesn't implement ERC-3009 so standard facilitator settlement is impossible on testnet. The direct-payment approach is actually stronger — pure Kite stack, no third-party dependency, exercises the bundler every time.
- **M5 contract is ~60 lines + baked schema**. Borrowed EAS's best idea (self-describing on-chain schema) without EAS's weight. Single deploy, two indexed views (by analyst, by trader), one free hit-rate summary method.

### Gas burn summary (testnet KITE)

| Op | Approx cost |
|---|---|
| Deploy AA wallet (3×) | ~0.024 KITE each = 0.072 |
| Deploy KitePass (2×) | ~0.030 KITE each = 0.060 |
| configureSpendingRules (2×) | ~0.014 KITE each = 0.028 |
| Fund AA (2× USDT transfers) | ~0.003 KITE each |
| M4 x402 payment | ~0.017 KITE |
| Deploy SibylAttestations | ~0.040 KITE |
| Post attestation (per) | ~0.015 KITE |

Total Day 1 burn: ~0.25 KITE. Well within faucet allocation.

### Blockers hit (and how we got past them)

1. **`.env.local` not loaded** by default import — fixed by `config({ path: '.env.local' })`
2. **Milestone 3 `upsertAgent` vs `createAgent`** — refactored registry to have both
3. **M4 Pieverse facilitator: "Missing paymentPayload or paymentRequirements"** — facilitator wanted envelope `{x402Version, paymentPayload, paymentRequirements}`, not just payload
4. **M4 Pieverse: "No facilitator registered for x402 version: 1"** — facilitator on v2 with `scheme: exact`; SDK reference stale
5. **M4 Test USDT doesn't support ERC-3009** — pivoted entirely to userOp-based direct payment + on-chain verification
6. **M4 probe revealed `createUserOperation` wants object arg** — mirrored M2's `sendUserOperationAndWait(signer, request, signFn, salt)` pattern instead

---

## Environment reference

```
RPC:           https://rpc-testnet.gokite.ai
Bundler:       https://bundler-service.staging.gokite.ai/rpc/
Explorer:      https://testnet.kitescan.ai
Faucet:        https://faucet.gokite.ai/
Test USDT:     0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63
Chain ID:      2368
```
