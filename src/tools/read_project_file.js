// src/tools/read_project_file.js
// Lee un archivo de un repo externo (TiendaMax, AXONTECH).
// Lo hace via GitHub API (no clona el repo completo — sería caro en tokens).

import { config, restApiHeaders } from '../config.js';

export const read_project_file = {
  name: 'read_project_file',
  description:
    'Lee un archivo de un repo externo (TiendaMax, AXONTECH) vía GitHub API. ' +
    'No clona el repo — solo trae el archivo pedido. ' +
    'Útil para que un agente lea el código actual sin agotar la cuota.',
  inputSchema: {
    repo: 'string (owner/name). Default: primer TARGET_REPO configurado.',
    path: 'string (ruta del archivo en el repo, ej: src/js/cart.js)',
    ref: 'string (opcional, branch/tag/commit. Default: HEAD)',
  },
  permissions: ['read'],
  async run({ repo, path, ref }, ctx) {
    if (!path) throw new Error('path requerido');
    const targetRepo = repo || config.targetRepos[0];
    if (!targetRepo) {
      throw new Error('No hay TARGET_REPOS configurado. Pónlo en .env o secrets.');
    }
    const url = `https://api.github.com/repos/${targetRepo}/contents/${path}${ref ? `?ref=${ref}` : ''}`;
    const res = await fetch(url, { headers: restApiHeaders() });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`GitHub API ${res.status}: ${text.slice(0, 300)}`);
    }
    const data = await res.json();
    if (data.type !== 'file' || !data.content) {
      throw new Error(`No es un archivo o sin contenido: ${path}`);
    }
    // content viene en base64
    const content = Buffer.from(data.content, 'base64').toString('utf8');
    return {
      ok: true,
      repo: targetRepo,
      path,
      sha: data.sha,
      size: data.size,
      lines: content.split('\n').length,
      content,
    };
  },
};
