// src/tools/issue_comment.js
// Comenta en el Issue de GitHub que originó la tarea.
// Es la interfaz principal con el usuario (sección 8 del spec).

import { config, restApiHeaders } from '../config.js';

export const issue_comment = {
  name: 'issue_comment',
  description:
    'Publica un comentario en el Issue de GitHub que originó la tarea. ' +
    'Esto es lo que ve el usuario en la app móvil. ' +
    'Usar para reportar progreso, pedir aprobación, o entregar el handoff final.',
  inputSchema: {
    issue_number: 'number (opcional, default: el de la tarea actual)',
    body: 'string (markdown, máx ~2000 chars)',
  },
  permissions: ['issues:write'],
  async run({ issue_number, body }, ctx) {
    if (!body) throw new Error('body requerido');
    const issueNum = issue_number || ctx?.task?.issue;
    if (!issueNum) throw new Error('Falta issue_number (no está en el contexto de la tarea)');

    if (!config.repo) {
      // En local sin repo, logueamos y simulamos éxito.
      console.log(`[issue_comment simulated] #${issueNum}:\n${body}`);
      return { ok: true, simulated: true, issue: issueNum };
    }

    const url = `https://api.github.com/repos/${config.repo}/issues/${issueNum}/comments`;
    const res = await fetch(url, {
      method: 'POST',
      headers: restApiHeaders(),
      body: JSON.stringify({ body }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`GitHub API ${res.status}: ${text.slice(0, 300)}`);
    }
    const data = await res.json();
    return {
      ok: true,
      comment_id: data.id,
      comment_url: data.html_url,
      issue: issueNum,
    };
  },
};
