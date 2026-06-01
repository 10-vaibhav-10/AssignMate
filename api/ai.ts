/**
 * Vercel Serverless Function — POST /api/ai
 *
 * Proxies requests to the Groq API using round-robin key rotation.
 * The browser / Capacitor app never receives any API key.
 *
 * Environment variables (set in Vercel project settings):
 *
 *   Round-robin mode (recommended — one free Groq account per key):
 *     GROQ_API_KEY_1=gsk_...
 *     GROQ_API_KEY_2=gsk_...
 *     GROQ_API_KEY_3=gsk_...
 *     (supports up to GROQ_API_KEY_10)
 *
 *   Single-key fallback:
 *     GROQ_API_KEY=gsk_...
 *
 * maxDuration is set in vercel.json → functions → api/ai.ts
 */

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

/**
 * CORS headers — required so the Capacitor Android app (origin: capacitor://localhost)
 * and any cross-origin caller can reach this endpoint.
 */
const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

/**
 * Safe JSON response helper.
 * Avoids Response.json() which is NOT available on Vercel's Node 18 runtime
 * (it was only added in Node 21+).
 */
function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

/** Collect all configured API keys in order. */
function getKeys(): string[] {
  const keys: string[] = [];

  // Numbered keys: GROQ_API_KEY_1 … GROQ_API_KEY_10
  for (let i = 1; i <= 10; i++) {
    const k = process.env[`GROQ_API_KEY_${i}`]?.trim();
    if (k) keys.push(k);
  }

  // Single-key fallback for backward compatibility
  if (keys.length === 0) {
    const single = process.env.GROQ_API_KEY?.trim();
    if (single) keys.push(single);
  }

  return keys;
}

export default async function handler(request: Request): Promise<Response> {
  /* Outer safety net — converts any uncaught exception into a clean 500
     instead of letting Vercel emit an opaque gateway error. */
  try {
    /* ── CORS preflight ─────────────────────────────────────────── */
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    /* Only allow POST */
    if (request.method !== 'POST') {
      return jsonRes({ error: 'Method not allowed' }, 405);
    }

    const keys = getKeys();

    if (keys.length === 0) {
      return jsonRes(
        { error: 'AI service is not configured. Add GROQ_API_KEY_1 in Vercel environment variables.' },
        503,
      );
    }

    const body = await request.text();

    // Pick a random starting key so load distributes evenly across stateless invocations.
    // On a 429 we walk through the remaining keys until one succeeds.
    const startIndex = Math.floor(Math.random() * keys.length);

    for (let attempt = 0; attempt < keys.length; attempt++) {
      const apiKey = keys[(startIndex + attempt) % keys.length];

      let upstream: Response;
      try {
        upstream = await fetch(GROQ_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization:  `Bearer ${apiKey}`,
          },
          body,
        });
      } catch (fetchErr) {
        // Network-level failure — try the next key if available
        if (attempt < keys.length - 1) continue;
        console.error('[api/ai] fetch error:', fetchErr);
        return jsonRes({ error: 'Could not reach AI provider. Please try again.' }, 502);
      }

      // Rate-limited? Automatically try the next key
      if (upstream.status === 429 && attempt < keys.length - 1) {
        continue;
      }

      const responseText = await upstream.text();
      return new Response(responseText, {
        status: upstream.status,
        headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }

    // All keys were rate-limited
    return jsonRes(
      { error: 'All AI keys are currently rate-limited. Please try again in a moment.' },
      429,
    );

  } catch (err) {
    console.error('[api/ai] Unexpected error:', err);
    return jsonRes(
      { error: 'Internal server error. Please try again.' },
      500,
    );
  }
}
