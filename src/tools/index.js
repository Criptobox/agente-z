// src/tools/index.js
// Registro central de herramientas.
// Un agente solo puede invocar tools que estén registrados aquí Y listados en su definición.
//
// Cada tool expone:
//   name:           identificador único
//   description:    descripción corta (la lee el modelo)
//   inputSchema:    objeto plano describiendo los parámetros
//   permissions:    array de permisos requeridos (['read','write','github_api',...])
//   run(input, ctx): función async que ejecuta la tool

import { file_read } from './file_read.js';
import { file_write } from './file_write.js';
import { github_api } from './github_api.js';
import { search_memory } from './search_memory.js';
import { gate_check } from './gate_check.js';
import { issue_comment } from './issue_comment.js';
import { read_project_file } from './read_project_file.js';
import { list_repo_files } from './list_repo_files.js';
import { compare_inventories } from './compare_inventories.js';

export const TOOLS = {
  file_read,
  file_write,
  github_api,
  search_memory,
  gate_check,
  issue_comment,
  read_project_file,
  list_repo_files,
  compare_inventories,
};

export function getTool(name) {
  return TOOLS[name] || null;
}

export function listTools() {
  return Object.values(TOOLS).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
    permissions: t.permissions,
  }));
}

// Ejecuta un tool con chequeo de permisos.
// agentPermissions: lista de permisos que tiene el agente (de su .md)
export async function runTool(name, input, ctx, agentPermissions = []) {
  const tool = getTool(name);
  if (!tool) {
    return { ok: false, error: `Tool desconocida: ${name}` };
  }
  const hasAllPerms = tool.permissions.every((p) => agentPermissions.includes(p));
  if (!hasAllPerms) {
    return {
      ok: false,
      error: `Permisos insuficientes para ${name}. Necesita: ${tool.permissions.join(', ')}. Tiene: ${agentPermissions.join(', ') || 'ninguno'}`,
    };
  }
  try {
    const result = await tool.run(input, ctx);
    return { ok: true, result };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
