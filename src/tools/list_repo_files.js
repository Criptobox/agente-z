// src/tools/list_repo_files.js
// Lista archivos de un repo externo vía GitHub API.
// Útil para que el agente analyst sepa qué archivos existen antes de leerlos.

import { config, restApiHeaders } from '../config.js';

export const list_repo_files = {
  name: 'list_repo_files',
  description:
    'Lista archivos de un repo externo vía GitHub API. ' +
    'Devuelve el árbol de archivos con paths y tipos. ' +
    'Útil para descubrir qué archivos existen antes de leerlos con read_project_file.',
  inputSchema: {
    repo: 'string (owner/name). Default: primer TARGET_REPO.',
    path: 'string (opcional, subdirectorio a listar. Default: raíz)',
    ref: 'string (opcional, branch/tag/commit. Default: HEAD)',
  },
  permissions: ['read'],
  async run({ repo, path, ref }, ctx) {
    const targetRepo = repo || config.targetRepos[0];
    if (!targetRepo) throw new Error('No hay TARGET_REPOS configurado');
    const url = `https://api.github.com/repos/${targetRepo}/contents/${path || ''}${ref ? `?ref=${ref}` : ''}`;
    const res = await fetch(url, { headers: restApiHeaders() });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`GitHub API ${res.status}: ${text.slice(0, 300)}`);
    }
    const data = await res.json();
    if (!Array.isArray(data)) {
      // Es un archivo individual, no un directorio
      return {
        ok: true,
        repo: targetRepo,
        type: 'file',
        path: data.path,
        sha: data.sha,
      };
    }
    return {
      ok: true,
      repo: targetRepo,
      type: 'dir',
      path: path || '/',
      entries: data.map((item) => ({
        name: item.name,
        path: item.path,
        type: item.type, // 'file' | 'dir'
        size: item.size,
      })),
    };
  },
};
