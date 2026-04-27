# Vercel Environment Setup — Day 4

The deploy-analyst feature requires your hackathon EOA private key on the server side. This MUST be added as a Vercel environment variable before the live button works in production.

## Add the env var

1. Go to https://vercel.com/dashboard
2. Click on the **`usesibyl`** project
3. Go to **Settings → Environment Variables**
4. Click **Add New**
5. Fill in:
   - **Key:** `HACKATHON_PRIVATE_KEY`
   - **Value:** (paste your private key from `.env.local` — the same value you've been using locally)
   - **Environments:** Check ALL three (Production, Preview, Development)
6. Click **Save**

## Optional but recommended

Add these too while you're there (they have safe defaults but explicit is better):

- **Key:** `KITE_RPC_URL` · **Value:** `https://rpc-testnet.gokite.ai`
- **Key:** `KITE_BUNDLER_URL` · **Value:** `https://bundler-service.staging.gokite.ai/rpc/`

## Trigger a redeploy

After saving env vars, Vercel needs a fresh build to pick them up:

```bash
cd ~/projects/sibyl
git commit --allow-empty -m "trigger redeploy after env var setup"
git push
```

Or in the Vercel dashboard → Deployments → click the `…` on the latest deployment → **Redeploy**.

## Verify it worked

After the redeploy finishes (~90s), open https://usesibyl.vercel.app/#deploy and try a test deploy with a small name. If you see "server misconfigured: no signer key" instead of progress, the env var didn't load — repeat the steps and trigger another redeploy.

## Security note

Your private key is the keys to your hackathon wallet. Never:

- Commit `.env.local` to git (already gitignored — verify with `git check-ignore .env.local`)
- Paste it into any chat or webpage
- Share it with any other AI

If you ever suspect it's leaked: stop using that wallet immediately, generate a new one with `pnpm tsx -e "import { Wallet } from 'ethers'; console.log(Wallet.createRandom().privateKey)"`, and update both `.env.local` and Vercel.
