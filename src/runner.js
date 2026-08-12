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
import { parseFrontmatter } from './memory.js';
import { extractJSON } from './utils/json.js';

// ── Parseo de args ──
function parseArgs() {
  const args = {};
  for (const a of process.argv.slice(2)) {
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      args[k] = v ?? true;
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
// Usa el helper compartido en src/utils/json.js para evitar duplicación.
function parseAgentOutput(content) {
  const result = extractJSON(content);
  if (!result.ok) {
    throw new Error(`No se encontró JSON válido en la salida del modelo: ${result.error}`);
  }
  return result.value;
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

// ── Registra el episodio (intent) ──
function recordEpisode(task, agentName, output, attemptNum, gatesResult) {
  const id = nextId('episode');
  // Si el agente reportó gates_passed/failed, usar esos.
  // Si no, usar los resultados reales de ejecutar gate_check.
  const gatesPassed = (output.gates_passed && output.gates_passed.length > 0)
    ? output.gates_passed
    : (gatesResult?.passed || []);
  const gatesFailed = (output.gates_failed && output.gates_failed.length > 0)
    ? output.gates_failed
    : (gatesResult?.failed || []);

  const data = {
    id,
    type: 'episode',
    project: task.project || null,
    task_id: task.id,
    attempt: attemptNum,
    agent: agentName,
    strategy: output.handoff?.completed?.join('; ') || '(sin estrategia declarada)',
    gates_failed: gatesFailed,
    gates_passed: gatesPassed,
    result: output.route || 'NEW',
    needs_human: output.needs_human === true,
    created: new Date().toISOString(),
  };
  writeMemory('episode', id, data, output.handoff ? JSON.stringify(output.handoff, null, 2) : '');
  return id;
}

// ── Ejecuta gates automáticamente y devuelve resultado ──
// Antes el runner NO ejecutaba gates — solo guardaba lo que el agente reportaba
// (que era siempre []) porque el schema no pedía gates_passed/failed.
// Ahora: si el agente no reporta gates, ejecutamos gate_check para cada gate
// de definition_of_done y registramos el resultado real.
async function runGates(task, agentName) {
  const dod = task.definition_of_done;
  if (!Array.isArray(dod) || dod.length === 0) {
    return { passed: [], failed: [], details: [] };
  }

  const passed = [];
  const failed = [];
  const details = [];

  for (const gate of dod) {
    if (!gate.id) continue;
    // Saltar gates manuales — requieren intervención humana
    if (gate.method === 'manual') {
      details.push({ id: gate.id, method: 'manual', status: 'pending_human', reason: gate.expect || 'requiere revisión humana' });
      failed.push(gate.id); // manual = pending = no pasa automáticamente
      continue;
    }
    if (!gate.command && gate.method !== 'security_scan' && gate.method !== 'diff_scan') {
      details.push({ id: gate.id, method: gate.method, status: 'skipped', reason: 'sin command' });
      continue;
    }
    try {
      const result = await runTool('gate_check', {
        gate_id: gate.id,
        method: gate.method,
        command: gate.command,
        expect: gate.expect,
        files_to_scan: gate.files_to_scan,
      }, { agentName, task });
      if (result?.pass) {
        passed.push(gate.id);
        details.push({ id: gate.id, method: gate.method, status: 'pass', output: result.stdout?.slice(0, 200) });
      } else {
        failed.push(gate.id);
        details.push({ id: gate.id, method: gate.method, status: 'fail', reason: result?.reason || result?.stderr?.slice(0, 200) || 'gate falló' });
      }
    } catch (err) {
      failed.push(gate.id);
      details.push({ id: gate.id, method: gate.method, status: 'error', reason: err.message });
    }
  }

  return { passed, failed, details };
}

// ── Actualiza el estado de la tarea ──
function updateTask(task, output, episodeId) {
  const path = resolve(config.root, config.paths.tasks, `${task.id}.json`);
  const updated = {
    ...task,
    status: output.needs_human ? 'needs_human' : (output.handoff?.next_agent ? 'handoff' : 'completed'),
    current_attempt: (task.current_attempt || 0) + 1,
    last_episode: episodeId,
    last_agent: task.assigned,
    next_agent: output.handoff?.next_agent || null,
    next_task_hint: output.handoff?.next_task || null,
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
    next_agent: output.handoff?.next_agent,
  });
  writeFileSync(path, JSON.stringify(updated, null, 2) + '\n', 'utf8');
  return updated;
}

// ── Comenta el handoff en el Issue ──
async function postHandoffComment(task, agentName, output) {
  if (!task.issue) return null;
  const lines = [];
  lines.push(`### Handoff de \`${agentName}\``);
  lines.push('');
  lines.push(`**Ruta declarada:** ${output.route}`);
  if (output.reused_memory?.length) {
    lines.push(`**Memoria reutilizada:** ${output.reused_memory.join(', ')}`);
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

  // Ejecutar gates automáticamente si el agente no los reportó
  let gatesResult = null;
  if ((!output.gates_passed || output.gates_passed.length === 0) &&
      (!output.gates_failed || output.gates_failed.length === 0) &&
      ctx.task?.definition_of_done?.length > 0) {
    console.log('[runner] ejecutando gates automáticamente...');
    try {
      gatesResult = await runGates(ctx.task, args.agent);
      console.log(`[runner] gates: ${gatesResult.passed.length} pass, ${gatesResult.failed.length} fail`);
      // Si todos los gates pasan, marcar la tarea como completada
      if (gatesResult.passed.length > 0 && gatesResult.failed.length === 0) {
        if (!output.handoff) output.handoff = {};
        if (!output.handoff.completed) output.handoff.completed = [];
        output.handoff.completed.push(`gates_passed: ${gatesResult.passed.join(', ')}`);
      }
      // Si algún gate falló, forzar handoff (no completed)
      if (gatesResult.failed.length > 0 && !output.needs_human) {
        output.route = output.route || 'NEW';
        if (!output.handoff) output.handoff = {};
        output.handoff.next_agent = output.handoff.next_agent || args.agent; // reintento mismo agente
      }
    } catch (err) {
      console.warn(`[runner] runGates falló (no crítico): ${err.message}`);
    }
  }

  // Registrar episodio (con gates reales si se ejecutaron)
  const episodeId = recordEpisode(task, args.agent, output, ctx.task.attempt, gatesResult);
  console.log(`[runner] episodio registrado: ${episodeId}`);

  // Actualizar tarea
  const updatedTask = updateTask(task, output, episodeId);

  // Comentar handoff en el issue
  const commentInfo = await postHandoffComment(task, args.agent, output);

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

  console.log(`[runner] turno completado. Próximo agente: ${output.handoff?.next_agent || '(ninguno)'}`);

  // Output final para que el workflow lo use si quiere
  return {
    agent: args.agent,
    task: task.id,
    route: output.route,
    episode: episodeId,
    memoryWrites: writesResult,
    nextAgent: output.handoff?.next_agent,
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
