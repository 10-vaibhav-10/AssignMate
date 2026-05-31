import * as pdfjsLib from 'pdfjs-dist';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';

// Use CDN worker — avoids Vite bundling complexity
pdfjsLib.GlobalWorkerOptions.workerSrc =
  `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

const VISION_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';

/** Extract text from a PDF file (client-side, no API needed) */
export async function extractFromPdf(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf         = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const pageTexts: string[] = [];
  const maxPages = Math.min(pdf.numPages, 25); // read up to 25 pages so assessment tables aren't cut off

  for (let i = 1; i <= maxPages; i++) {
    const page    = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .filter((item): item is TextItem => 'str' in item)
      .map((item) => item.str)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (pageText) pageTexts.push(`--- Page ${i} ---\n${pageText}`);
  }

  const result = pageTexts.join('\n\n');
  if (!result.trim()) throw new Error('No readable text found in PDF. Try an image instead.');
  return result;
}

/**
 * Extract assignment text from an image using Groq vision.
 * Calls /api/ai (our server-side proxy) — no API key needed in the browser.
 */
export async function extractFromImage(file: File): Promise<string> {
  const base64 = await fileToBase64(file);

  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model:      VISION_MODEL,
      max_tokens: 1500,
      messages: [
        {
          role: 'user',
          content: [
            {
              type:      'image_url',
              image_url: { url: `data:${file.type};base64,${base64}` },
            },
            {
              type: 'text',
              text: 'Extract all text from this assignment document or question paper image. Return only the extracted text, preserving structure. No commentary or explanation.',
            },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    type Err = { error?: string | { message?: string } };
    const body = await res.json().catch(() => ({})) as Err;
    const msg =
      typeof body.error === 'string'
        ? body.error
        : (body.error?.message ?? `Vision API error ${res.status}`);
    throw new Error(msg);
  }

  type Resp = { choices: Array<{ message: { content: string } }> };
  const data = (await res.json()) as Resp;
  const text = data.choices[0]?.message?.content ?? '';
  if (!text.trim()) throw new Error('Could not extract text from image.');
  return text;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]); // strip data URL prefix
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
