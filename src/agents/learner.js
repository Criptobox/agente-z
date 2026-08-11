// src/agents/learner.js
// EL LEARNER — agente que hace post-mortem al cerrar una tarea.
//
// Sección 13.2 del spec: cierre de tarea, SIEMPRE, tanto en éxito como en STUCK.
// Responde 5 preguntas y solo escribe lección si la #4 tiene respuesta útil.
//
// Preguntas:
//   1. ¿Qué se creyó al principio que resultó ser falso?
//   2. ¿Cuál fue el intento fallido más caro y qué lo hizo caro?
//   3. ¿Qué señal existía desde el principio y no se miró?
//   4. ¿Qué habría hecho esta tarea 3× más rápida si se hubiera sabido antes?
//   5. ¿Esta lección es específica de este proyecto o general?
//
// Solo si la #4 tiene respuesta se escribe LESSON-XXXX.
// Es innegociable: el sistema muere de ruido, no de falta de datos.

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config, restApiHeaders } from '../config.js';
import { complete } from '../models.js';
import { listMemories, writeMemory, nextId } from '../memory.js';

function parseArgs() {
  const args = {};
  for (const a of process.argv.slice(2)) {
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      args[k] = v ?? true;
    }
  }
  return {
    taskId: args.task || args['task-id'] || process.env.TASK_ID,
  };
}

function loadTask(taskId) {
  const p = resolve(config.root, config.paths.tasks, `${taskId}.json`);
  if (!existsSync(p)) throw new Error(`Tarea no encontrada: ${taskId}`);
  return JSON.parse(readFileSync(p, 'utf8'));
}

function loadEpisodes(taskId) {
  return listMemories('episode')
    .filter((e) => e.task_id === taskId)
    .sort((a, b) => (a.attempt || 0) - (b.attempt || 0));
}

function loadMemoryWrites(taskId) {
  // Buscamos todas las memorias cuyo task_id sea este
  const all = [
    ...listMemories('error'),
    ...listMemories('decision'),
    ...listMemories('fact'),
  ];
  return all.filter((m) => m.task_id === taskId);
}

function buildPrompt(task, episodes, writes) {
  const epText = episodes.map((e) => `- Intento ${e.attempt}: agente=${e.agent}, ruta=${e.result}, gates_fallidos=${(e.gates_failed || []).join(',') || 'ninguno'}, gates_verdes=${(e.gates_passed || []).join(',') || 'ninguno'}, estrategia=${(e.strategy || '').slice(0, 200)}`).join('\n');

  const writesText = writes.map((w) => `- ${w.id} [${w.type}]: ${w.title} (conf=${w.confidence})`).join('\n');

  const succeeded = task.status === 'completed';

  return `Eres el LEARNER. Tu trabajo es hacer el post-mortem de esta tarea y decidir si se justifica escribir una LECCIÓN.

## REGLA INNEGOCIABLE
Solo se escribe una lección si la respuesta a la pregunta 4 ("¿qué habría hecho esto 3× más rápido?") es concreta y aplicable a futuras tareas.
Si la respuesta es "nada" o vaga, NO se escribe lección. El sistema muere de ruido, no de falta de datos.

## TU PROCESO
1. Lee todos los episodios y memory_writes de la tarea.
2. Responde internamente las 5 preguntas.
3. Si la #4 tiene respuesta útil, formula la lección.
4. Decide el scope: general (cualquier proyecto) o project:<nombre>.

## PREGUNTAS
1. ¿Qué se creyó al principio que resultó ser falso?
2. ¿Cuál fue el intento fallido más caro y qué lo hizo caro?
3. ¿Qué señal existía desde el principio y no se miró?
4. ¿Qué habría hecho esta tarea 3× más rápida si se hubiera sabido antes?
5. ¿Esta lección es específica de este proyecto o general?

## FORMATO DE SALIDA (JSON estricto)
{
  "post_mortem": {
    "q1_false_belief": "...",
    "q2_most_expensive_failure": "...",
    "q3_missed_signal": "...",
    "q4_speed_up_3x": "...",
    "q5_scope": "general | project:<nombre>"
  },
  "lesson_decision": "WRITE | SKIP",
  "skip_reason": "...", // si SKIP, por qué
  "lesson": {           // solo si WRITE
    "title": "...",
    "trigger": "regex o palabras clave que activan esta lección",
    "files_pattern": ["*cart*", "*total*"],
    "rule": "...",
    "anti_pattern": "...",
    "scope": "general | project:...",
    "confidence": 0
  }
}

## CONTEXTO
Tarea: ${task.id} — ${task.goal}
Proyecto: ${task.project || 'n/a'}
Estado: ${task.status} ${succeeded ? '(éxito)' : '(STUCK o bloqueada)'}
Intentos totales: ${episodes.length}

### EPISODIOS
${epText || '(ninguno)'}

### MEMORIAS ESCRITAS EN ESTA TAREA
${writesText || '(ninguna)'}
`;
}

async function postPostMortemComment(task, result) {
  if (!task.issue) return;
  const pm = result.post_mortem;
  const lines = ['### 📝 Post-mortem', ''];

  lines.push(`**Estado final:** ${task.status}`);
  lines.push(`**Decisión de lección:** ${result.lesson_decision}`);
  if (result.skip_reason) lines.push(`_Razón skip: ${result.skip_reason}_`);
  lines.push('', '**Respuestas:**');
  lines.push(`1. Creencia falsa inicial: ${pm.q1_false_belief}`);
  lines.push(`2. Intento fallido más caro: ${pm.q2_most_expensive_failure}`);
  lines.push(`3. Señal que se ignoró: ${pm.q3_missed_signal}`);
  lines.push(`4. Acelerador 3×: ${pm.q4_speed_up_3x}`);
  lines.push(`5. Scope: ${pm.q5_scope}`);

  if (result.lesson_decision === 'WRITE' && result.lesson) {
    lines.push('', '---', '', `### 💡 Lección propuesta: \`${result.lesson.title}\``);
    lines.push(`- **Trigger:** \`${result.lesson.trigger}\``);
    lines.push(`- **Regla:** ${result.lesson.rule}`);
    if (result.lesson.anti_pattern) lines.push(`- **Antipatrón:** ${result.lesson.anti_pattern}`);
    lines.push(`- **Scope:** ${result.lesson.scope}`);
    lines.push(`- **Confidence:** ${result.lesson.confidence}`);
    lines.push('', '_Se guardará como LESSON-XXXX. Tras 3 prevenciones de fallo, se promueve a regla en agents/*.md._');
  }
  const body = lines.join('\n');

  if (config.token && config.repo) {
    await fetch(`https://api.github.com/repos/${config.repo}/issues/${task.issue}/comments`, {
      method: 'POST',
      headers: restApiHeaders(),
      body: JSON.stringify({ body }),
    });
  } else {
    console.log(`[learner simulated] #${task.issue}:\n${body}`);
  }
}

async function main() {
  const args = parseArgs();
  if (!args.taskId) {
    console.error('Uso: node src/agents/learner.js --task=<TASK-XXXX>');
    process.exit(1);
  }
  console.log(`[learner] tarea=${args.taskId}`);

  const task = loadTask(args.taskId);
  const episodes = loadEpisodes(args.taskId);
  const writes = loadMemoryWrites(args.taskId);

  const prompt = buildPrompt(task, episodes, writes);
  const raw = await complete(
    [
      { role: 'system', content: prompt },
      { role: 'user', content: 'Haz el post-mortem. ¿Justifica una lección?' },
    ],
    { jsonMode: true, temperature: 0.3 }
  );

  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  const result = JSON.parse(raw.slice(first, last + 1));
  console.log(`[learner] decision=${result.lesson_decision}`);

  await postPostMortemComment(task, result);

  if (result.lesson_decision === 'WRITE' && result.lesson) {
    const id = nextId('lesson');
    writeMemory(
      'lesson',
      id,
      {
        id,
        type: 'lesson',
        scope: result.lesson.scope || 'general',
        project: result.lesson.scope?.startsWith('project:') ? result.lesson.scope.slice(8) : null,
        title: result.lesson.title,
        trigger: result.lesson.trigger,
        files_pattern: result.lesson.files_pattern || [],
        rule: result.lesson.rule,
        anti_pattern: result.lesson.anti_pattern || null,
        born_from: writes.map((w) => w.id),
        times_applied: 0,
        times_prevented_failure: 0,
        times_ignored: 0,
        promoted_to_rule: false,
        confidence: result.lesson.confidence || 70,
        created: new Date().toISOString().slice(0, 10),
        task_id: task.id,
      },
      `# ${result.lesson.title}\n\n**Regla:** ${result.lesson.rule}\n\n**Antipatrón:** ${result.lesson.anti_pattern || 'n/a'}\n\n**Nacida de:** ${writes.map((w) => w.id).join(', ')}`
    );
    console.log(`[learner] lección escrita: ${id}`);
  }

  console.log('[learner] fin');
}

main().catch((err) => {
  console.error('[learner] FATAL:', err.message);
  process.exit(1);
});
