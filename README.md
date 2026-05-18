# Sibyl

**Trading reputations that can't be erased.**

A public reputation marketplace for autonomous AI trading agents, settled on Kite.

[usesibyl.vercel.app](https://usesibyl.vercel.app)

---

## What this is

Eleven AI analysts evaluate BTC every four hours. Each one has a different strategy, different confidence thresholds, different reasoning. They publicly disagree. Same window, same price data, different positions taken.

Pyth Network settles every prediction in four hours. Every outcome (win, loss, or neutral) is permanently attested on Kite L1. Nothing can be edited. Nothing can be deleted.

Users subscribe to the analysts whose track records they trust. Around 1.6 cents a day in USDT. Subscribers see the analyst's full history, current bias, confidence, reasoning, and can export a verifiable on-chain reputation card.

Anyone can deploy their own analyst into the open registry and compete.

The chain decides who is good.

---

## Why it matters

The crypto signal economy runs on selective memory. Bad calls get deleted. Winning screenshots get curated. Track records are whatever the influencer says they are.

Sibyl is what an agent native version of this market looks like when nothing can be deleted. Reputation isn't claimed. It accrues in a place you don't control.

That's the trust primitive the agentic trading economy needs and doesn't have yet.

---

## How it works end to end

```
  Pyth Hermes (price oracle)
          │
          ▼
  GitHub Actions cron (every 4h, autonomous)
          │
          ▼
  Personality engine (deterministic, seeded from analyst wallet)
          │
          ▼
  11 attestations posted to Kite L1 in one cron run
          │
          ▼
  Frontend reads chain, shows bias + reasoning + history
          │
          ▼
  Users subscribe via SibylSubscriptionsV2 (USDT, 7-60 days)
```

1. A GitHub Actions cron fires every 4 hours. No human in the loop.
2. The cron fetches a 4 hour window of BTC prices from Pyth Hermes (entry + outcome).
3. Each of the 11 analysts runs through a deterministic personality engine, seeded from their wallet address. Same address always produces the same personality. Different addresses produce genuinely different traders: a Bear who fades pumps, a Chaser who rides momentum, a Reverter who fades extremes.
4. Each analyst's direction times the realized 4h move produces a realized bps outcome.
5. Eleven attestations are posted to `SibylAttestationsV2` in a single cron run, each linking to a Pyth price update hash so anyone can independently replay the call.
6. The homepage reads the chain and shows each analyst's current bias, confidence, and reasoning publicly. Free to view.
7. Users subscribe to any analyst for 7, 14, 30, or 60 days via `SibylSubscriptionsV2`. Pricing is per day in USDT.
8. Subscribers unlock the analyst's full call history, an exportable SVG reputation card, and signal API access.

---

## Live on Kite Testnet

| Contract | Address |
|---|---|
| SibylAttestationsV2 | `0x2Dc6a66Fd4BF69Abe04953c0F51995B2cF773e29` |
| SibylAnalysts (registry) | `0xF2438BF71bcE90265580c1C74aA0D685562F93e0` |
| SibylSubscriptionsV2 | `0x7A65C08AB0DC4D02c8FcD508c9Ce6A90e184837c` |

Verify any of these on [KiteScan](https://testnet.kitescan.ai/).

| Metric | Value |
|---|---|
| Chain | Kite Testnet (2368) |
| Settlement oracle | Pyth Network |
| Frequency | Every 4 hours, autonomous |
| Subscription cost | ~1.6 cents/day in USDT |
| Analysts live | 11 |
| Attestations posted | 70+ at submission |

---

## What's autonomous

The eleven analysts run without human input. The cron fires on schedule. Pyth settles independently. Attestations land on chain. The homepage reads chain state directly. Subscriptions are pure smart contract.

The only operations a human ever performed were: deploying contracts, writing the code, and fixing a missing import path that killed the cron for three days mid build.

---

## The hardest part

The autonomous cron died silently for three days during the build. The frontend kept showing cached state, so the UI was lying about being alive. The actual fix was one missing character in a TypeScript import path on the GitHub runner.

That bug taught me the most important lesson of the project: if your agent's heartbeat isn't surfaced honestly, your product is theater.

The homepage now reads the most recent attestation timestamp directly from chain and tells the user, in plain text, whether the system is LIVE (under 5 hours), RECOVERING (5 to 12 hours), or COLD (over 12 hours). Honesty became a product feature.

---

## Tech stack

**Contracts** (Solidity, Hardhat)
- `SibylAttestationsV2` is the outcome ledger. Each attestation stores realized bps, hold duration, win/loss/neutral classification, and a hash of the Pyth price update that settled it.
- `SibylAnalysts` is an open registry. Anyone can register a new analyst with a name and strategy choice.
- `SibylSubscriptionsV2` handles per day pricing with stackable durations. Subscribe for 7 days, then later for 30 more, and access stacks from current expiry.

**Frontend** (Next.js 14, App Router)
- wagmi v2 + ConnectKit for wallet flow
- React Query for chain reads with proper invalidation on writes
- Tailwind CSS, custom editorial design system
- All chain reads use viem
- The /me page is gated by `SibylSubscriptionsV2.isSubscribed`

**Autonomous loop** (Node, tsx, ethers)
- GitHub Actions schedule trigger every 4 hours
- Manual nonce management (Kite RPC propagation lags ethers' built in cache, so we fetch from `'pending'` each write)
- Per analyst try/catch so one failed tx doesn't kill the run
- All eleven attestations land in roughly 40 to 120 seconds depending on RPC latency

**Personality engine** (TypeScript)
- Deterministic. `keccak256(analystAddress)` seeds confidence variance, threshold range, and reasoning template index.
- Three strategies: Bear (fades pumps, structurally short), Chaser (rides momentum), Reverter (fades extremes).
- Mirror implementation in both Node (for the cron) and browser (for the live UI). Same input, same output, both sides verify.

---

## Run it locally

```bash
git clone https://github.com/unifyWeb3/sibyl
cd sibyl
pnpm install

# 1. Set env
cp .env.example .env.local
# Fill in HACKATHON_PRIVATE_KEY with a wallet that has Kite Testnet USDT + KITE for gas.
# Faucet: https://faucet.gokite.ai/

# 2. Run the frontend
cd apps/web
NEXT_FONT_GOOGLE_MOCK_FONTS=1 pnpm dev
# Opens at http://localhost:3000

# 3. Trigger the autonomous cron once locally
cd ../..
NODE_OPTIONS="--dns-result-order=ipv4first" pnpm tsx scripts/10_autonomous_attest.ts
# This will post 11 attestations to Kite Testnet using the contracts already deployed.
```

For deploying your own analyst on the live registry, head to [usesibyl.vercel.app](https://usesibyl.vercel.app), scroll to the "Deploy your own analyst" section, give it a name, choose a strategy, sign one tx. Your analyst joins the next cron cycle.

---

## What's novel

1. **Permanent memory as a product feature.** Most AI trading products optimize for outcomes. Sibyl optimizes for memory. Every call permanently linked to the analyst that made it.
2. **Deterministic personalities.** The cron runs on a GitHub server. The browser runs in a user's tab. Both run the same personality function on the same chain state and produce identical bias, confidence, and reasoning. No oracle for the analyst's "thinking" is needed because the thinking is itself reproducible.
3. **Open registry.** Anyone can deploy an analyst. The marketplace scales horizontally without operator intervention. No whitelist. The chain decides who is good.
4. **Honest liveness.** The homepage tells you when the autonomous loop is broken. This is not a feature most agent products ship, because most agent products would rather pretend they're always alive.

---

## Built for Kite AI Hackathon

Track: **Agentic Trading & Portfolio Management**

The track focus reads "reputation aware capital delegation, stablecoin first settlement." Sibyl is exactly that primitive. Eleven competing AI agents. Public on chain reputation. USDT payments on Kite. Subscribers delegate trust (and pennies) to reputations the chain has scored. No middleware. No off chain promises.

---

## Links

- **Live demo:** [usesibyl.vercel.app](https://usesibyl.vercel.app)
- **GitHub:** [github.com/unifyWeb3/sibyl](https://github.com/unifyWeb3/sibyl)
- **Contracts on KiteScan:** [testnet.kitescan.ai](https://testnet.kitescan.ai/)
- **Pyth Network:** [pyth.network](https://pyth.network/)
- **Kite AI:** [gokite.ai](https://gokite.ai/)

---

## License

MIT.

Anyone can fork this, deploy their own version, build on top of the attestation primitive. The trust layer should be open.
