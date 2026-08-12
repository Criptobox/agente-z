// src/tools/file_write.js
// Escribe un archivo en el propio repo (memoria, tareas, etc.).
// Solo agentes con permiso 'write' lo pueden usar.
// Las escrituras se acumulan y las commitea el workflow al final del job.

import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { config } from '../config.js';

// Extensiones peligrosas que nunca se deberen escribir desde un agente
const FORBIDDEN_EXTENSIONS = ['.env', '.sh', '.exe', '.bat', '.cmd', '.ps1', '.pem', '.key'];
// Paths prohibidos dentro del repo (relativos a config.root)
// - .git/ — historial y configuración del repo
// - .github/workflows/ — código ejecutable en CI (inyección RCE)
// - node_modules/ — dependencias
// - src/ — código fuente del propio sistema (los agentes NO se auto-modifican)
// - agents/ — prompts de agentes (rompe el flow "siempre vía PR")
// - tests/ — tests del sistema (evita que un agente auto-apruebe sus cambios)
// - dashboard/ — frontend (los agentes no tocan UI)
// - .github/ — settings de CI
const FORBIDDEN_PATHS = [
  '.git/', '.github/', 'node_modules/',
  'src/', 'agents/', 'tests/', 'dashboard/',
];

export const file_write = {
  name: 'file_write',
  description:
    'Escribe un archivo en el repo agent-brain (memoria, tareas, etc.). ' +
    'No escribe en repos externos. La confirmación a disco es inmediata; ' +
    'la confirmación a git la hace el workflow al final del job. ' +
    'NO permite sobreescribir código fuente, prompts de agentes, workflows, tests ni dashboard. ' +
    'Esos cambios deben ir por PR (usando el agente self_improver). ' +
    'Solo permite escribir en memory/, tasks/ y directorios de datos.',
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
      throw new Error(
        `Path protegido contra escritura directa: ${relPath}. ` +
        `Los cambios a ${FORBIDDEN_PATHS.join(', ')} deben ir por PR vía self_improver. ` +
        `file_write solo permite escribir en memory/ y tasks/.`
      );
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
