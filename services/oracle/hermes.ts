/**
 * Pyth Hermes client.
 *
 * Pyth's contract is not deployed on Kite testnet, so we fetch BTC/USD prices
 * via Pyth's Hermes HTTP API (the same data, delivered off-chain).
 *
 * We commit a keccak256 hash of the Hermes response to SibylAttestationsV2.
 * Anyone can re-fetch Hermes at the attested publishTime and verify the hash —
 * the prices are off-chain, but the proof of which prices we used is on-chain.
 *
 * Hermes docs: https://hermes.pyth.network/docs/
 * Price feed IDs: https://docs.pyth.network/price-feeds/core/price-feeds
 */

import { keccak256, toUtf8Bytes } from 'ethers';

// ─── Price feed IDs ──────────────────────────────────────────────────────────

export const PYTH_FEED_IDS = {
  BTC_USD: '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
  ETH_USD: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
  SOL_USD: '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
} as const;

export type PythFeedId = keyof typeof PYTH_FEED_IDS;

const HERMES_BASE = 'https://hermes.pyth.network';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PythPrice {
  /** Price scaled by 10^expo. e.g. price=10500000000000, expo=-8 means $105,000.00 */
  price: bigint;
  /** Confidence interval, same scaling as price */
  conf: bigint;
  /** Negative integer; multiply price by 10^expo to get USD value */
  expo: number;
  /** Unix seconds when this price was published by Pyth */
  publishTime: number;
}

export interface PythUpdate {
  /** Decoded BTC/USD price */
  price: PythPrice;
  /** USD value as a JS number — convenience for math; lossy for huge numbers */
  priceUsd: number;
  /** Raw Hermes response (the bytes we hash for on-chain commitment) */
  rawResponse: string;
  /** keccak256 of rawResponse — the bytes32 we put on-chain */
  updateHash: `0x${string}`;
  /** Hermes binary update data (hex) — would be passed to Pyth contract if Kite had one */
  binaryUpdateData: string[];
  /** When we fetched (server clock, for diagnostics) */
  fetchedAt: number;
}

/**
 * Hardened fetch: timeout, no socket reuse, retry with backoff, full error context.
 *
 * Why this exists: Node's native fetch keep-alives sockets between requests.
 * If the script idles 60s between price fetches, Hermes drops the idle socket.
 * Node tries to reuse the dead socket on the next call → opaque "fetch failed".
 *
 * Fix: send Connection: close, abort if no response in 8s, retry up to 3x with
 * 1s backoff. Logs status + body on failure so we never see "fetch failed" alone.
 */
async function hardenedFetch(url: string, attempt = 1): Promise<any> {
  const MAX_ATTEMPTS = 3;
  const TIMEOUT_MS = 8_000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      headers: { accept: 'application/json', connection: 'close' },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const body = await res.text().catch(() => '<no body>');
      throw new Error(`Hermes ${res.status} ${res.statusText}: ${body.slice(0, 200)}`);
    }
    return await res.json();
  } catch (err: any) {
    clearTimeout(timer);
    const cause = err?.cause?.code ?? err?.cause?.message ?? err?.message ?? 'unknown';
    if (attempt < MAX_ATTEMPTS) {
      console.warn(`  [hermes retry ${attempt}/${MAX_ATTEMPTS - 1}] ${cause}`);
      await new Promise(r => setTimeout(r, 1_000 * attempt));
      return hardenedFetch(url, attempt + 1);
    }
    throw new Error(`Hermes fetch failed after ${MAX_ATTEMPTS} attempts: ${cause}`);
  }
}

// ─── Latest price fetch ─────────────────────────────────────────────────────

/** Max acceptable age (seconds) of a price from Hermes. Older = treated as stale. */
const MAX_PRICE_AGE_SECONDS = 30;

/**
 * Fetch the latest BTC/USD (or other) price from Hermes.
 *
 * Hermes endpoint: GET /v2/updates/price/latest?ids[]=<id>
 * Returns: { binary: { encoding, data: [...] }, parsed: [{ id, price, ema_price, metadata }] }
 *
 * Rejects prices older than MAX_PRICE_AGE_SECONDS — protects against delayed
 * Hermes updates leaking stale data into attestations.
 */
export async function fetchLatestPrice(feed: PythFeedId = 'BTC_USD'): Promise<PythUpdate> {
  const id = PYTH_FEED_IDS[feed];
  const url = `${HERMES_BASE}/v2/updates/price/latest?ids[]=${id}&parsed=true&encoding=hex`;
  const body = await hardenedFetch(url);
  const update = parseHermesResponse(body, id);

  const ageSeconds = update.fetchedAt - update.price.publishTime;
  if (ageSeconds > MAX_PRICE_AGE_SECONDS) {
    throw new Error(
      `Hermes returned stale price: ${ageSeconds}s old (max ${MAX_PRICE_AGE_SECONDS}s). publishTime=${update.price.publishTime}`
    );
  }
  return update;
}

/**
 * Fetch a price as of a specific publish time (for outcome attestation —
 * we want the price exactly when the holding window closed).
 *
 * Hermes endpoint: GET /v2/updates/price/<publishTime>?ids[]=<id>
 */
export async function fetchPriceAt(
  publishTime: number,
  feed: PythFeedId = 'BTC_USD'
): Promise<PythUpdate> {
  const id = PYTH_FEED_IDS[feed];
  const url =
    `${HERMES_BASE}/v2/updates/price/${publishTime}?ids[]=${id}&parsed=true&encoding=hex`;
  const body = await hardenedFetch(url);
  return parseHermesResponse(body, id);
}

// ─── Parsing ────────────────────────────────────────────────────────────────

function parseHermesResponse(body: any, expectedId: string): PythUpdate {
  if (!body?.parsed || !Array.isArray(body.parsed) || body.parsed.length === 0) {
    throw new Error('Hermes: no parsed price data in response');
  }
  if (!body?.binary?.data || !Array.isArray(body.binary.data)) {
    throw new Error('Hermes: no binary update data in response');
  }

  const parsed = body.parsed[0];
  const expectedIdNoPrefix = expectedId.startsWith('0x') ? expectedId.slice(2) : expectedId;
  if (parsed.id !== expectedIdNoPrefix && parsed.id !== expectedId) {
    throw new Error(`Hermes: expected id ${expectedId}, got ${parsed.id}`);
  }

  const priceRaw = parsed.price;
  const price: PythPrice = {
    price: BigInt(priceRaw.price),
    conf: BigInt(priceRaw.conf),
    expo: Number(priceRaw.expo),
    publishTime: Number(priceRaw.publish_time),
  };

  const priceUsd = pythPriceToUsd(price);

  // Canonical hash input — deterministic JSON of the parsed data.
  // We hash the parsed numbers (not raw HTTP bytes) so the hash is reproducible
  // by anyone re-fetching the same publishTime from Hermes (raw bytes can vary
  // by encoding/whitespace; canonical fields cannot).
  const canonical = JSON.stringify({
    feedId: expectedId,
    price: price.price.toString(),
    conf: price.conf.toString(),
    expo: price.expo,
    publishTime: price.publishTime,
  });
  const updateHash = keccak256(toUtf8Bytes(canonical)) as `0x${string}`;

  return {
    price,
    priceUsd,
    rawResponse: canonical,
    updateHash,
    binaryUpdateData: body.binary.data,
    fetchedAt: Math.floor(Date.now() / 1000),
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Convert Pyth price+expo to USD as a JS number. Lossy for huge values; fine for BTC/ETH. */
export function pythPriceToUsd(p: PythPrice): number {
  return Number(p.price) * Math.pow(10, p.expo);
}

/**
 * Compute realized bps from two prices.
 * Bull (long) signal: positive bps when outcome > entry.
 * Bear (short) signal: positive bps when outcome < entry.
 * Returns int32-safe basis points (1 bps = 0.01%).
 */
export function realizedBps(
  entryUsd: number,
  outcomeUsd: number,
  direction: 'long' | 'short'
): number {
  const ret = (outcomeUsd - entryUsd) / entryUsd;
  const bps = ret * 10_000 * (direction === 'long' ? 1 : -1);
  return Math.max(-32768, Math.min(32767, Math.round(bps)));
}

/**
 * Classify outcome from realized bps. Threshold: ±25 bps = neutral noise.
 */
export function classifyOutcome(bps: number): 0 | 1 | 2 | 3 {
  // 0 Pending, 1 Win, 2 Loss, 3 Neutral
  if (Math.abs(bps) < 25) return 3;
  return bps > 0 ? 1 : 2;
}
