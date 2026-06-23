import { defineConfig, loadEnv } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENAI_URL     = 'https://api.openai.com/v1/chat/completions';
const GROQ_URL       = 'https://api.groq.com/openai/v1/chat/completions';
const GEMINI_URL     = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

// OpenRouter model IDs — maps the Llama "alias" names the client sends
const OPENROUTER_MODEL_MAP: Record<string, string> = {
  'llama-3.3-70b-versatile': 'meta-llama/llama-3.3-70b-instruct',
  'llama-3.1-8b-instant':    'meta-llama/llama-3.3-70b-instruct',
};

const OPENAI_MODEL_MAP: Record<string, string> = {
  'llama-3.3-70b-versatile': 'gpt-4o-mini',
  'llama-3.1-8b-instant':    'gpt-4o-mini',
};

const GEMINI_MODEL_MAP: Record<string, string> = {
  'llama-3.3-70b-versatile': 'gemini-2.0-flash',
  'llama-3.1-8b-instant':    'gemini-2.0-flash-lite',
};

/**
 * Dev-server plugin: intercepts POST /api/ai and forwards to the configured
 * AI provider, injecting the server-side API key so the browser never sees it.
 *
 * Provider priority (matches api/ai.ts):
 *   1. OPENROUTER_API_KEY_1 … _N  → OpenRouter (unified gateway, many models)
 *   2. OPENAI_API_KEY_1 … _N      → OpenAI GPT-4o-mini
 *   3. GEMINI_API_KEY_1 … _N      → Google Gemini (1M TPM free)
 *   4. GROQ_API_KEY_1 … _N        → Groq fallback (6k TPM free)
 */
function aiProxy(
  provider: {
    url: string;
    keys: string[];
    modelMap: Record<string, string>;
    fallback: string;
    extraHeaders?: Record<string, string>;
  },
): Plugin {
  let keyIndex = 0;

  return {
    name: 'ai-proxy',
    configureServer(server) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      server.middlewares.use('/api/ai', (req: any, res: any, next: any) => {
        if (req.method !== 'POST') { next(); return; }

        if (provider.keys.length === 0) {
          res.statusCode = 503;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            error: 'No AI API key found. Add OPENROUTER_API_KEY_1=sk-or-... to .env.local and restart the dev server.',
          }));
          return;
        }

        const startIdx = keyIndex % provider.keys.length;
        keyIndex++;

        let rawBody = '';
        req.on('data', (chunk: Buffer) => { rawBody += chunk.toString(); });
        req.on('end', async () => {

          /* Translate model names to the provider's equivalents */
          let body = rawBody;
          if (Object.keys(provider.modelMap).length > 0) {
            try {
              const parsed = JSON.parse(body) as { model?: string };
              const mapped = parsed.model
                ? (provider.modelMap[parsed.model] ?? provider.fallback)
                : provider.fallback;
              body = JSON.stringify({ ...parsed, model: mapped });
            } catch { /* send as-is */ }
          }

          for (let attempt = 0; attempt < provider.keys.length; attempt++) {
            const key = provider.keys[(startIdx + attempt) % provider.keys.length];
            try {
              const upstream = await fetch(provider.url, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${key}`,
                  ...provider.extraHeaders,
                },
                body,
              });

              if (upstream.status === 429 && attempt < provider.keys.length - 1) {
                continue;
              }

              const text = await upstream.text();
              if (upstream.status !== 200) {
                console.error(`[ai-proxy] upstream ${upstream.status}:`, text.slice(0, 300));
              }
              res.statusCode = upstream.status;
              res.setHeader('Content-Type', 'application/json');
              res.end(text);
              return;
            } catch (err) {
              if (attempt < provider.keys.length - 1) continue;
              console.error('[ai-proxy] upstream error:', err);
              res.statusCode = 502;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'AI proxy error. Check console.' }));
              return;
            }
          }

          res.statusCode = 429;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'All API keys are rate-limited. Try again in a moment.' }));
        });
      });
    },
  };
}

function collectKeys(env: Record<string, string>, prefix: string): string[] {
  const keys: string[] = [];
  for (let i = 1; i <= 10; i++) {
    const k = env[`${prefix}_${i}`]?.trim();
    if (k) keys.push(k);
  }
  if (keys.length === 0 && env[prefix]?.trim()) keys.push(env[prefix].trim());
  return keys;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  const openrouterKeys = collectKeys(env, 'OPENROUTER_API_KEY');
  const openaiKeys     = collectKeys(env, 'OPENAI_API_KEY');
  const geminiKeys     = collectKeys(env, 'GEMINI_API_KEY');
  const groqKeys       = collectKeys(env, 'GROQ_API_KEY');

  let provider: {
    url: string;
    keys: string[];
    modelMap: Record<string, string>;
    fallback: string;
    extraHeaders?: Record<string, string>;
  };

  if (openrouterKeys.length > 0) {
    console.log(`[ai-proxy] Using OpenRouter — ${openrouterKeys.length} key${openrouterKeys.length > 1 ? 's' : ''} (llama-3.3-70b-instruct)`);
    provider = {
      url: OPENROUTER_URL,
      keys: openrouterKeys,
      modelMap: OPENROUTER_MODEL_MAP,
      fallback: 'meta-llama/llama-3.3-70b-instruct',
      extraHeaders: { 'HTTP-Referer': 'https://assignmate.app', 'X-Title': 'AssignMate' },
    };
  } else if (openaiKeys.length > 0) {
    console.log(`[ai-proxy] Using OpenAI — ${openaiKeys.length} key${openaiKeys.length > 1 ? 's' : ''} (gpt-4o-mini)`);
    provider = { url: OPENAI_URL, keys: openaiKeys, modelMap: OPENAI_MODEL_MAP, fallback: 'gpt-4o-mini' };
  } else if (geminiKeys.length > 0) {
    console.log(`[ai-proxy] Using Gemini — ${geminiKeys.length} key${geminiKeys.length > 1 ? 's' : ''} (1M TPM free tier)`);
    provider = { url: GEMINI_URL, keys: geminiKeys, modelMap: GEMINI_MODEL_MAP, fallback: 'gemini-2.0-flash' };
  } else if (groqKeys.length > 0) {
    console.log(`[ai-proxy] Using Groq — ${groqKeys.length} key${groqKeys.length > 1 ? 's' : ''} (6k TPM free tier)`);
    provider = { url: GROQ_URL, keys: groqKeys, modelMap: {}, fallback: 'llama-3.3-70b-versatile' };
  } else {
    console.warn('[ai-proxy] No API keys found. Add OPENROUTER_API_KEY_1=sk-or-... to .env.local');
    provider = { url: GROQ_URL, keys: [], modelMap: {}, fallback: 'llama-3.3-70b-versatile' };
  }

  return {
    plugins: [react(), tailwindcss(), aiProxy(provider)],
  };
});
