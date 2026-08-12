// src/tools/web_search.js
// Búsqueda web gratuita sin API key.
//
// Estrategia:
//   - Usa DuckDuckGo HTML endpoint (https://html.duckduckgo.com/html/?q=QUERY)
//   - No requiere API key ni registro
//   - Parsea resultados del HTML (titles, URLs, snippets)
//   - Limita a 8 resultados para no saturar el contexto del agente
//
// Cuando fallback a SearXNG público:
//   - Si DuckDuckGo bloquea (403/429), prueba con un SearXNG público
//   - Lista de instancias en https://searx.space/

import { config } from '../config.js';

const DDG_ENDPOINT = 'https://html.duckduckgo.com/html/';
const SEARXNG_FALLBACKS = [
  'https://searx.be/search',
  'https://search.bus-hit.me/search',
  'https://searx.tiekoetter.com/search',
];

// Limpia HTML básico: quita tags, decodifica entidades comunes
function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Parsea resultados de DuckDuckGo HTML
function parseDdgResults(html, maxResults = 8) {
  const results = [];
  // DDG usa <div class="result">...</div> con <a class="result__a"> dentro
  const resultRegex = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = resultRegex.exec(html)) !== null && results.length < maxResults) {
    let url = match[1];
    // DDG usa redirect URLs tipo //duckduckgo.com/l/?uddg=ENCODED
    const uddgMatch = url.match(/uddg=([^&]+)/);
    if (uddgMatch) {
      try {
        url = decodeURIComponent(uddgMatch[1]);
      } catch {
        // mantener url original si falla decode
      }
    }
    const title = stripHtml(match[2]);
    const snippet = stripHtml(match[3]);
    if (title && url) {
      results.push({ title, url, snippet });
    }
  }
  return results;
}

// Parsea resultados de SearXNG (formato similar)
function parseSearxResults(html, maxResults = 8) {
  const results = [];
  const resultRegex = /<article[^>]+class="[^"]*result[^"]*"[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<p[^>]+class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/p>/gi;
  let match;
  while ((match = resultRegex.exec(html)) !== null && results.length < maxResults) {
    const url = match[1];
    const title = stripHtml(match[2]);
    const snippet = stripHtml(match[3]);
    if (title && url) {
      results.push({ title, url, snippet });
    }
  }
  // Fallback más simple si el regex no matchea
  if (results.length === 0) {
    const simpleRegex = /<h[34][^>]*><a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a><\/h[34]>/gi;
    while ((match = simpleRegex.exec(html)) !== null && results.length < maxResults) {
      results.push({ title: stripHtml(match[2]), url: match[1], snippet: '' });
    }
  }
  return results;
}

async function fetchDdg(query, maxResults) {
  const url = `${DDG_ENDPOINT}?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; agent-brain/0.1; +https://github.com/Criptobox/agente-z)',
      'Accept': 'text/html',
      'Accept-Language': config.locale === 'es' ? 'es,en;q=0.8' : 'en;q=0.8',
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`DDG ${res.status}`);
  }
  const html = await res.text();
  return parseDdgResults(html, maxResults);
}

async function fetchSearx(query, maxResults) {
  for (const endpoint of SEARXNG_FALLBACKS) {
    try {
      const url = `${endpoint}?q=${encodeURIComponent(query)}&format=html`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; agent-brain/0.1)',
          'Accept': 'text/html',
        },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) continue;
      const html = await res.text();
      const results = parseSearxResults(html, maxResults);
      if (results.length > 0) return results;
    } catch {
      // probar siguiente instancia
    }
  }
  return [];
}

export const web_search = {
  name: 'web_search',
  description:
    'Busca en internet sin API key (usa DuckDuckGo HTML con fallback a SearXNG público). ' +
    'Devuelve hasta 8 resultados con title, url y snippet. ' +
    'Útil para que research y analyst encuentren documentación, issues conocidos, ' +
    'o patrones de error antes de proponer una solución.',
  inputSchema: {
    query: 'string (consulta de búsqueda, máx 200 chars)',
    maxResults: 'number (opcional, default 5, máx 8)',
  },
  permissions: ['web'],
  async run({ query, maxResults = 5 }, ctx) {
    if (!query) throw new Error('query requerido');
    if (typeof query !== 'string' || query.length > 200) {
      throw new Error('query debe ser string de máx 200 chars');
    }
    const limit = Math.min(Math.max(maxResults || 5, 1), 8);

    let results = [];
    let source = null;
    let error = null;

    try {
      results = await fetchDdg(query, limit);
      source = 'duckduckgo';
    } catch (err) {
      error = `DDG: ${err.message}`;
      console.error('[web_search] DDG falló:', err.message);
    }

    if (results.length === 0) {
      try {
        results = await fetchSearx(query, limit);
        source = results.length > 0 ? 'searxng' : null;
      } catch (err) {
        error = `${error || ''}; SearXNG: ${err.message}`;
      }
    }

    return {
      ok: results.length > 0,
      query,
      source,
      count: results.length,
      results,
      error: results.length === 0 ? (error || 'Sin resultados en ninguna fuente') : null,
    };
  },
};
