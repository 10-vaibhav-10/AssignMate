/**
 * Vercel Serverless Function — POST /api/ai
 *
 * Proxies requests to the Groq API using round-robin key rotation.
 * The browser never receives any API key.
 *
 * Environment variables (set in Vercel project settings or .env.local):
 *
 *   Round-robin mode (recommended — one free Groq account per key):
 *     GROQ_API_KEY_1=gsk_...
 *     GROQ_API_KEY_2=gsk_...
 *     GROQ_API_KEY_3=gsk_...
 *     (supports up to GROQ_API_KEY_10)
 *
 *   Single-key fallback:
 *     GROQ_API_KEY=gsk_...
 */

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

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
  /* Only allow POST */
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  const keys = getKeys();

  if (keys.length === 0) {
    return Response.json(
      { error: 'AI service is not configured on this server. Contact the administrator.' },
      { status: 503 },
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
          Authorization: `Bearer ${apiKey}`,
        },
        body,
      });
    } catch {
      // Network error — try the next key if available
      if (attempt < keys.length - 1) continue;
      return Response.json(
        { error: 'AI proxy encountered a network error. Please try again.' },
        { status: 500 },
      );
    }

    // Rate-limited? Try the next key automatically
    if (upstream.status === 429 && attempt < keys.length - 1) {
      continue;
    }

    const responseText = await upstream.text();
    return new Response(responseText, {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // All keys were rate-limited
  return Response.json(
    { error: 'All AI keys are currently rate-limited. Please try again in a moment.' },
    { status: 429 },
  );
}
