// src/tools/file_write.js
// Escribe un archivo en el propio repo (memoria, tareas, etc.).
// Solo agentes con permiso 'write' lo pueden usar.
// Las escrituras se acumulan y las commitea el workflow al final del job.

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { config } from '../config.js';

export const file_write = {
  name: 'file_write',
  description:
    'Escribe un archivo en el repo agent-brain (memoria, tareas, etc.). ' +
    'No escribe en repos externos. La confirmación a disco es inmediata; ' +
    'la confirmación a git la hace el workflow al final del job.',
  inputSchema: {
    path: 'string (relativo a la raíz del repo)',
    content: 'string (contenido a escribir)',
    append: 'boolean (opcional, default false)',
  },
  permissions: ['write'],
  async run({ path, content, append }, ctx) {
    if (!path) throw new Error('path requerido');
    if (typeof content !== 'string') throw new Error('content debe ser string');
    const full = resolve(config.root, path);
    if (!full.startsWith(config.root)) {
      throw new Error('Path fuera del repo no permitido');
    }
    mkdirSync(dirname(full), { recursive: true });
    if (append) {
      const existing = (() => {
        try {
          return readFileSync(full, 'utf8');
        } catch {
          return '';
        }
      })();
      writeFileSync(full, existing + content, 'utf8');
    } else {
      writeFileSync(full, content, 'utf8');
    }
    return { ok: true, path, bytes: content.length };
  },
};

import { readFileSync } from 'node:fs';
