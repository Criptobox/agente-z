// src/tools/file_write.js
// Escribe un archivo en el propio repo (memoria, tareas, etc.).
// Solo agentes con permiso 'write' lo pueden usar.
// Las escrituras se acumulan y las commitea el workflow al final del job.

import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { config } from '../config.js';

// Extensiones peligrosas que nunca se deberen escribir desde un agente
const FORBIDDEN_EXTENSIONS = ['.env', '.sh', '.exe', '.bat', '.cmd', '.ps1'];
// Paths prohibidos dentro del repo (relativos a config.root)
const FORBIDDEN_PATHS = ['.git/', '.github/workflows/', 'node_modules/'];

export const file_write = {
  name: 'file_write',
  description:
    'Escribe un archivo en el repo agent-brain (memoria, tareas, etc.). ' +
    'No escribe en repos externos. La confirmación a disco es inmediata; ' +
    'la confirmación a git la hace el workflow al final del job. ' +
    'No permite sobreescribir archivos de sistema (.git, workflows, .env).',
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

    // Validar extensiones y paths prohibidos
    const relPath = path.replace(/^\.\//, '');
    const lowerPath = relPath.toLowerCase();
    if (FORBIDDEN_EXTENSIONS.some((ext) => lowerPath.endsWith(ext))) {
      throw new Error(`Extensión prohibida para escritura: ${relPath}`);
    }
    if (FORBIDDEN_PATHS.some((p) => lowerPath.startsWith(p))) {
      throw new Error(`Path del sistema no se puede sobreescribir: ${relPath}`);
    }

    mkdirSync(dirname(full), { recursive: true });

    if (append) {
      const existing = existsSync(full) ? readFileSync(full, 'utf8') : '';
      writeFileSync(full, existing + content, 'utf8');
    } else {
      writeFileSync(full, content, 'utf8');
    }
    return { ok: true, path, bytes: content.length, append: !!append };
  },
};
