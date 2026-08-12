// src/chat.js
// Endpoint conversacional para el dashboard.
// Uso:
//   node src/chat.js --question="¿qué tareas están stuck?"
//
// En GitHub Actions lo expone un workflow con workflow_dispatch.
// En local, el dashboard puede llamarlo vía GitHub API (crear Issue temporal) o vía un workflow_dispatch.

import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { config } from './config.js';
import { complete } from './models.js';
import { search, listMemories, loadIndex } from './memory.js';
import { parseFrontmatter } from './memory.js';

function parseArgs() {
  const args = {};
  for (const a of process.argv.slice(2)) {
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      args[k] = v ?? true;
    }
  }
  return {
    question: args.question || args.q || process.env.QUESTION,
    history: args.history ? JSON.parse(args.history) : [],
  };
}

async function loadSystemContext() {
  const index = loadIndex();
  const stats = {
    totalMemories: Object.keys(index).length,
    byType: {},
  };
  for (const m of Object.values(index)) {
    stats.byType[m.type] = (stats.byType[m.type] || 0) + 1;
  }

  // Cargar tareas activas
  const tasksDir = resolve(config.root, config.paths.tasks);
  let tasks = [];
  if (existsSync(tasksDir)) {
    const { readdirSync } = await import('node:fs');
    tasks = readdirSync(tasksDir)
      .filter(f => f.endsWith('.json') && f !== 'index.json')
      .map(f => {
        try {
          return JSON.parse(readFileSync(join(tasksDir, f), 'utf8'));
        } catch { return null; }
      })
      .filter(Boolean);
  }

  // Último diario
  const diaries = listMemories('diary').sort((a, b) =>
    new Date(b.created || 0) - new Date(a.created || 0)
  );
  const lastDiary = diaries[0] || null;

  // Último budget
  const budgets = listMemories('budget').sort((a, b) =>
    new Date(b.created || 0) - new Date(a.created || 0)
  );
  const lastBudget = budgets[0] || null;

  // Errores abiertos
  const errors = listMemories('error').filter(e => e.status !== 'resolved');

  // Lecciones activas
  const lessons = listMemories('lesson').filter(l => !l.archived && !l.promoted_to_rule);

  return { stats, tasks, lastDiary, lastBudget, errors, lessons };
}

async function answer(question, history = []) {
  const ctx = await loadSystemContext();

  // Buscar memoria relevante
  const memResults = await search(question, { topK: 5 });
  const memContext = memResults.map(m =>
    `- ${m.id} [${m.memory.type}] ${m.memory.title} (conf=${m.memory.confidence})`
  ).join('\n') || '(sin memoria relevante)';

  const tasksSummary = ctx.tasks.map(t =>
    `- ${t.id}: ${t.goal} [${t.status}] intento ${t.current_attempt || 0}/${t.budget?.max_attempts || '?'} agente=${t.assigned}`
  ).join('\n') || '(sin tareas)';

  const errorsSummary = ctx.errors.map(e =>
    `- ${e.id}: ${e.title} [${e.status}] conf=${e.confidence} ${e.stale ? '⚠STALE' : ''}`
  ).join('\n') || '(sin errores abiertos)';

  const lessonsSummary = ctx.lessons.map(l =>
    `- ${l.id}: ${l.title} (aplicada=${l.times_applied}, previno=${l.times_prevented_failure})`
  ).join('\n') || '(sin lecciones activas)';

  const diarySummary = ctx.lastDiary
    ? `Último diario (${ctx.lastDiary.created || ctx.lastDiary.date || '?'}): ${ctx.lastDiary.title || ctx.lastDiary.headline || '(sin headline)'}`
    : '(sin diarios todavía)';

  const budgetSummary = ctx.lastBudget
    ? `Budget ${ctx.lastBudget.date || ctx.lastBudget.created?.slice(0,10) || '?'}: ${ctx.lastBudget.tokens_percent || 0}% tokens, ${ctx.lastBudget.minutes_percent || 0}% minutos, kind=${ctx.lastBudget.kind || 'OK'}`
    : '(sin budget todavía)';

  const system = `Eres CHAT, la interfaz conversacional de agent-brain. Respondes preguntas del usuario sobre el sistema en lenguaje natural.

## CONTEXTO ACTUAL DEL SISTEMA

### Estadísticas
- ${ctx.stats.totalMemories} memorias totales
- Tipos: ${JSON.stringify(ctx.stats.byType)}

### Tareas
${tasksSummary}

### Errores abiertos
${errorsSummary}

### Lecciones activas
${lessonsSummary}

### Último diario
${diarySummary}

### Último budget
${budgetSummary}

### Memoria relevante para la pregunta
${memContext}

## REGLAS
- Responde en texto markdown natural, NO JSON.
- Sé honesto: si no sabes algo, dilo.
- Sé conciso: máx 3 párrafos. El usuario lee desde móvil en 3G.
- Si la pregunta requiere crear una tarea, sugiérelo pero NO la crees.
- Cita IDs concretos (TASK-XXXX, BUG-XXXX, LESSON-XXXX) cuando sea relevante.
- Si hay algo mal (task stuck, budget alto, memoria stale), menciónalo proactivamente.`;

  const messages = [
    { role: 'system', content: system },
    ...history.slice(-6).map(h => ({
      role: h.role || 'user',
      content: h.content
    })),
    { role: 'user', content: question },
  ];

  const response = await complete(messages, { temperature: 0.4 });
  return response;
}

async function main() {
  const { question, history } = parseArgs();
  if (!question) {
    console.error('Uso: node src/chat.js --question="¿qué tareas están stuck?"');
    process.exit(1);
  }
  console.log(`[chat] pregunta: "${question}"`);
  const response = await answer(question, history);
  console.log('[chat] respuesta:');
  console.log('---RESPONSE_START---');
  console.log(response);
  console.log('---RESPONSE_END---');
}

main().catch(err => {
  console.error('[chat] FATAL:', err.message);
  process.exit(1);
});

export { answer };
