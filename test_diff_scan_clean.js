// src/orchestrator.js
// Orchestrator — el dispatcher principal.
//
// Se dispara cuando:
//   - Se abre un Issue con label "agent-task"
//   - Un agente entrega un handoff con next_agent
//   - Comentario /approve en un Issue
//   - workflow_dispatch manual
//
// Responsabilidades:
//   1. Parsear el Issue → crear TASK-XXXX con Definition of Done.
//   2. Recuperar memoria relevante y resumirla en el Issue.
//   3. Despachar al primer agente vía repository_dispatch.
//   4. Si recibe un handoff, despachar al siguiente agente.
//   5. Si recibe /approve, ejecutar la acción aprobada.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { config, restApiHeaders } from './config.js';
import { search, loadIndex, nextId, writeMemory } from './memory.js';
import { complete } from './models.js';
import { parseFrontmatter } from './memory.js';
import { parseAgentJSON } from './utils/json.js';

// ── Parseo de args/env ──
function parseTrigger() {
  // Event payload (cuando corre dentro de Actions)
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (eventPath && existsSync(eventPath)) {
    const event = JSON.parse(readFileSync(eventPath, 'utf8'));
    return { event, eventName: process.env.GITHUB_EVENT_NAME };
  }
  // Llamada manual con --issue=N
  const arg = process.argv.slice(2).find((a) => a.startsWith('--issue='));
  if (arg) {
    const issueNum = parseInt(arg.slice(8), 10);
    return {
      event: { issue: { number: issueNum, title: '', body: '', labels: [] } },
      eventName: 'manual',
    };
  }
  return { event: null, eventName: null };
}

// ── Crea la tarea a partir del Issue ──
async function createTaskFromIssue(issue) {
  const project = detectProject(issue.title + ' ' + (issue.body || ''));
  const goal = issue.title;

  // Detectar si es una tarea de análisis de repo
  const analysisTarget = detectAnalysisTarget(issue.title + ' ' + (issue.body || ''));
  const isAnalysis = !!analysisTarget;

  // Pedir al modelo que proponga Definition of Done
  const dod = await proposeDefinitionOfDone(goal, issue.body || '', project, isAnalysis, analysisTarget);

  const taskNum = nextTaskNum();
  const id = `TASK-${String(taskNum).padStart(4, '0')}`;

  const task = {
    id,
    issue: issue.number,
    goal,
    description: issue.body || '',
    project,
    status: 'in_progress',
    assigned: isAnalysis ? 'analyst' : 'code', // analyst para análisis, code para bugs
    depends_on: [],
    related_memory: [],
    autonomy: 'assisted',
    current_attempt: 0,
    definition_of_done: dod.gates || [],
    budget: dod.budget || { max_attempts: 5, max_minutes: 25, max_tokens: 120000 },
    handoffs: [],
    created: new Date().toISOString(),
  };

  const path = resolve(config.root, config.paths.tasks, `${id}.json`);
  mkdirSync(resolve(path, '..'), { recursive: true });
  writeFileSync(path, JSON.stringify(task, null, 2) + '\n', 'utf8');

  // Guardar memoria de proyecto si no existe
  if (project && !existsSync(join(config.root, config.paths.memory, 'projects', `${project}.md`))) {
    writeMemory('project', project, {
      id: project,
      type: 'project',
      title: project,
      repo: config.targetRepos.find((r) => r.includes(project)) || null,
      created: new Date().toISOString().slice(0, 10),
    }, `# Proyecto ${project}\n\n Pendiente de documentación.`);
  }

  return task;
}

function nextTaskNum() {
  const dir = resolve(config.root, config.paths.tasks);
  if (!existsSync(dir)) return 1;
  const nums = readdirSync(dir)
    .filter((f) => f.startsWith('TASK-'))
    .map((f) => parseInt(f.replace('TASK-', '').replace('.json', ''), 10))
    .filter((n) => !isNaN(n));
  return nums.length ? Math.max(...nums) + 1 : 1;
}

// Heurística simple para detectar proyecto mencionado en el texto
function detectProject(text) {
  const lower = text.toLowerCase();
  for (const repo of config.targetRepos) {
    if (!repo || !repo.includes('/')) continue;
    const name = repo.split('/')[1].toLowerCase();
    if (name && lower.includes(name)) return name;
  }
  // Detectar mencionados explícitamente
  const match = text.match(/proyecto[:\s]+([a-z0-9_-]+)/i);
  if (match) return match[1].toLowerCase();
  return null;
}

// ── Detecta si el Issue pide analizar un repo externo ──
// Acepta formatos:
//   analyze: https://github.com/owner/repo
//   analizar: owner/repo
//   auditar: https://github.com/owner/repo
//   repo: owner/repo
function detectAnalysisTarget(text) {
  const patterns = [
    /analyze:\s*(?:https?:\/\/github\.com\/)?([a-z0-9_-]+\/[a-z0-9_.-]+)/i,
    /analizar:\s*(?:https?:\/\/github\.com\/)?([a-z0-9_-]+\/[a-z0-9_.-]+)/i,
    /auditar:\s*(?:https?:\/\/github\.com\/)?([a-z0-9_-]+\/[a-z0-9_.-]+)/i,
    /repo:\s*([a-z0-9_-]+\/[a-z0-9_.-]+)/i,
    /(https?:\/\/github\.com\/[a-z0-9_-]+\/[a-z0-9_.-]+)/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      // Normalizar: quitar URL prefix si lo hay
      let target = m[1].replace(/^https?:\/\/github\.com\//i, '');
      // Quitar trailing slash y query params
      target = target.split(/[?#]/)[0].replace(/\/$/, '');
      return target;
    }
  }
  return null;
}

// ── Pide al modelo una Definition of Done + budget ──
async function proposeDefinitionOfDone(goal, description, project, isAnalysis = false, analysisTarget = null) {
  const ctxMem = await search(`${goal} ${description}`.slice(0, 500), {
    project,
    topK: 5,
  });
  const memSummary = ctxMem.map((m) => `- ${m.id} (${m.memory.type}, conf=${m.memory.confidence}): ${m.memory.title}`).join('\n') || '(sin memoria relevante)';

  const analysisContext = isAnalysis
    ? `\n\nIMPORTANTE: Esta es una tarea de ANÁLISIS de repo (no de fix). El agente \`analyst\` va a leer el repo \`${analysisTarget}\` y reportar hallazgos. Los gates deben ser:\n- G1: El analyst listó al menos 5 archivos del repo (verificable en el handoff)\n- G2: El analyst reportó entre 3 y 10 hallazgos concretos con archivo:línea\n- G3: Cada hallazgo tiene un fix propuesto (no solo descripción)\n- G4: Sin secretos en el reporte (security_scan sobre el output)\nBudget mayor: hasta 3 intentos, 15 min, 80k tokens (el análisis es más caro pero único).`
    : '';

  const system = `Eres el Orchestrator de un sistema multi-agente. Tu trabajo: crear una Definition of Done PARA UNA TAREA antes de que ningún agente empiece a trabajar.

Reglas:
- Los gates deben ser verificables por herramienta (test, assertion, diff_scan, security_scan). Nunca "el agente lo revisa".
- Incluye SIEMPRE al menos un gate que compruebe el comportamiento correcto, no solo la ausencia del síntoma. (Esto evita que un Number()||0 declare victoria.)
- Define un budget realista. Por defecto: 5 intentos, 25 min, 120k tokens.
${analysisContext}

Responde en JSON estricto con formato:
{
  "gates": [
    { "id": "G1", "check": "...", "method": "test|assertion|diff_scan|security_scan", "command": "...", "expect": "exit_code == 0 | 0 failing | ..." }
  ],
  "budget": { "max_attempts": 5, "max_minutes": 25, "max_tokens": 120000 }
}`;
  const user = `Tarea: ${goal}\nDescripción: ${description}\nProyecto: ${project || '(desconocido)'}\n${isAnalysis ? `Repo a analizar: ${analysisTarget}\n` : ''}\nMemoria relevante:\n${memSummary}`;

  try {
    const raw = await complete(
      [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      { jsonMode: true, temperature: 0.1 }
    );
    return parseAgentJSON(raw);
  } catch (err) {
    console.error('[orchestrator] proposeDoD falló:', err.message);
  }
  // Fallback: gates mínimos
  return {
    gates: [
      { id: 'G1', check: 'El síntoma reportado no se reproduce', method: 'test', command: 'echo "TODO: comando real"', expect: 'exit_code == 0' },
      { id: 'G2', check: 'Sin secretos en cambios', method: 'security_scan' },
    ],
    budget: { max_attempts: 5, max_minutes: 25, max_tokens: 120000 },
  };
}

// ── Despacha un agente vía repository_dispatch ──
async function dispatchAgent(agentName, taskId) {
  if (!config.token || !config.repo) {
    console.log(`[orchestrator] (simulado) dispatch agent=${agentName} task=${taskId}`);
    return { simulated: true };
  }
  // Disparamos un repository_dispatch que escucha agent-run.yml
  const [owner, repo] = config.repo.split('/');
  const res = await fetch(`https://api.github.com/repos/${config.repo}/dispatches`, {
    method: 'POST',
    headers: restApiHeaders(),
    body: JSON.stringify({
      event_type: 'agent_run',
      client_payload: { agent: agentName, task_id: taskId },
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`dispatch ${res.status}: ${text}`);
  }
  return { dispatched: true };
}

// ── Resume la memoria en un comentario inicial del Issue ──
async function postContextComment(issue, task, memResults) {
  const lines = ['## 🧠 Contexto recuperado', ''];
  lines.push(`Tarea creada: \`${task.id}\` — asignada a \`${task.assigned}\``);
  lines.push(`Definition of Done: ${task.definition_of_done.length} gates`);
  if (memResults.length) {
    lines.push('', '**Memoria relevante encontrada:**');
    for (const m of memResults.slice(0, 5)) {
      const staleTag = m.memory.stale ? ' ⚠STALE' : '';
      lines.push(`- \`${m.id}\` [${m.memory.type}] ${m.memory.title} _(conf=${m.memory.confidence}${staleTag})_`);
    }
  } else {
    lines.push('', '_Sin memoria previa relevante. Será un NEW._');
  }
  lines.push('', '**Gates:**');
  for (const g of task.definition_of_done) {
    lines.push(`- ${g.id}: ${g.check}`);
  }
  const body = lines.join('\n');

  if (config.token && config.repo) {
    await fetch(`https://api.github.com/repos/${config.repo}/issues/${issue.number}/comments`, {
      method: 'POST',
      headers: restApiHeaders(),
      body: JSON.stringify({ body }),
    });
  } else {
    console.log(`[orchestrator] (simulado) comment #${issue.number}:\n${body}`);
  }
}

// ── Manejador principal ──
async function main() {
  const { event, eventName } = parseTrigger();
  if (!event) {
    console.error('No se detectó trigger. Usa --issue=N o ejecuta dentro de Actions.');
    process.exit(1);
  }

  const issue = event.issue;
  if (!issue) {
    console.error('No hay issue en el evento.');
    process.exit(1);
  }

  console.log(`[orchestrator] evento=${eventName} issue=#${issue.number} title="${issue.title}"`);

  // Caso 1: comentario /approve
  if (eventName === 'issue_comment' && event.comment?.body?.trim().startsWith('/approve')) {
    return handleApprove(issue, event.comment);
  }

  // Caso 2: nuevo Issue con label agent-task, o re-asignación
  const hasLabel = issue.labels?.some((l) => l.name === 'agent-task');
  if (!hasLabel && eventName !== 'manual') {
    console.log('[orchestrator] Issue sin label agent-task, ignorando.');
    return;
  }

  // Crear tarea
  const task = await createTaskFromIssue(issue);
  console.log(`[orchestrator] tarea creada: ${task.id}`);

  // Buscar memoria relevante para comentario inicial
  const memResults = await search(task.goal, { project: task.project, topK: 8 });
  await postContextComment(issue, task, memResults);

  // Despachar primer agente
  await dispatchAgent(task.assigned, task.id);
  console.log(`[orchestrator] primer agente despachado: ${task.assigned}`);
}

async function handleApprove(issue, comment) {
  // Busca la tarea asociada al issue
  const tasksDir = resolve(config.root, config.paths.tasks);
  if (!existsSync(tasksDir)) return;
  const files = readdirSyncSafe(tasksDir).filter(
    (f) => f.endsWith('.json') && f !== 'index.json' && f.startsWith('TASK-')
  );
  for (const f of files) {
    const t = JSON.parse(readFileSync(join(tasksDir, f), 'utf8'));
    if (t.issue === issue.number && t.status === 'needs_human') {
      t.status = 'in_progress';
      t.approved_by = comment.user?.login || 'unknown';
      t.approved_at = new Date().toISOString();
      writeFileSync(join(tasksDir, f), JSON.stringify(t, null, 2) + '\n', 'utf8');
      console.log(`[orchestrator] tarea ${t.id} aprobada por ${t.approved_by}`);
      // Re-despachar al agente que pidió permiso
      if (t.last_agent) await dispatchAgent(t.last_agent, t.id);
      return;
    }
  }
  console.log('[orchestrator] /approve no encontró tarea pendiente');
}

function readdirSyncSafe(dir) {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

main().catch((err) => {
  console.error('[orchestrator] FATAL:', err.message);
  console.error(err.stack);
  process.exit(1);
});
