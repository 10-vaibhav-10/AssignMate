import { defineConfig, loadEnv } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const GROQ_URL   = 'https://api.groq.com/openai/v1/chat/completions';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

const GEMINI_MODEL_MAP: Record<string, string> = {
  'llama-3.3-70b-versatile': 'gemini-2.0-flash',
  'llama-3.1-8b-instant':    'gemini-2.0-flash-lite',
};

/**
 * Dev-server plugin: intercepts POST /api/ai and forwards to Gemini or Groq,
 * injecting the server-side API key so the browser never sees it.
 *
 * Provider priority (matches api/ai.ts):
 *   1. GEMINI_API_KEY_1 … _N  (or GEMINI_API_KEY)  → Google Gemini (1 M TPM free)
 *   2. GROQ_API_KEY_1 … _N    (or GROQ_API_KEY)    → Groq fallback (6 k TPM free)
 *
 * Both support round-robin across multiple keys.
 */
function aiProxy(
  provider: { url: string; keys: string[]; isGemini: boolean },
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
          res.end(
            JSON.stringify({
              error:
                'No AI API key found. Add GEMINI_API_KEY_1=AIza... (recommended) ' +
                'or GROQ_API_KEY_1=gsk_... to .env.local and restart the dev server. ' +
                'Free Gemini key: https://aistudio.google.com/app/apikey',
            }),
          );
          return;
        }

        const startIdx = keyIndex % provider.keys.length;
        keyIndex++;

        let rawBody = '';
        req.on('data', (chunk: Buffer) => { rawBody += chunk.toString(); });
        req.on('end', async () => {

          /* Translate model names when using Gemini */
          let body = rawBody;
          if (provider.isGemini) {
            try {
              const parsed = JSON.parse(body) as { model?: string };
              const mapped = parsed.model
                ? (GEMINI_MODEL_MAP[parsed.model] ?? 'gemini-2.0-flash')
                : 'gemini-2.0-flash';
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
                },
                body,
              });

              if (upstream.status === 429 && attempt < provider.keys.length - 1) {
                continue;
              }

              const text = await upstream.text();
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

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  /* Gemini keys take priority */
  const geminiKeys: string[] = [];
  for (let i = 1; i <= 10; i++) {
    const k = env[`GEMINI_API_KEY_${i}`]?.trim();
    if (k) geminiKeys.push(k);
  }
  if (geminiKeys.length === 0 && env.GEMINI_API_KEY?.trim()) {
    geminiKeys.push(env.GEMINI_API_KEY.trim());
  }

  /* Groq fallback */
  const groqKeys: string[] = [];
  for (let i = 1; i <= 10; i++) {
    const k = env[`GROQ_API_KEY_${i}`]?.trim();
    if (k) groqKeys.push(k);
  }
  if (groqKeys.length === 0 && env.GROQ_API_KEY?.trim()) {
    groqKeys.push(env.GROQ_API_KEY.trim());
  }

  let provider: { url: string; keys: string[]; isGemini: boolean };
  if (geminiKeys.length > 0) {
    console.log(`[ai-proxy] Using Gemini — ${geminiKeys.length} key${geminiKeys.length > 1 ? 's' : ''} (1M TPM free tier)`);
    provider = { url: GEMINI_URL, keys: geminiKeys, isGemini: true };
  } else if (groqKeys.length > 0) {
    console.log(`[ai-proxy] Using Groq — ${groqKeys.length} key${groqKeys.length > 1 ? 's' : ''} (6k TPM free tier)`);
    provider = { url: GROQ_URL, keys: groqKeys, isGemini: false };
  } else {
    console.warn('[ai-proxy] No API keys found. Add GEMINI_API_KEY_1 or GROQ_API_KEY_1 to .env.local');
    provider = { url: GROQ_URL, keys: [], isGemini: false };
  }

  return {
    plugins: [
      react(),
      tailwindcss(),
      aiProxy(provider),
    ],
  };
});
