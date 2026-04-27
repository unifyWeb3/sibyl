/**
 * In-memory rate limiter for deploy-analyst endpoint.
 *
 * Two layers:
 *   1. IP-based: 1 deploy per IP per 30 min
 *   2. Global daily cap: 30 deploys per 24h across all IPs
 *
 * Vercel reuses warm function instances, so the in-memory Map persists across
 * requests within the same instance. Cold starts reset state — acceptable for
 * hackathon scale (an attacker would need to wait for cold starts, which slows
 * abuse to a useless trickle).
 *
 * NOT suitable for production scale. For real traffic, swap in Vercel KV.
 */

interface IpRecord {
  lastDeployAt: number; // epoch ms
}

interface GlobalRecord {
  count: number;
  windowStart: number; // epoch ms
}

const IP_WINDOW_MS = 30 * 60 * 1000; // 30 minutes
const GLOBAL_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
const GLOBAL_CAP = 30;

const ipMap = new Map<string, IpRecord>();
const global: GlobalRecord = { count: 0, windowStart: Date.now() };

export interface RateLimitResult {
  ok: boolean;
  reason?: 'ip_cooldown' | 'global_cap';
  retryAfterSeconds?: number;
}

/**
 * Check if a deploy is allowed. Does NOT increment counters — call recordDeploy()
 * after the deploy succeeds (so we don't count failed deploys against the user).
 */
export function checkRateLimit(ip: string): RateLimitResult {
  const now = Date.now();

  // Garbage-collect IP records older than the window
  if (ipMap.size > 1000) {
    for (const [key, rec] of ipMap.entries()) {
      if (now - rec.lastDeployAt > IP_WINDOW_MS) ipMap.delete(key);
    }
  }

  // Reset global window if expired
  if (now - global.windowStart > GLOBAL_WINDOW_MS) {
    global.count = 0;
    global.windowStart = now;
  }

  // Global cap check
  if (global.count >= GLOBAL_CAP) {
    const retrySeconds = Math.ceil((GLOBAL_WINDOW_MS - (now - global.windowStart)) / 1000);
    return { ok: false, reason: 'global_cap', retryAfterSeconds: retrySeconds };
  }

  // IP cooldown check
  const ipRec = ipMap.get(ip);
  if (ipRec) {
    const elapsed = now - ipRec.lastDeployAt;
    if (elapsed < IP_WINDOW_MS) {
      return {
        ok: false,
        reason: 'ip_cooldown',
        retryAfterSeconds: Math.ceil((IP_WINDOW_MS - elapsed) / 1000),
      };
    }
  }

  return { ok: true };
}

/**
 * Record a successful deploy. Increments both IP and global counters.
 */
export function recordDeploy(ip: string): void {
  const now = Date.now();
  ipMap.set(ip, { lastDeployAt: now });
  global.count += 1;
}

/**
 * Diagnostic — useful for an /api/deploy-analyst-status endpoint if we add one.
 */
export function getRateLimitStatus() {
  return {
    globalDeploysInWindow: global.count,
    globalCap: GLOBAL_CAP,
    globalWindowMs: GLOBAL_WINDOW_MS,
    activeIpRecords: ipMap.size,
  };
}
