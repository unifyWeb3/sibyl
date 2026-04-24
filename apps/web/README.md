# Sibyl — Web (v2, hybrid)

Next.js 14 landing page + live dashboard. Warm paper base with a dark terminal band for the live attestation feed. Reads directly from Kite L1 via viem.

## Run

```bash
cd apps/web
pnpm install
pnpm dev
```

Opens on http://localhost:3000.

## Architecture

- **Hero** — Sibyl wordmark (Instrument Serif) with blinking green cursor + tagline, paired with **MissionControl** schematic on the right showing three-agent flow + live on-chain counters
- **Reputation cards** — three elevated paper cards on a sunken paper section (hit rate · cumulative · 12-dot sparkline)
- **Terminal band (DARK)** — deep ink section with scanlines, shows last 10 attestations with green-signal dots and mono type. This is the "live feed" moment
- **Agent cards** — three cards with custom SVG glyphs (oracle eye / compass / shield), tagline in Instrument Serif italic, addresses and USDT balance below a rule
- **Primitives** — first x402 payment + attestation contract deep-links
- **Footer** — hackathon credit + socials

## Design

- Paper `#FAFAF7` · Elevated `#FFFFFF` · Subtle `#F4F4EF`
- Ink `#0A0A0B` · Secondary `#3E3E42` · Muted `#6B6B70`
- Terminal band: Midnight `#08090B` / Bone `#F5F1E8`
- Signal `#00D084` · Warn `#FF6B35`
- Instrument Serif (display) · Inter (body) · JetBrains Mono (data)
- Grain overlay (3% multiply) · schema grid · signal halo behind hero

## Deploy

```bash
vercel --prod
```
