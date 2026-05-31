import { defineConfig, loadEnv } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

/**
 * Dev-server plugin: intercepts POST /api/ai and forwards to Groq,
 * injecting the server-side API key(s) so the browser never sees them.
 *
 * Supports round-robin across multiple keys (GROQ_API_KEY_1 … _N).
 * Falls back to a single GROQ_API_KEY if no numbered keys are set.
 *
 * In production this route is handled by api/ai.ts (Vercel serverless function).
 */
function groqProxy(keys: string[]): Plugin {
  // Module-level counter: persists for the entire dev-server session,
  // giving true round-robin across requests.
  let keyIndex = 0;

  return {
    name: 'groq-proxy',
    configureServer(server) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      server.middlewares.use('/api/ai', (req: any, res: any, next: any) => {
        if (req.method !== 'POST') { next(); return; }

        if (keys.length === 0) {
          res.statusCode = 503;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              error:
                'No Groq API key found. ' +
                'Add GROQ_API_KEY_1=gsk_... (or GROQ_API_KEY=gsk_...) to .env.local and restart.',
            }),
          );
          return;
        }

        // Pick the next key in round-robin order
        const apiKey = keys[keyIndex % keys.length];
        keyIndex++;

        let body = '';
        req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
        req.on('end', async () => {
          // Retry across remaining keys on 429
          const startIdx = (keyIndex - 1) % keys.length;

          for (let attempt = 0; attempt < keys.length; attempt++) {
            const key = keys[(startIdx + attempt) % keys.length];
            try {
              const upstream = await fetch(GROQ_URL, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${key}`,
                },
                body,
              });

              if (upstream.status === 429 && attempt < keys.length - 1) {
                continue; // try the next key
              }

              const text = await upstream.text();
              res.statusCode = upstream.status;
              res.setHeader('Content-Type', 'application/json');
              res.end(text);
              return;
            } catch (err) {
              if (attempt < keys.length - 1) continue;
              console.error('[groq-proxy] upstream error:', err);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'Groq proxy error. Check console.' }));
              return;
            }
          }

          // All keys rate-limited
          res.statusCode = 429;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'All API keys are rate-limited. Try again in a moment.' }));
        });
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Load ALL env vars for this mode — empty prefix means no VITE_ filter,
  // so GROQ_API_KEY / GROQ_API_KEY_N are available here but never in the browser bundle.
  const env = loadEnv(mode, process.cwd(), '');

  // Collect keys: numbered first (GROQ_API_KEY_1 … _10), then single fallback
  const keys: string[] = [];
  for (let i = 1; i <= 10; i++) {
    const k = env[`GROQ_API_KEY_${i}`]?.trim();
    if (k) keys.push(k);
  }
  if (keys.length === 0 && env.GROQ_API_KEY?.trim()) {
    keys.push(env.GROQ_API_KEY.trim());
  }

  if (keys.length > 0) {
    console.log(`[groq-proxy] Loaded ${keys.length} API key${keys.length > 1 ? 's' : ''} — round-robin active`);
  }

  return {
    plugins: [
      react(),
      tailwindcss(),
      groqProxy(keys),
    ],
  };
});
