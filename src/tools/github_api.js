// src/tools/github_api.js
// Llamada cruda a la REST API de GitHub.
// Es la herramienta de bajo nivel. Las tools específicas (issue_comment, read_project_file)
// son wrappers más cómodos sobre esta.

import { config, restApiHeaders } from '../config.js';

export const github_api = {
  name: 'github_api',
  description:
    'Llamada cruda a la REST API de GitHub (v2022-11-28). ' +
    'Usa esta tool solo si no hay un wrapper específico. ' +
    'Requiere permiso github_api.',
  inputSchema: {
    method: 'GET|POST|PATCH|PUT|DELETE',
    url: 'string (path relativo a https://api.github.com o URL completa)',
    body: 'object (opcional, se serializa a JSON)',
  },
  permissions: ['github_api'],
  async run({ method = 'GET', url, body }, ctx) {
    if (!url) throw new Error('url requerido');
    const fullUrl = url.startsWith('http') ? url : `https://api.github.com${url}`;
    const res = await fetch(fullUrl, {
      method: method.toUpperCase(),
      headers: restApiHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      // respuesta no-JSON, se devuelve como texto
    }
    return {
      ok: res.ok,
      status: res.status,
      data: json || text,
      rateLimit: {
        remaining: res.headers.get('x-ratelimit-remaining'),
        reset: res.headers.get('x-ratelimit-reset'),
      },
    };
  },
};
