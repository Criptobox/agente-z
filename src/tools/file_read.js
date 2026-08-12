// src/tools/file_read.js
// Lee un archivo del propio repo agent-brain.
// Para leer archivos del proyecto externo (TiendaMax), usar read_project_file.

import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from '../config.js';

export const file_read = {
  name: 'file_read',
  description:
    'Lee un archivo del propio repo agent-brain (memoria, tareas, agentes, código). ' +
    'No sirve para leer repos externos — usa read_project_file para eso.',
  inputSchema: {
    path: 'string (relativo a la raíz del repo)',
    maxBytes: 'number (opcional, default 512000 ≈ 512KB)',
  },
  permissions: ['read'],
  async run({ path, maxBytes = 512_000 }, ctx) {
    if (!path) throw new Error('path requerido');
    const full = resolve(config.root, path);
    // Prevención de path traversal fuera del repo
    if (!full.startsWith(config.root)) {
      throw new Error('Path fuera del repo no permitido');
    }
    if (!existsSync(full)) {
      return { ok: false, error: `No existe: ${path}` };
    }
    const stat = statSync(full);
    if (stat.size > maxBytes) {
      return {
        ok: false,
        error: `Archivo demasiado grande: ${stat.size} bytes (máx ${maxBytes}). Lee por fragmentos o usa read_project_file para repos externos.`,
        size: stat.size,
      };
    }
    const content = readFileSync(full, 'utf8');
    return {
      ok: true,
      path,
      size: content.length,
      lines: content.split('\n').length,
      content,
    };
  },
};
