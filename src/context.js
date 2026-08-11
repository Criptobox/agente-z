// src/context.js
// CONTEXT ENGINE — la pieza central (sección 1.1 del spec).
//
// El problema: no puedes mandar el repo entero al modelo. El límite de tokens
// por minuto en el tier gratuito está en el orden de miles, no cientos de miles.
//
// La solución: construir un contexto mínimo y denso para cada turno de agente.
//   - Memoria relevante (top-K por búsqueda híbrida).
//   - Lecciones aplicables (trigger o files_pattern).
//   - Criterios del usuario (memoria de criterio — sección "memoria de tu criterio" del usuario).
//   - Estado actual del código (solo los archivos/símbolos mencionados).
//   - Gates de la tarea (Definition of Done).
//   - Historial de intentos previos (si los hay).

import { search, readMemory, listMemories, loadIndex } from './memory.js';
import { config } from './config.js';

// ── Carga lecciones aplicables a una tarea ──
// Una lección aplica si:
//   - trigger matchea (regex sobre el goal + descripción)
//   - files_pattern matchea alguno de los archivos involucrados
function loadApplicableLessons(task, filesInvolved = []) {
  const lessons = listMemories('lesson').filter((l) => !l.archived && !l.promoted_to_rule);
  const applicable = [];
  const text = `${task.goal || ''} ${task.description || ''}`.toLowerCase();
  for (const lesson of lessons) {
    let matched = false;
    let matchReason = '';
    // Por trigger
    if (lesson.trigger) {
      try {
        const re = new RegExp(lesson.trigger, 'i');
        if (re.test(text)) {
          matched = true;
          matchReason = `trigger="${lesson.trigger}"`;
        }
      } catch {
        // Si el trigger no es regex válido, lo tratamos como string literal
        if (text.includes(lesson.trigger.toLowerCase())) {
          matched = true;
          matchReason = `trigger literal`;
        }
      }
    }
    // Por files_pattern
    if (!matched && Array.isArray(lesson.files_pattern) && filesInvolved.length) {
      for (const pat of lesson.files_pattern) {
        try {
          const re = new RegExp(pat, 'i');
          if (filesInvolved.some((f) => re.test(f))) {
            matched = true;
            matchReason = `files_pattern="${pat}"`;
            break;
          }
        } catch {
          if (filesInvolved.some((f) => f.includes(pat.replace(/\*/g, '')))) {
            matched = true;
            matchReason = `files_pattern literal`;
            break;
          }
        }
      }
    }
    if (matched) {
      applicable.push({
        id: lesson.id,
        rule: lesson.rule,
        anti_pattern: lesson.anti_pattern,
        matchReason,
        times_applied: lesson.times_applied || 0,
        times_prevented_failure: lesson.times_prevented_failure || 0,
      });
    }
  }
  return applicable;
}

// ── Carga criterios del usuario (memoria de criterio) ──
// Estos son gustos/preferencias operativos: "prefiere archivos completos",
// "trabaja mobile-only", "odia !important acumulado".
// Siempre se cargan TODOS los activos (no hay búsqueda, son pocos y estables).
function loadActiveCriteria() {
  return listMemories('criteria')
    .filter((c) => c.status !== 'retired')
    .map((c) => ({
      id: c.id,
      criterion: c.criterion || c.title,
      rationale: c.rationale || '',
      scope: c.scope || 'general',
      enforced_since: c.created || null,
      violated_count: c.violated_count || 0,
    }));
}

// ── Carga intentos previos de una tarea (para detección de repetición) ──
function loadPreviousAttempts(taskId) {
  const episodes = listMemories('episode').filter((e) => e.task_id === taskId);
  return episodes
    .sort((a, b) => (a.attempt || 0) - (b.attempt || 0))
    .map((e) => ({
      attempt: e.attempt,
      strategy: e.strategy,
      gates_failed: e.gates_failed,
      gates_passed: e.gates_passed,
      error_output: e.error_output,
      result: e.result,
    }));
}

// ── Construye el contexto completo para un turno de agente ──
export async function buildContext(task, opts = {}) {
  const index = loadIndex();
  const filesInvolved = task.files_involved || [];
  const symbolsInvolved = task.symbols_involved || [];

  // (1) Memoria relevante por búsqueda híbrida
  const memResults = await search(task.goal || '', {
    project: task.project,
    files: filesInvolved,
    symbols: symbolsInvolved,
    types: opts.memoryTypes || ['error', 'decision', 'fact', 'lesson'],
    topK: 8,
    includeStale: true, // el agente decide si las reverifica
  });

  // (2) Lecciones aplicables
  const lessons = loadApplicableLessons(task, filesInvolved);

  // (3) Criterios del usuario
  const criteria = loadActiveCriteria();

  // (4) Intentos previos en esta tarea
  const previousAttempts = loadPreviousAttempts(task.id);

  // (5) Detalle de memorias relevantes (cuerpo completo, no solo metadata)
  const memoryDetail = memResults.map((r) => {
    const mem = readMemory(r.memory.type, r.id);
    if (!mem) return null;
    return {
      id: r.id,
      type: r.memory.type,
      title: r.memory.title,
      score: r.score,
      reason: r.reason,
      stale: r.memory.stale,
      confidence: r.memory.confidence,
      body: mem.body,
      files: mem.files,
      symbols: mem.symbols,
    };
  }).filter(Boolean);

  // (6) Estadísticas compactas
  const stats = {
    totalMemories: Object.keys(index).length,
    lessonsActive: lessons.length,
    criteriaActive: criteria.length,
    previousAttempts: previousAttempts.length,
  };

  return {
    task: {
      id: task.id,
      goal: task.goal,
      description: task.description,
      project: task.project,
      autonomy: task.autonomy,
      gates: task.definition_of_done || [],
      budget: task.budget || {},
      attempt: (task.current_attempt || 0) + 1,
      files_involved: filesInvolved,
      symbols_involved: symbolsInvolved,
    },
    memory: memoryDetail,
    lessons,
    criteria,
    previousAttempts,
    stats,
  };
}

// ── Serializa el contexto a texto compacto para el prompt ──
// Esto es lo que se inyecta en el system prompt del agente.
// Formato pensado para ser denso y skimmable.
export function serializeContext(ctx) {
  const lines = [];

  lines.push('## TAREA ACTUAL');
  lines.push(`- ID: ${ctx.task.id}`);
  lines.push(`- Objetivo: ${ctx.task.goal}`);
  if (ctx.task.description) lines.push(`- Descripción: ${ctx.task.description}`);
  if (ctx.task.project) lines.push(`- Proyecto: ${ctx.task.project}`);
  lines.push(`- Intento: ${ctx.task.attempt}`);
  if (ctx.task.autonomy) lines.push(`- Autonomía: ${ctx.task.autonomy}`);
  if (ctx.task.files_involved?.length) lines.push(`- Archivos: ${ctx.task.files_involved.join(', ')}`);
  if (ctx.task.symbols_involved?.length) lines.push(`- Símbolos: ${ctx.task.symbols_involved.join(', ')}`);

  if (ctx.task.gates?.length) {
    lines.push('', '## DEFINITION OF DONE (gates)');
    for (const g of ctx.task.gates) {
      lines.push(`- ${g.id}: ${g.check}`);
      if (g.method) lines.push(`  método: ${g.method}`);
      if (g.command) lines.push(`  comando: \`${g.command}\``);
      if (g.expect) lines.push(`  espera: ${g.expect}`);
    }
  }

  if (ctx.task.budget && Object.keys(ctx.task.budget).length) {
    lines.push('', '## PRESUPUESTO DE LA TAREA');
    const b = ctx.task.budget;
    if (b.max_attempts) lines.push(`- Intentos máx: ${b.max_attempts}`);
    if (b.max_minutes) lines.push(`- Minutos máx: ${b.max_minutes}`);
    if (b.max_tokens) lines.push(`- Tokens máx: ${b.max_tokens}`);
  }

  if (ctx.previousAttempts.length) {
    lines.push('', '## INTENTOS PREVIOS EN ESTA TAREA');
    lines.push('⚠ No repitas estrategias que ya fallaron. Si el mismo gate falló 2 veces, cuestiona el diagnóstico.');
    for (const a of ctx.previousAttempts) {
      lines.push(`- Intento ${a.attempt}: ${a.strategy}`);
      if (a.gates_failed?.length) lines.push(`  gates fallidos: ${a.gates_failed.join(', ')}`);
      if (a.gates_passed?.length) lines.push(`  gates verdes: ${a.gates_passed.join(', ')}`);
      if (a.error_output) lines.push(`  error: ${String(a.error_output).slice(0, 200)}`);
    }
  }

  if (ctx.lessons.length) {
    lines.push('', '## LECCIONES ACTIVAS EN ESTA TAREA');
    lines.push('Declararás explícitamente al inicio de tu plan cómo las vas a respetar.');
    for (const l of ctx.lessons) {
      lines.push(`- ${l.id} (${l.matchReason}): ${l.rule}`);
      if (l.anti_pattern) lines.push(`  ANTIPATRÓN: ${l.anti_pattern}`);
    }
  }

  if (ctx.criteria.length) {
    lines.push('', '## CRITERIOS DEL USUARIO (memoria de criterio)');
    lines.push('Estas son preferencias operativas del usuario. Aplicar sin que te lo repitan.');
    for (const c of ctx.criteria) {
      lines.push(`- ${c.id}: ${c.criterion}`);
      if (c.rationale) lines.push(`  razón: ${c.rationale}`);
    }
  }

  if (ctx.memory.length) {
    lines.push('', '## MEMORIA RECUPERADA');
    lines.push('Antes de formar cualquier hipótesis, revisa esto. Cita los IDs.');
    for (const m of ctx.memory) {
      const staleTag = m.stale ? ' ⚠STALE-reverificar' : '';
      lines.push(`### ${m.id} [${m.type}] (score=${m.score.toFixed(1)}, conf=${m.confidence}${staleTag})`);
      lines.push(`Título: ${m.title}`);
      lines.push(`Razón: ${m.reason}`);
      if (m.files?.length) lines.push(`Archivos: ${m.files.join(', ')}`);
      if (m.symbols?.length) lines.push(`Símbolos: ${m.symbols.join(', ')}`);
      lines.push(m.body);
      lines.push('');
    }
  }

  lines.push('', '## STATS');
  lines.push(`- Memoria total: ${ctx.stats.totalMemories}`);
  lines.push(`- Lecciones activas en esta tarea: ${ctx.stats.lessonsActive}`);
  lines.push(`- Criterios activos: ${ctx.stats.criteriaActive}`);
  lines.push(`- Intentos previos: ${ctx.stats.previousAttempts}`);

  return lines.join('\n');
}

// Devuelve un resumen corto del contexto, para logs y dashboard.
export function contextSummary(ctx) {
  return {
    taskId: ctx.task.id,
    attempt: ctx.task.attempt,
    memoryHits: ctx.memory.length,
    lessonsActive: ctx.lessons.length,
    criteriaActive: ctx.criteria.length,
    previousAttempts: ctx.previousAttempts.length,
    gates: ctx.task.gates?.length || 0,
  };
}
