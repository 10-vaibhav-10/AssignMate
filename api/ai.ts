/**
 * Vercel Edge Function — POST /api/ai
 *
 * Runs on Vercel's Edge Runtime (V8 isolate, not Node.js).
 * Edge gives 30 s wall-clock time on ALL plans including Hobby.
 *
 * Supports two AI providers (auto-detected from env vars):
 *
 *   Google Gemini — RECOMMENDED (1 000 000 TPM free tier, no size headaches)
 *     GEMINI_API_KEY_1=AIza...
 *     GEMINI_API_KEY_2=AIza...     (supports up to GEMINI_API_KEY_10)
 *     Single-key fallback: GEMINI_API_KEY=AIza...
 *     Get a free key: https://aistudio.google.com/app/apikey
 *
 *   Groq — fallback (6 000 TPM free tier, hits limits on large PDFs)
 *     GROQ_API_KEY_1=gsk_...
 *     GROQ_API_KEY_2=gsk_...       (supports up to GROQ_API_KEY_10)
 *     Single-key fallback: GROQ_API_KEY=gsk_...
 *
 * If both are configured, Gemini is used automatically (higher limits).
 * Model names sent by the client are Groq names; they are translated
 * transparently when Gemini is active — no front-end changes needed.
 */

export const config = { runtime: 'edge' };

const GROQ_URL   = 'https://api.groq.com/openai/v1/chat/completions';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

/**
 * Translate Groq model names → Gemini equivalents.
 * Both are in Gemini's free tier with 1 M TPM.
 */
const GEMINI_MODEL_MAP: Record<string, string> = {
  'llama-3.3-70b-versatile': 'gemini-1.5-flash',     // full-quality analysis
  'llama-3.1-8b-instant':    'gemini-1.5-flash-8b',  // fast structured extraction
  'meta-llama/llama-4-scout-17b-16e-instruct':  'gemini-1.5-flash',      // vision / image extraction
};

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

/** Collect all configured API keys for a given env-var prefix. */
function getKeysByPrefix(prefix: string): string[] {
  const keys: string[] = [];
  for (let i = 1; i <= 10; i++) {
    const k = (process.env[`${prefix}_${i}`] ?? '').trim();
    if (k) keys.push(k);
  }
  if (keys.length === 0) {
    const single = (process.env[prefix] ?? '').trim();
    if (single) keys.push(single);
  }
  return keys;
}

/** Pick the best available provider. Gemini wins if configured. */
function getProvider(): { url: string; keys: string[]; isGemini: boolean } {
  const geminiKeys = getKeysByPrefix('GEMINI_API_KEY');
  if (geminiKeys.length > 0) {
    return { url: GEMINI_URL, keys: geminiKeys, isGemini: true };
  }
  const groqKeys = getKeysByPrefix('GROQ_API_KEY');
  return { url: GROQ_URL, keys: groqKeys, isGemini: false };
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

    const { url, keys, isGemini } = getProvider();

    if (keys.length === 0) {
      return jsonRes(
        {
          error:
            'AI service is not configured. ' +
            'Add GEMINI_API_KEY_1 (recommended — free, 1M TPM) or GROQ_API_KEY_1 ' +
            'in Vercel environment variables. ' +
            'Free Gemini key: https://aistudio.google.com/app/apikey',
        },
        503,
      );
    }

    let body = await request.text();

    /* Translate Groq model names → Gemini model names when using Gemini */
    if (isGemini) {
      try {
        const parsed = JSON.parse(body) as { model?: string };
        const mapped = parsed.model
          ? (GEMINI_MODEL_MAP[parsed.model] ?? 'gemini-1.5-flash')
          : 'gemini-1.5-flash';
        body = JSON.stringify({ ...parsed, model: mapped });
      } catch {
        /* malformed body — send as-is, let Gemini return the error */
      }
    }

    const startIndex = Math.floor(Math.random() * keys.length);

    for (let attempt = 0; attempt < keys.length; attempt++) {
      const apiKey = keys[(startIndex + attempt) % keys.length];

      let upstream: Response;
      try {
        upstream = await fetch(url, {
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
