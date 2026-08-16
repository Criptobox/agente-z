// src/runner.js
// CICLO UNIVERSAL DE AGENTE
//
// Este es el único punto de entrada para ejecutar un turno de un agente.
// Uso:
//   node src/runner.js --agent=code --task=TASK-0001
//   AGENT=code TASK_ID=TASK-0001 node src/runner.js
//
// En GitHub Actions lo invoca el workflow agent-run.yml.
//
// Ciclo (sección 5 del spec):
//   1. LEER tarea y contexto recuperado.
//   2. REVISAR memoria recuperada ANTES de formar hipótesis.
//   3. DECIDIR ruta: REUSE | CONTINUE | NEW.
//   4. TRABAJAR con tools autorizadas.
//   5. VERIFICAR (gate_check, nunca opinión).
//   6. ESCRIBIR memoria estructurada.
//   7. GENERAR handoff.

import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { config } from './config.js';
import { complete, getMetrics } from './models.js';
import { buildContext, serializeContext } from './context.js';
import { writeMemory, nextId, saveIndex, buildIndex, saveVectors, loadVectors } from './memory.js';
import { runTool, listTools } from './tools/index.js';
import { gate_check } from './tools/gate_check.js';
import { parseFrontmatter } from './memory.js';

// ── Parseo de args ──
function parseArgs() {
  const args = {};
  for (const a of process.argv.slice(2)) {
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq === -1) args[a.slice(2)] = true;
      else args[a.slice(2, eq)] = a.slice(eq + 1);
    }
  }
  return {
    agent: args.agent || process.env.AGENT,
    taskId: args.task || args['task-id'] || process.env.TASK_ID,
    dryRun: args['dry-run'] === true || config.dryRun,
  };
}

// ── Carga definición declarativa del agente (agents/<name>.md) ──
function loadAgentDefinition(name) {
  const path = resolve(config.root, config.paths.agents, `${name}.md`);
  if (!existsSync(path)) {
    throw new Error(`No existe definición para agente "${name}" en ${path}`);
  }
  const raw = readFileSync(path, 'utf8');
  const { data, body } = parseFrontmatter(raw);
  return {
    name,
    role: data.role || name,
    tools: Array.isArray(data.tools) ? data.tools : [],
    permissions: Array.isArray(data.permissions) ? data.permissions : [],
    autonomy: data.autonomy || 'assisted',
    modelPreference: data.model || null,
    maxTurns: data.max_turns || 1,
    systemPrompt: body,
    frontmatter: data,
  };
}

// ── Carga tarea ──
function loadTask(taskId) {
  const path = resolve(config.root, config.paths.tasks, `${taskId}.json`);
  if (!existsSync(path)) {
    throw new Error(`No existe tarea "${taskId}" en ${path}`);
  }
  return JSON.parse(readFileSync(path, 'utf8'));
}

// ── Construye el prompt completo ──
function buildPrompt(agentDef, task, ctx) {
  const ctxText = serializeContext(ctx);
  const toolsDesc = listTools()
    .filter((t) => agentDef.tools.includes(t.name))
    .map((t) => `- ${t.name}: ${t.description} (params: ${JSON.stringify(t.inputSchema)})`)
    .join('\n');

  const system = `Eres un agente especializado dentro de un sistema multi-agente con memoria compartida. NO trabajas solo. Otros agentes han trabajado antes sobre este proyecto y otros trabajarán después leyendo lo que tú escribas.

## TU ROL
${agentDef.systemPrompt}

## CICLO OBLIGATORIO
1. LEER la tarea y el contexto recuperado.
2. REVISAR la memoria recuperada ANTES de formar cualquier hipótesis.
3. DECIDIR una de estas tres rutas y declararla explícitamente:
   - REUSE: la memoria ya contiene la respuesta. No investigues. Cita los IDs.
   - CONTINUE: la memoria contiene trabajo parcial. Continúa desde ahí, NO desde cero. Cita desde dónde continúas.
   - NEW: no hay nada relevante. Justifica en una frase por qué.
4. TRABAJAR usando solo las herramientas autorizadas.
5. VERIFICAR. Una hipótesis no verificada nunca se reporta como hecho.
6. ESCRIBIR memoria estructurada.
7. GENERAR handoff.

## REGLAS DE MEMORIA (no negociables)
- Si la memoria dice que algo se intentó y falló, NO lo vuelvas a proponer sin explicar qué cambió desde entonces.
- Si tu conclusión contradice una memoria existente, NO la sobrescribas. Emite KNOWLEDGE_CONFLICT y deja que el Orchestrator decida.
- El estado ACTUAL del código manda sobre cualquier memoria histórica. Si una memoria describe código que ya no existe así, márcala invalidated_by: TASK-XXXX. No la borres nunca.
- Marca cada afirmación como FACT | HYPOTHESIS | OBSERVATION.
- Un HYPOTHESIS con confidence > 70 sin verificación es un error tuyo.

## CALIBRACIÓN DE CONFIANZA
100 → verificado por test que pasa, o leído directamente en el código actual
 90 → leído en código pero sin ejecutar
 70 → deducido de evidencia fuerte y consistente
 50 → hipótesis plausible sin evidencia directa
 30 → conjetura
Si no puedes justificar el número, es demasiado alto.

## QUÉ NO ESCRIBIR EN MEMORIA
- Resúmenes de tu propio razonamiento.
- Cosas obvias del lenguaje o del framework.
- Nada que no vaya a ahorrarle trabajo real a otro agente en el futuro.
Es preferible escribir 0 memorias que escribir ruido. La memoria se degrada con el ruido, y una memoria degradada es peor que no tener memoria.

## HERRAMIENTAS AUTORIZADAS
${toolsDesc || '(ninguna — solo puedes razonar y escribir memoria)'}

## LÍMITES
- Permisos: ${agentDef.permissions.join(', ') || 'ninguno'}
- Nivel de autonomía: ${agentDef.autonomy}
- Si necesitas algo fuera de tus permisos, emite REQUEST_PERMISSION. No lo intentes por otra vía.

## FORMATO DE SALIDA (JSON estricto, sin markdown alrededor, sin \`\`\`json)
{
  "route": "REUSE|CONTINUE|NEW",
  "reused_memory": ["BUG-001"],
  "findings": [
    { "kind": "FACT|HYPOTHESIS|OBSERVATION",
      "statement": "...",
      "evidence": "archivo:línea o URL",
      "confidence": 0 }
  ],
  "memory_writes": [
    { "type": "error|decision|fact|lesson|criteria|episode",
      "title": "...",
      "body": "...",
      "files": [], "symbols": [], "tags": [],
      "confidence": 0 }
  ],
  "tool_calls": [
    { "name": "file_read", "input": { "path": "..." } }
  ],
  "conflicts": [],
  "handoff": {
    "completed": ["..."],
    "not_completed": ["..."],
    "files_touched": ["..."],
    "risks": ["..."],
    "next_agent": "test",
    "next_task": "Verificar que ..."
  },
  "needs_human": false
}

## CONTEXTO
${ctxText}
`;

  const user = `Tu turno, agente ${agentDef.name}. Tarea: ${task.goal}. Intento #${ctx.task.attempt}. Declara tu ruta y trabaja.`;
  return { system, user };
}

// ── Parseo robusto de la salida del modelo ──
// El modelo puede devolver JSON puro, JSON con texto alrededor, o JSON dentro de ```json.
function parseAgentOutput(content) {
  if (!content) throw new Error('Respuesta vacía del modelo');
  let text = content.trim();

  // Quitar fences si las hay
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) text = fenceMatch[1].trim();

  // Buscar el primer { y el último }
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first === -1 || last === -1 || last < first) {
    throw new Error('No se encontró JSON válido en la salida del modelo');
  }
  const jsonStr = text.slice(first, last + 1);
  try {
    return JSON.parse(jsonStr);
  } catch (err) {
    // Intento final: limpiar comillas escapadas mal
    try {
      return JSON.parse(jsonStr.replace(/\\([^"\\nrtbf/])/g, '$1'));
    } catch {
      throw new Error(`JSON inválido: ${err.message}`);
    }
  }
}

// ── Persiste las memory_writes del output ──
function persistMemoryWrites(writes, task, agentName) {
  const results = [];
  for (const w of writes || []) {
    const id = nextId(w.type);
    const data = {
      id,
      type: w.type,
      project: task.project || null,
      title: w.title || '(sin título)',
      status: w.type === 'error' ? 'open' : (w.type === 'decision' ? 'active' : null),
      severity: w.severity || null,
      confidence: typeof w.confidence === 'number' ? w.confidence : 50,
      files: Array.isArray(w.files) ? w.files : [],
      symbols: Array.isArray(w.symbols) ? w.symbols : [],
      tags: Array.isArray(w.tags) ? w.tags : [],
      created: new Date().toISOString().slice(0, 10),
      updated: new Date().toISOString().slice(0, 10),
      agent: agentName,
      commit: process.env.GITHUB_SHA || null,
      supersedes: null,
      invalidated_by: null,
      task_id: task.id,
    };
    // Limpiar nulos para que el frontmatter quede limpio
    Object.keys(data).forEach((k) => data[k] === null && delete data[k]);
    const { written, path } = writeMemory(w.type, id, data, w.body || '');
    results.push({ id, type: w.type, written, path });
  }
  return results;
}

// ── VERIFICACIÓN: ejecuta los gates del DoD con la tool gate_check ──
// Sección 12.2 del spec: el agente que hace el trabajo nunca declara el éxito.
// La evidencia viene de la herramienta, no de la opinión del modelo.
//   - gates test/assertion → se ejecutan con sanitización
//   - diff_scan/security_scan sin files_to_scan explícito → se escanean los
//     archivos que el agente tocó este turno (via file_write)
async function verifyGates(task, filesWritten) {
  const gates = task.definition_of_done || [];
  const results = [];
  const skipped = [];
  if (!gates.length) return { results, skipped, gates_passed: [], gates_failed: [] };

  for (const gate of gates) {
    if (!gate || !gate.id) continue;
    const input = {
      gate_id: gate.id,
      method: gate.method,
      command: gate.command,
      expect: gate.expect,
    };
    const isScan = gate.method === 'diff_scan' || gate.method === 'security_scan';
    if (isScan && !Array.isArray(gate.files_to_scan)) {
      if (filesWritten.length > 0) {
        input.files_to_scan = filesWritten;
      } else {
        skipped.push(`${gate.id} (${gate.method} sin files_to_scan y el agente no tocó archivos este turno)`);
        continue;
      }
    } else if (Array.isArray(gate.files_to_scan)) {
      input.files_to_scan = gate.files_to_scan;
    }
    try {
      const r = await gate_check.run(input, { task });
      results.push({
        id: gate.id,
        method: gate.method || 'test',
        pass: r.pass === true,
        reason: (r.reason || (r.pass ? 'OK' : `exit_code=${r.exitCode}`)).slice(0, 300),
      });
    } catch (err) {
      results.push({ id: gate.id, method: gate.method || 'test', pass: false, reason: `error ejecutando gate: ${err.message}` });
    }
  }

  return {
    results,
    skipped,
    gates_passed: results.filter((r) => r.pass).map((r) => r.id),
    gates_failed: results.filter((r) => !r.pass).map((r) => r.id),
  };
}

// ── Registra el episodio (intent) ──
function recordEpisode(task, agentName, output, attemptNum) {
  const id = nextId('episode');
  const data = {
    id,
    type: 'episode',
    project: task.project || null,
    task_id: task.id,
    attempt: attemptNum,
    agent: agentName,
    strategy: output.handoff?.completed?.join('; ') || '(sin estrategia declarada)',
    gates_failed: (output.gates_failed || []),
    gates_passed: (output.gates_passed || []),
    result: output.route || 'NEW',
    needs_human: output.needs_human === true,
    created: new Date().toISOString(),
  };
  writeMemory('episode', id, data, output.handoff ? JSON.stringify(output.handoff, null, 2) : '');
  return id;
}

// ── Actualiza el estado de la tarea ──
// Reglas del loop de convergencia (spec, pasos 4-7):
//   - needs_human → 'needs_human'
//   - gates verificados y TODOS en verde → 'completed' (confidence 98, cerrar)
//   - gates fallando y presupuesto agotado → 'stuck' (informe para humano;
//     agent-run.yml dispara el learner al ver 'stuck')
//   - gates fallando con presupuesto → handoff (por defecto al agente 'test',
//     que es un agente DISTINTO al que trabajó)
function updateTask(task, output, episodeId, verification) {
  const path = resolve(config.root, config.paths.tasks, `${task.id}.json`);
  const nextAttempt = (task.current_attempt || 0) + 1;
  const maxAttempts = task.budget?.max_attempts || 5;
  const gatesFailed = verification?.gates_failed || [];
  const gatesChecked = (verification?.results || []).length;

  let status;
  let nextAgent = output.handoff?.next_agent || null;
  let nextTaskHint = output.handoff?.next_task || null;

  if (output.needs_human) {
    status = 'needs_human';
  } else if (gatesChecked > 0 && gatesFailed.length === 0) {
    // Todos los gates verificados en verde → cerrar (aunque el agente propusiera
    // continuar, la evidencia objetiva manda).
    status = 'completed';
    nextAgent = null;
  } else if (gatesFailed.length > 0 && nextAttempt >= maxAttempts) {
    // Presupuesto de intentos agotado con gates rojos → STUCK, no "no pude".
    status = 'stuck';
    nextAgent = null;
  } else if (gatesFailed.length > 0 && !nextAgent) {
    // Gates rojos y el agente no propuso continuación → verificador independiente.
    status = 'handoff';
    nextAgent = 'test';
    nextTaskHint = `Gates fallidos: ${gatesFailed.join(', ')}. Diagnosticar y proponer estrategia distinta a las falladas.`;
  } else {
    status = nextAgent ? 'handoff' : 'completed';
  }

  const updated = {
    ...task,
    status,
    current_attempt: nextAttempt,
    last_episode: episodeId,
    last_agent: task.assigned,
    next_agent: nextAgent,
    next_task_hint: nextTaskHint,
    gates_passed: verification?.gates_passed || [],
    gates_failed: gatesFailed,
    updated: new Date().toISOString(),
  };
  updated.handoffs = task.handoffs || [];
  updated.handoffs.push({
    at: new Date().toISOString(),
    agent: task.assigned,
    episode: episodeId,
    route: output.route,
    completed: output.handoff?.completed || [],
    not_completed: output.handoff?.not_completed || [],
    next_agent: nextAgent,
    gates_passed: updated.gates_passed,
    gates_failed: gatesFailed,
  });
  writeFileSync(path, JSON.stringify(updated, null, 2) + '\n', 'utf8');
  return updated;
}

// ── Comenta el handoff en el Issue ──
async function postHandoffComment(task, agentName, output, verification) {
  if (!task.issue) return null;
  const lines = [];
  lines.push(`### Handoff de \`${agentName}\``);
  lines.push('');
  lines.push(`**Ruta declarada:** ${output.route}`);
  if (output.reused_memory?.length) {
    lines.push(`**Memoria reutilizada:** ${output.reused_memory.join(', ')}`);
  }
  if (verification && (verification.results.length || verification.skipped.length)) {
    lines.push('', '**Gates del DoD (evidencia de `gate_check`, no opinión del agente):**');
    for (const r of verification.results) {
      lines.push(`- ${r.pass ? '✅' : '❌'} \`${r.id}\` (${r.method})${r.pass ? '' : ` — ${r.reason}`}`);
    }
    for (const s of verification.skipped) {
      lines.push(`- ⏭️ \`${s}\``);
    }
  }
  if (output.findings?.length) {
    lines.push('', '**Findings:**');
    for (const f of output.findings) {
      lines.push(`- [${f.kind}] ${f.statement} _(conf=${f.confidence}, evidencia=${f.evidence || 'n/a'})_`);
    }
  }
  if (output.conflicts?.length) {
    lines.push('', '⚠️ **Conflictos:**');
    for (const c of output.conflicts) lines.push(`- ${c}`);
  }
  if (output.handoff) {
    lines.push('', '**Completado:**');
    for (const c of output.handoff.completed || []) lines.push(`- ✅ ${c}`);
    if (output.handoff.not_completed?.length) {
      lines.push('', '**Pendiente:**');
      for (const c of output.handoff.not_completed) lines.push(`- ⏳ ${c}`);
    }
    if (output.handoff.risks?.length) {
      lines.push('', '**Riesgos:**');
      for (const r of output.handoff.risks) lines.push(`- ⚠️ ${r}`);
    }
    if (output.handoff.next_agent) {
      lines.push('', `**Siguiente:** \`${output.handoff.next_agent}\` — ${output.handoff.next_task || ''}`);
    }
  }
  if (output.needs_human) {
    lines.push('', '🚨 **Requiere intervención humana.**');
  }
  const body = lines.join('\n');

  // Si hay issue y token, comentamos vía API. Si no, log.
  if (config.token && config.repo) {
    const res = await fetch(`https://api.github.com/repos/${config.repo}/issues/${task.issue}/comments`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.token}`,
        Accept: 'application/vnd.github+json',
      },
      body: JSON.stringify({ body }),
    });
    if (res.ok) {
      const data = await res.json();
      return { url: data.html_url };
    }
  }
  console.log(`[handoff simulated] #${task.issue}:\n${body}`);
  return { simulated: true };
}

// ── Punto de entrada principal ──
async function main() {
  const args = parseArgs();
  if (!args.agent || !args.taskId) {
    console.error('Uso: node src/runner.js --agent=<name> --task=<TASK-XXXX>');
    process.exit(1);
  }

  console.log(`[runner] agente=${args.agent} tarea=${args.taskId} dryRun=${args.dryRun}`);

  const agentDef = loadAgentDefinition(args.agent);
  const task = loadTask(args.taskId);

  console.log(`[runner] agente definido: rol=${agentDef.role} tools=${agentDef.tools.join(',')}`);
  console.log(`[runner] tarea: ${task.goal}`);

  // Construir contexto
  const ctx = await buildContext(task);
  console.log(`[runner] contexto construido: ${ctx.stats.totalMemories} memorias, ${ctx.memory.length} relevantes, ${ctx.lessons.length} lecciones activas`);

  // Compilar prompt
  const { system, user } = buildPrompt(agentDef, task, ctx);

  // ─── BUCLE AGENTIC ───
  // El modelo puede devolver tool_calls → ejecutamos → reenviamos resultados → repite hasta que no haya más tool_calls
  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];

  const MAX_ITERATIONS = 5; // límite de seguridad
  let output = null;
  const allToolResults = [];

  for (let iter = 1; iter <= MAX_ITERATIONS; iter++) {
    console.log(`[runner] iteración ${iter}/${MAX_ITERATIONS} — llamando al modelo...`);
    const rawOutput = await complete(messages, { jsonMode: true, temperature: 0.2 });
    console.log(`[runner] respuesta recibida (${rawOutput.length} chars)`);

    output = parseAgentOutput(rawOutput);
    console.log(`[runner] ruta=${output.route} findings=${output.findings?.length || 0} writes=${output.memory_writes?.length || 0} tool_calls=${output.tool_calls?.length || 0}`);

    // Si no hay tool_calls, terminamos
    if (!output.tool_calls || output.tool_calls.length === 0) {
      console.log('[runner] no hay más tool_calls — terminando');
      break;
    }

    // Ejecutar las tool_calls
    const iterResults = [];
    for (const call of output.tool_calls) {
      console.log(`[runner] tool_call [iter ${iter}]: ${call.name}`);
      const result = await runTool(call.name, call.input || {}, { task }, agentDef.permissions);
      iterResults.push({ name: call.name, input: call.input, ...result });
      allToolResults.push({ name: call.name, input: call.input, ...result, iteration: iter });
      console.log(`[runner] tool_call ${call.name} → ok=${result.ok}`);
    }

    // Reenviar resultados al modelo para que continúe
    messages.push({ role: 'assistant', content: rawOutput });
    messages.push({
      role: 'user',
      content: `Resultados de tus tool_calls:\n\n${JSON.stringify(iterResults, null, 2)}\n\nAhora continúa tu trabajo con esta nueva información. Si ya tienes todo lo que necesitas, devuelve tu output final SIN tool_calls (con route, findings, memory_writes, handoff).`,
    });

    // Si es la última iteración y todavía hay tool_calls, forzar cierre
    if (iter === MAX_ITERATIONS) {
      console.log('[runner] alcanzado MAX_ITERATIONS — forzando cierre');
      messages.push({
        role: 'user',
        content: 'Límite de iteraciones alcanzado. Devuelve tu output final AHORA sin más tool_calls.',
      });
    }
  }

  const toolResults = allToolResults;
  console.log(`[runner] total tool_calls ejecutadas: ${toolResults.length}`);

  // Persistir memory_writes
  const writesResult = persistMemoryWrites(output.memory_writes || [], task, args.agent);
  console.log(`[runner] memoria escrita: ${writesResult.filter((w) => w.written).length} archivos`);

  // ─── VERIFICACIÓN OBJETIVA: ejecutar los gates del DoD ───
  // El agente que trabaja nunca declara el éxito — esta es la única evidencia.
  // Los escaneos sin files_to_scan examinan lo que el agente tocó este turno.
  const filesWritten = allToolResults
    .filter((r) => r.name === 'file_write' && r.ok && r.input?.path)
    .map((r) => r.input.path);
  const verification = await verifyGates(task, filesWritten);
  if (verification.results.length || verification.skipped.length) {
    console.log(`[runner] gates: verificados=${verification.results.length} ` +
      `pasados=[${verification.gates_passed.join(',')}] fallidos=[${verification.gates_failed.join(',')}] ` +
      `omitidos=${verification.skipped.length}`);
  } else {
    console.log('[runner] gates: la tarea no define gates verificables');
  }
  output.gates_passed = verification.gates_passed;
  output.gates_failed = verification.gates_failed;

  // Registrar episodio (ahora con gates reales — devil/learner/context los consumen)
  const episodeId = recordEpisode(task, args.agent, output, ctx.task.attempt);
  console.log(`[runner] episodio registrado: ${episodeId}`);

  // Actualizar tarea
  const updatedTask = updateTask(task, output, episodeId, verification);
  if (updatedTask.status === 'stuck') {
    console.log(`[runner] STUCK: intentos=${updatedTask.current_attempt}/${updatedTask.budget?.max_attempts || 5} gates_fallidos=[${verification.gates_failed.join(',')}]`);
  }

  // Comentar handoff en el issue
  const commentInfo = await postHandoffComment(task, args.agent, output, verification);

  // Rebuild index + vectors
  saveIndex(buildIndex());
  // vectors se regeneran en reindex.yml (nocturno) para no pagar embed en cada turno

  // Métricas
  const metrics = getMetrics();
  console.log('[runner] métricas inferencia:', metrics);

  // Persistir budget log
  try {
    const budget = {
      timestamp: new Date().toISOString(),
      agent: args.agent,
      task: task.id,
      tokensIn: metrics.tokensIn,
      tokensOut: metrics.tokensOut,
      calls: metrics.calls,
      failures: metrics.failures,
      fallbacks: metrics.fallbacksTriggered,
    };
    const budgetId = nextId('budget');
    writeMemory('budget', budgetId, {
      id: budgetId,
      type: 'budget',
      agent: args.agent,
      task_id: task.id,
      tokens_in: metrics.tokensIn,
      tokens_out: metrics.tokensOut,
      total_tokens: metrics.tokensIn + metrics.tokensOut,
      calls: metrics.calls,
      failures: metrics.failures,
      fallbacks: metrics.fallbacksTriggered,
      models: metrics.byModel,
      created: new Date().toISOString(),
    }, JSON.stringify(budget, null, 2));
  } catch (err) {
    console.error('[runner] no se pudo escribir budget log:', err.message);
  }

  console.log(`[runner] turno completado. Estado tarea: ${updatedTask.status}. Próximo agente: ${updatedTask.next_agent || '(ninguno)'}`);

  // Output final para que el workflow lo use si quiere
  return {
    agent: args.agent,
    task: task.id,
    route: output.route,
    episode: episodeId,
    memoryWrites: writesResult,
    gates: {
      checked: verification.results.length,
      passed: verification.gates_passed,
      failed: verification.gates_failed,
      skipped: verification.skipped,
    },
    taskStatus: updatedTask.status,
    nextAgent: updatedTask.next_agent,
    needsHuman: output.needs_human === true,
    metrics,
  };
}

main()
  .then((result) => {
    console.log('[runner] OK', JSON.stringify(result, null, 2));
    process.exit(0);
  })
  .catch((err) => {
    console.error('[runner] FATAL:', err.message);
    console.error(err.stack);
    process.exit(1);
  });
