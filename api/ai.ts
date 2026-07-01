/**
 * Vercel Edge Function — POST /api/ai
 *
 * Provider priority (set env vars in Vercel dashboard):
 *   1. OPENROUTER_API_KEY_1  → OpenRouter (unified gateway, gemini-2.0-flash)
 *   2. OPENAI_API_KEY_1      → OpenAI gpt-4o-mini
 *   3. GEMINI_API_KEY_1      → Google Gemini (gemini-3.5-flash, 250k TPM free tier)
 *   4. GROQ_API_KEY_1        → Groq (12k TPM free tier, 1,000 req/day cap per key)
 */

export const config = { runtime: 'edge' };

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENAI_URL     = 'https://api.openai.com/v1/chat/completions';
const GROQ_URL       = 'https://api.groq.com/openai/v1/chat/completions';
const GEMINI_URL     = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

const OPENROUTER_MODEL_MAP: Record<string, string> = {
  'llama-3.3-70b-versatile':                   'meta-llama/llama-3.3-70b-instruct',
  'llama-3.1-8b-instant':                      'meta-llama/llama-3.3-70b-instruct',
  'meta-llama/llama-4-scout-17b-16e-instruct': 'meta-llama/llama-3.3-70b-instruct',
};

const OPENAI_MODEL_MAP: Record<string, string> = {
  'llama-3.3-70b-versatile':                   'gpt-4o-mini',
  'llama-3.1-8b-instant':                      'gpt-4o-mini',
  'meta-llama/llama-4-scout-17b-16e-instruct': 'gpt-4o-mini',
};

const GEMINI_MODEL_MAP: Record<string, string> = {
  'llama-3.3-70b-versatile':                   'gemini-3.5-flash',
  'llama-3.1-8b-instant':                      'gemini-3.1-flash-lite',
  'meta-llama/llama-4-scout-17b-16e-instruct': 'gemini-3.5-flash',
};

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

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

function getProvider(): {
  url: string;
  keys: string[];
  modelMap: Record<string, string>;
  fallback: string;
  extraHeaders?: Record<string, string>;
} {
  const openrouterKeys = getKeysByPrefix('OPENROUTER_API_KEY');
  if (openrouterKeys.length > 0) {
    return {
      url: OPENROUTER_URL,
      keys: openrouterKeys,
      modelMap: OPENROUTER_MODEL_MAP,
      fallback: 'meta-llama/llama-3.3-70b-instruct',
      extraHeaders: { 'HTTP-Referer': 'https://assignmate.app', 'X-Title': 'AssignMate' },
    };
  }
  const openaiKeys = getKeysByPrefix('OPENAI_API_KEY');
  if (openaiKeys.length > 0) {
    return { url: OPENAI_URL, keys: openaiKeys, modelMap: OPENAI_MODEL_MAP, fallback: 'gpt-4o-mini' };
  }
  const geminiKeys = getKeysByPrefix('GEMINI_API_KEY');
  if (geminiKeys.length > 0) {
    return { url: GEMINI_URL, keys: geminiKeys, modelMap: GEMINI_MODEL_MAP, fallback: 'gemini-3.5-flash' };
  }
  const groqKeys = getKeysByPrefix('GROQ_API_KEY');
  return { url: GROQ_URL, keys: groqKeys, modelMap: {}, fallback: 'llama-3.3-70b-versatile' };
}

export default async function handler(request: Request): Promise<Response> {
  try {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (request.method !== 'POST') return jsonRes({ error: 'Method not allowed' }, 405);

    const { url, keys, modelMap, fallback, extraHeaders } = getProvider();

    if (keys.length === 0) {
      return jsonRes({ error: 'AI service not configured. Add OPENROUTER_API_KEY_1 in Vercel env vars.' }, 503);
    }

    let body = await request.text();

    if (Object.keys(modelMap).length > 0) {
      try {
        const parsed = JSON.parse(body) as { model?: string };
        const mapped = parsed.model ? (modelMap[parsed.model] ?? fallback) : fallback;
        body = JSON.stringify({ ...parsed, model: mapped });
      } catch { /* send as-is */ }
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
            ...extraHeaders,
          },
          body,
        });
      } catch {
        if (attempt < keys.length - 1) continue;
        return jsonRes({ error: 'Could not reach AI provider. Please try again.' }, 502);
      }

      if (upstream.status === 429 && attempt < keys.length - 1) continue;

      const text = await upstream.text();
      return new Response(text, {
        status:  upstream.status,
        headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }

    return jsonRes({ error: 'All AI keys are currently rate-limited. Please try again in a moment.' }, 429);

  } catch (err) {
    console.error('[api/ai]', err);
    return jsonRes({ error: 'Internal server error. Please try again.' }, 500);
  }
}
