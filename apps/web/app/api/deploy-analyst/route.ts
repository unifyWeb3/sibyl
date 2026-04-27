/**
 * POST /api/deploy-analyst
 *
 * Streams deploy progress via Server-Sent Events (SSE).
 *
 * Request body: { name: string, strategy: 0|1|2|3, _hp?: string }
 *
 * SSE events:
 *   • progress — { step, message }
 *   • complete — { step: 'complete', message, data: DeployedAnalyst }
 *   • error    — { step: 'error', message }
 *
 * Env required: HACKATHON_PRIVATE_KEY (server-side only)
 */

import { NextRequest } from 'next/server';
import { checkRateLimit, recordDeploy } from '@/lib/rate-limit';
import {
  deployAnalyst,
  validateName,
  validateStrategy,
} from '@/lib/deploy-analyst';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // seconds — Vercel default is 10s, we need ~40s

function sseEvent(event: string, data: any): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  const real = req.headers.get('x-real-ip');
  if (real) return real;
  return 'unknown';
}

export async function POST(req: NextRequest) {
  // Parse body
  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'invalid json' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  // Honeypot — if filled, silently reject as if success but never deploy
  if (body._hp && typeof body._hp === 'string' && body._hp.trim().length > 0) {
    return new Response(JSON.stringify({ error: 'invalid request' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  // Validate
  const nameCheck = validateName(body.name);
  if (!nameCheck.ok) {
    return new Response(JSON.stringify({ error: nameCheck.reason }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  if (!validateStrategy(body.strategy)) {
    return new Response(JSON.stringify({ error: 'invalid strategy' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  // Rate limit
  const ip = getClientIp(req);
  const limit = checkRateLimit(ip);
  if (!limit.ok) {
    const message =
      limit.reason === 'global_cap'
        ? `Daily deploy cap reached. Try again in ~${Math.ceil((limit.retryAfterSeconds ?? 0) / 3600)}h.`
        : `Cooldown active. Try again in ~${Math.ceil((limit.retryAfterSeconds ?? 0) / 60)}m.`;
    return new Response(
      JSON.stringify({ error: message, reason: limit.reason }),
      {
        status: 429,
        headers: { 'content-type': 'application/json' },
      }
    );
  }

  // Stream deploy progress as SSE
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const generator = deployAnalyst({
          name: nameCheck.cleanName,
          strategy: body.strategy,
        });

        let succeeded = false;
        for await (const update of generator) {
          if (update.step === 'complete') {
            succeeded = true;
            controller.enqueue(encoder.encode(sseEvent('complete', update)));
          } else if (update.step === 'error') {
            controller.enqueue(encoder.encode(sseEvent('error', update)));
          } else {
            controller.enqueue(encoder.encode(sseEvent('progress', update)));
          }
        }

        if (succeeded) {
          recordDeploy(ip);
        }
      } catch (err: any) {
        controller.enqueue(
          encoder.encode(
            sseEvent('error', {
              step: 'error',
              message: `Server error: ${err.message ?? 'unknown'}`,
            })
          )
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      'connection': 'keep-alive',
      'x-accel-buffering': 'no',
    },
  });
}
