// src/agents/devil.js
// EL ABOGADO DEL DIABLO — agente permanente cuya única función es romper el consenso.
//
// Filosofía (de la nota del usuario):
//   "El fallo más caro de estos sistemas no es equivocarse —
//    es equivocarse en grupo con confianza alta."
//
// Este agente NO trabaja en la tarea. Lee el handoff más reciente y ataca:
//   - ¿Y si el test estaba mal escrito y por eso pasa?
//   - ¿Y si la memoria citada es stale y miente?
//   - ¿Y si la "verificación" es circular (el mismo agente escribió el test que lo valida)?
//   - ¿Y si la confidence es alta pero la evidencia es débil?
//   - ¿Y si hay un gate G3 faltante que habría roto esta solución?
//
// Cuando todos los agentes están de acuerdo, este agente pregunta "¿y si todos están mal?".
// Solo puede BLOCKAR (pedir rework) si encuentra un fallo objetivable.
// No puede aprobar — esa es regla del spec (sección 12.1).

import { readFileSync, existsSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { config, restApiHeaders } from '../config.js';
import { complete } from '../models.js';
import { loadIndex, readMemory, listMemories, writeMemory } from '../memory.js';

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
    episodeId: args.episode || process.env.EPISODE_ID,
    dryRun: args['dry-run'] === true || config.dryRun,
  };
}

function loadTask(taskId) {
  const p = resolve(config.root, config.paths.tasks, `${taskId}.json`);
  if (!existsSync(p)) throw new Error(`Tarea no encontrada: ${taskId}`);
  return JSON.parse(readFileSync(p, 'utf8'));
}

function loadLastEpisode(taskId) {
  const episodes = listMemories('episode')
    .filter((e) => e.task_id === taskId)
    .sort((a, b) => (b.attempt || 0) - (a.attempt || 0));
  return episodes[0] || null;
}

function loadAllEpisodes(taskId) {
  return listMemories('episode')
    .filter((e) => e.task_id === taskId)
    .sort((a, b) => (a.attempt || 0) - (b.attempt || 0));
}

// ── Compila el prompt del abogado del diablo ──
function buildDevilPrompt(task, lastEpisode, allEpisodes) {
  const gates = task.definition_of_done || [];
  const gatesText = gates.map((g) => `- ${g.id}: ${g.check} (método=${g.method}, comando=\`${g.command || 'n/a'}\`, espera=${g.expect || 'n/a'})`).join('\n');

  const episodesText = allEpisodes.map((e) => `- Intento ${e.attempt}: ruta=${e.result}, agente=${e.agent}, gates_fallidos=${(e.gates_failed || []).join(',')}, gates_verdes=${(e.gates_passed || []).join(',')}`).join('\n');

  const memoryUsed = lastEpisode?.body ? JSON.parse(lastEpisode.body).reused_memory || [] : [];

  return `Eres EL ABOGADO DEL DIABLO. No trabajas en la tarea. Tu único trabajo es dudar del consenso de los demás agentes.

## TU ROL
Cuando todos los agentes están de acuerdo, tú preguntas "¿y si todos están mal?". El fallo más caro de estos sistemas no es equivocarse — es equivocarse en grupo con confianza alta.

## TUS PREGUNTAS OBLIGATORIAS
Para cada handoff recibido, debes formular explícitamente:

1. **TEST MAL ESCRITO**: ¿Y si el test pasa porque está mal escrito, no porque el bug esté arreglado?
   - Mira el comando del gate. ¿Comprueba el comportamiento correcto o solo la ausencia del síntoma?
   - ¿El test lo escribió el mismo agente que arregló el bug? → sospecha de verificación circular.

2. **MEMORIA STALE**: ¿Las memorias citadas como REUSE siguen siendo válidas contra el código actual?
   - Marca stale: true en cualquier memoria cuyo commit difiera del HEAD actual.
   - Una memoria stale usada como REUSE sin reverificación es fallo de proceso.

3. **CONFIANZA INFLADA**: ¿La confidence declarada (≥90) tiene evidencia real detrás?
   - 100 solo si hay test que pasa. Si es leído en código pero sin ejecutar, máx 90.
   - Si la confidence > 70 sin verificación objetiva, marcar como error de proceso.

4. **GATE FALTANTE**: ¿Falta un gate que habría roto esta solución?
   - El ejemplo clásico: G1 "no se reproduce el NaN" + G2 "0 failing" — pero sin G3 "el total es numéricamente correcto".
   - Si falta ese gate, la solución "Number()||0" pasaría G1+G2 y declararía victoria con datos incorrectos.

5. **DIAGNÓSTICO HEREDADO**: ¿El agente cuestionó el diagnóstico inicial o solo atacó el síntoma?
   - En intentos >1, si el gate que falla es el mismo, el diagnóstico original era falso.

## REGLAS
- NO puedes aprobar. Solo puedes BLOCKAR con una razón objetivable.
- Si no encuentras nada objetivable, declaras CONSENT (consientes) pero sin entusiasmo.
- BLOCKAR requiere una acción concreta de rework. No es "mira esto mejor", es "este gate falta y sin él no podemos confiar".

## FORMATO DE SALIDA (JSON estricto)
{
  "verdict": "CONSENT | BLOCK",
  "concerns": [
    { "kind": "test_badly_written | stale_memory | confidence_inflated | missing_gate | inherited_diagnosis",
      "severity": "low | medium | high",
      "evidence": "...",
      "required_action": "..." }
  ],
  "missing_gates": [
    { "id_suggested": "G?", "check": "...", "method": "...", "command": "...", "expect": "..." }
  ],
  "memories_to_mark_stale": ["BUG-XXX"],
  "block_reason": "..." // solo si verdict=BLOCK
}

## CONTEXTO
Tarea: ${task.id} — ${task.goal}
Proyecto: ${task.project || 'n/a'}
Intento actual: ${(lastEpisode?.attempt || 0) + 1}

### GATES DEFINIDOS
${gatesText}

### EPISODIOS DE LA TAREA
${episodesText || '(ninguno aún)'}

### MEMORIA REUTILIZADA EN EL ÚLTIMO EPISODIO
${memoryUsed.length ? memoryUsed.join(', ') : '(ninguna)'}
`;
}

// ── Comenta en el issue ──
async function postDevilComment(task, devil) {
  if (!task.issue) return;
  const lines = ['### 😈 Abogado del diablo', ''];
  lines.push(`**Veredicto:** ${devil.verdict}`);
  if (devil.concerns?.length) {
    lines.push('', '**Preocupaciones:**');
    for (const c of devil.concerns) {
      const icon = c.severity === 'high' ? '🔴' : c.severity === 'medium' ? '🟡' : '🟢';
      lines.push(`${icon} [${c.kind}] ${c.evidence}`);
      if (c.required_action) lines.push(`  → ${c.required_action}`);
    }
  }
  if (devil.missing_gates?.length) {
    lines.push('', '**Gates que faltan:**');
    for (const g of devil.missing_gates) {
      lines.push(`- \`${g.id_suggested}\`: ${g.check} (${g.method})`);
    }
  }
  if (devil.memories_to_mark_stale?.length) {
    lines.push('', '**Memorias a marcar stale:** ' + devil.memories_to_mark_stale.join(', '));
  }
  if (devil.verdict === 'BLOCK') {
    lines.push('', `🚫 **BLOCK:** ${devil.block_reason}`);
    lines.push('_El siguiente agente debe abordar estos puntos antes de proceder._');
  } else {
    lines.push('', '_Sin objeciones objetables. Proceder con cautela estándar._');
  }
  const body = lines.join('\n');

  if (config.token && config.repo) {
    await fetch(`https://api.github.com/repos/${config.repo}/issues/${task.issue}/comments`, {
      method: 'POST',
      headers: restApiHeaders(),
      body: JSON.stringify({ body }),
    });
  } else {
    console.log(`[devil simulated] #${task.issue}:\n${body}`);
  }
}

// ── Marca memorias como stale si el devil lo pide ──
function applyStaleMarks(devil) {
  if (!devil.memories_to_mark_stale?.length) return;
  for (const id of devil.memories_to_mark_stale) {
    // Buscar el tipo por el prefijo
    const type = id.startsWith('BUG') ? 'error' : id.startsWith('DEC') ? 'decision' : id.startsWith('FACT') ? 'fact' : id.startsWith('LESSON') ? 'lesson' : null;
    if (!type) continue;
    const mem = readMemory(type, id);
    if (!mem) continue;
    writeMemory(type, id, { ...mem, stale: true, confidence: Math.max(30, Math.floor((mem.confidence || 80) * 0.6)) }, mem.body || '');
    console.log(`[devil] marcada ${id} como stale`);
  }
}

// ── Si BLOCK, actualiza la tarea para no avanzar ──
function applyBlock(task, devil) {
  if (devil.verdict !== 'BLOCK') return;
  const updated = {
    ...task,
    status: 'blocked_by_devil',
    devil_block: {
      at: new Date().toISOString(),
      reason: devil.block_reason,
      missing_gates: devil.missing_gates || [],
      concerns: devil.concerns || [],
    },
  };
  const path = resolve(config.root, config.paths.tasks, `${task.id}.json`);
  writeFileSync(path, JSON.stringify(updated, null, 2) + '\n', 'utf8');
}

function require_node_fs_REMOVED() {
  // eliminado: usamos writeFileSync importado arriba.
}

// ── Main ──
async function main() {
  const args = parseArgs();
  if (!args.taskId) {
    console.error('Uso: node src/agents/devil.js --task=<TASK-XXXX>');
    process.exit(1);
  }
  console.log(`[devil] tarea=${args.taskId}`);

  const task = loadTask(args.taskId);
  const lastEpisode = loadLastEpisode(args.taskId);
  const allEpisodes = loadAllEpisodes(args.taskId);

  const prompt = buildDevilPrompt(task, lastEpisode, allEpisodes);
  const raw = await complete(
    [
      { role: 'system', content: prompt },
      { role: 'user', content: 'Analiza el último handoff. ¿Hay algo objetable?' },
    ],
    { jsonMode: true, temperature: 0.4 }
  );

  // Parse JSON
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  const devil = JSON.parse(raw.slice(first, last + 1));
  console.log(`[devil] veredicto=${devil.verdict} concerns=${devil.concerns?.length || 0}`);

  await postDevilComment(task, devil);
  applyStaleMarks(devil);
  applyBlock(task, devil);

  // Si BLOCK y hay missing_gates, los añadimos a la task
  if (devil.verdict === 'BLOCK' && devil.missing_gates?.length) {
    task.definition_of_done = [...(task.definition_of_done || []), ...devil.missing_gates.map((g, i) => ({ ...g, id: g.id_suggested || `G${(task.definition_of_done?.length || 0) + i + 1}` }))];
    const path = resolve(config.root, config.paths.tasks, `${task.id}.json`);
    writeFileSync(path, JSON.stringify(task, null, 2) + '\n', 'utf8');
    console.log(`[devil] ${devil.missing_gates.length} gates añadidos a la tarea`);
  }

  console.log('[devil] fin');
  return devil;
}

main().catch((err) => {
  console.error('[devil] FATAL:', err.message);
  console.error(err.stack);
  process.exit(1);
});
