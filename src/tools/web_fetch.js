// src/tools/web_fetch.js
// Descarga una URL y la convierte a markdown limpio para que el agente la lea.
//
// Estrategia:
//   - fetch con timeout y User-Agent honesto
//   - Si es HTML: strip scripts/styles, convierte <p>, <h*>, <li>, <pre>, <code>
//     a markdown básico, quita tags restantes
//   - Si es JSON: lo devuelve formateado
//   - Si es texto plano: lo devuelve tal cual
//   - Límite de tamaño: 50KB (configurable) para no saturar contexto
//
// NO usa dependencias externas (sin turndown, sin cheerio). Conversión mínima a mano.

import { config } from '../config.js';

const DEFAULT_MAX_BYTES = 50_000; // 50KB

function htmlToMarkdown(html) {
  if (!html) return '';
  let text = html;

  // Quitar scripts, styles, nav, footer, header, ads
  text = text.replace(/<script[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<nav[\s\S]*?<\/nav>/gi, '');
  text = text.replace(/<footer[\s\S]*?<\/footer>/gi, '');
  text = text.replace(/<header[\s\S]*?<\/header>/gi, '');
  text = text.replace(/<aside[\s\S]*?<\/aside>/gi, '');
  text = text.replace(/<noscript[\s\S]*?<\/noscript>/gi, '');

  // Convertir elementos a markdown
  // Headings
  text = text.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n');
  text = text.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n');
  text = text.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n');
  text = text.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n#### $1\n');
  text = text.replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, '\n##### $1\n');
  text = text.replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, '\n###### $1\n');

  // Code blocks (preservar contenido)
  text = text.replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, '\n```\n$1\n```\n');
  text = text.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, '\n```\n$1\n```\n');
  text = text.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`');

  // Listas
  text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n');
  text = text.replace(/<\/?(ul|ol)[^>]*>/gi, '\n');

  // Links: [text](url)
  text = text.replace(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)');

  // Párrafos y breaks
  text = text.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '\n$1\n');
  text = text.replace(/<br\s*\/?>/gi, '\n');

  // Blockquotes
  text = text.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, '\n> $1\n');

  // Strong/em
  text = text.replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, '**$2**');
  text = text.replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi, '*$2*');

  // Quitar todos los tags restantes
  text = text.replace(/<[^>]+>/g, '');

  // Decodificar entidades HTML comunes
  text = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&hellip;/g, '...')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));

  // Colapsar whitespace
  text = text.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+/g, ' ').trim();

  return text;
}

function isLikelyHtml(contentType) {
  if (!contentType) return false;
  return contentType.includes('text/html') || contentType.includes('application/xhtml');
}

export const web_fetch = {
  name: 'web_fetch',
  description:
    'Descarga una URL y la convierte a markdown limpio. ' +
    'Útil para leer documentación, artículos, RFCs o respuestas de APIs. ' +
    'Límite de 50KB por defecto (configurable). ' +
    'Si la URL es HTML, lo convierte a markdown. Si es JSON, lo formatea. ' +
    'Si es texto plano, lo devuelve tal cual.',
  inputSchema: {
    url: 'string (URL completa con http:// o https://)',
    maxBytes: 'number (opcional, default 50000)',
    raw: 'boolean (opcional, default false. Si true, devuelve HTML/texto sin procesar)',
  },
  permissions: ['web'],
  async run({ url, maxBytes, raw = false }, ctx) {
    if (!config.webEnabled) {
      throw new Error('web_fetch está deshabilitado (WEB_ENABLED=false). Habilítalo en .env o Variables.');
    }
    if (!url) throw new Error('url requerido');
    if (!/^https?:\/\//i.test(url)) {
      throw new Error('URL debe empezar con http:// o https://');
    }

    // Respetar config.webFetchMaxBytes si no se pasó maxBytes explícito
    const limit = maxBytes || config.webFetchMaxBytes || DEFAULT_MAX_BYTES;

    let res;
    try {
      res = await fetch(url, {
        headers: {
          'User-Agent': 'agent-brain/0.1',
          'Accept': 'text/html,application/json,text/plain,*/*;q=0.8',
          'Accept-Language': config.locale === 'es' ? 'es,en;q=0.8' : 'en;q=0.8',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(20_000),
      });
    } catch (err) {
      return { ok: false, url, error: `fetch falló: ${err.message}` };
    }

    if (!res.ok) {
      return {
        ok: false,
        url,
        status: res.status,
        error: `HTTP ${res.status}`,
      };
    }

    const contentType = res.headers.get('content-type') || '';

    // Leer en streaming con límite real para no cargar archivos enormes en RAM
    // Antes: res.arrayBuffer() cargaba TODO el body, luego truncaba.
    // Ahora: lee hasta `limit` bytes y aborta si se excede.
    const reader = res.body?.getReader();
    if (!reader) {
      // Fallback: arrayBuffer para responses sin body stream
      const buffer = await res.arrayBuffer();
      const bytes = Math.min(buffer.byteLength, limit);
      const text = new TextDecoder('utf-8').decode(buffer.slice(0, bytes));
      return processContent(text, contentType, url, bytes, buffer.byteLength > limit, raw);
    }

    let received = 0;
    let truncated = false;
    const chunks = [];
    try {
      while (received < limit) {
        const { done, value } = await reader.read();
        if (done) break;
        const remaining = limit - received;
        if (value.length > remaining) {
          chunks.push(value.slice(0, remaining));
          received += remaining;
          truncated = true;
          break;
        }
        chunks.push(value);
        received += value.length;
      }
      // Si todavía hay datos, está truncated
      if (!truncated) {
        const { done } = await reader.read();
        if (!done) truncated = true;
      }
    } catch (err) {
      // Timeout o error de red a mitad de lectura — devolver lo que tengamos
      truncated = true;
    } finally {
      try { reader.cancel(); } catch {}
    }

    const buffer = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      buffer.set(chunk, offset);
      offset += chunk.length;
    }
    const text = new TextDecoder('utf-8').decode(buffer);
    return processContent(text, contentType, url, received, truncated, raw);
  },
};

// Procesa el contenido descargado y devuelve el resultado final
function processContent(text, contentType, url, bytes, truncated, raw) {
    if (raw) {
      return {
        ok: true,
        url,
        contentType,
        bytes,
        truncated,
        content: text,
      };
    }

    let content;
    if (isLikelyHtml(contentType)) {
      content = htmlToMarkdown(text);
    } else if (contentType.includes('application/json')) {
      try {
        content = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        content = text;
      }
    } else {
      content = text;
    }

    return {
      ok: true,
      url,
      contentType,
      bytes,
      truncated,
      content,
    };
}
