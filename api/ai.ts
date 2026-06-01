/**
 * Vercel Edge Function — POST /api/ai
 *
 * Runs on Vercel's Edge Runtime (V8 isolate, not Node.js).
 * Edge gives 30 s wall-clock time on ALL plans including Hobby,
 * vs the 10 s hard cap that applies to Serverless on Hobby.
 *
 * Proxies requests to the Groq API using round-robin key rotation.
 * The browser / Capacitor app never receives any API key.
 *
 * Environment variables (set in Vercel project settings):
 *
 *   Round-robin mode (one free Groq account per key):
 *     GROQ_API_KEY_1=gsk_...
 *     GROQ_API_KEY_2=gsk_...
 *     GROQ_API_KEY_3=gsk_...      (supports up to GROQ_API_KEY_10)
 *
 *   Single-key fallback:
 *     GROQ_API_KEY=gsk_...
 */

export const config = { runtime: 'edge' };

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

/** CORS headers — required for Capacitor (capacitor://localhost) cross-origin calls. */
const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

/** JSON response with CORS headers baked in. */
function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

/** Collect all configured API keys in order. */
function getKeys(): string[] {
  const keys: string[] = [];
  for (let i = 1; i <= 10; i++) {
    const k = (process.env[`GROQ_API_KEY_${i}`] ?? '').trim();
    if (k) keys.push(k);
  }
  if (keys.length === 0) {
    const single = (process.env.GROQ_API_KEY ?? '').trim();
    if (single) keys.push(single);
  }
  return keys;
}

export default async function handler(request: Request): Promise<Response> {
  try {
    /* CORS preflight */
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

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
    const startIndex = Math.floor(Math.random() * keys.length);

    for (let attempt = 0; attempt < keys.length; attempt++) {
      const apiKey = keys[(startIndex + attempt) % keys.length];

      let upstream: Response;
      try {
        upstream = await fetch(GROQ_URL, {
          method:  'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization:  `Bearer ${apiKey}`,
          },
          body,
        });
      } catch {
        if (attempt < keys.length - 1) continue;
        return jsonRes({ error: 'Could not reach AI provider. Please try again.' }, 502);
      }

      // Rate-limited — try the next key
      if (upstream.status === 429 && attempt < keys.length - 1) continue;

      const text = await upstream.text();
      return new Response(text, {
        status:  upstream.status,
        headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }

    return jsonRes(
      { error: 'All AI keys are currently rate-limited. Please try again in a moment.' },
      429,
    );

  } catch (err) {
    console.error('[api/ai]', err);
    return jsonRes({ error: 'Internal server error. Please try again.' }, 500);
  }
}
