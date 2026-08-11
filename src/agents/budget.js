// src/agents/budget.js
// EL AGENTE PRESUPUESTO — vela por la cuota gratis de tokens y minutos.
//
// Filosofía (de la nota del usuario):
//   "Un agente que vigila tu cuota gratis de tokens y mata tareas
//    que se te comen el día antes de dejarte seco. En 3G y tier gratuito,
//    quedarte sin cuota a media tarea es el fallo más real que vas a tener."
//
// Funciones:
//   1. Suma el gasto del día (memory/budget/BUDGET-*.md).
//   2. Compara contra BUDGET_DAILY_TOKENS y BUDGET_DAILY_ACTIONS_MINUTES.
//   3. Si pasa el 80%, avisa en un Issue "diario".
//   4. Si pasa el 100%, mata tareas en cola (las marca status=throttled).
//   5. Estima minutos de Actions consumidos del día a partir de los episodes.

import { readFileSync, existsSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { config, restApiHeaders } from '../config.js';
import { listMemories, writeMemory, nextId } from '../memory.js';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function isToday(iso) {
  if (!iso) return false;
  return iso.startsWith(todayISO());
}

// ── Suma el gasto del día ──
function sumTodaySpend() {
  const budgets = listMemories('budget');
  const today = todayISO();
  let tokens = 0;
  let calls = 0;
  let failures = 0;
  let entries = 0;
  for (const b of budgets) {
    if (!isToday(b.created)) continue;
    tokens += b.total_tokens || 0;
    calls += b.calls || 0;
    failures += b.failures || 0;
    entries++;
  }
  return { tokens, calls, failures, entries };
}

// ── Estima minutos de Actions consumidos ──
// Cada episode = 1 job ≈ 1-3 min de Actions. Aproximamos a 2 min.
function estimateActionsMinutes() {
  const episodes = listMemories('episode').filter((e) => isToday(e.created));
  return episodes.length * 2; // estimación conservadora
}

// ── Tareas en cola (in_progress o handoff) ──
function loadThrottleableTasks() {
  const dir = resolve(config.root, config.paths.tasks);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try {
        return JSON.parse(readFileSync(join(dir, f), 'utf8'));
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .filter((t) => t.status === 'in_progress' || t.status === 'handoff');
}

function throttleTask(task) {
  const dir = resolve(config.root, config.paths.tasks);
  const path = join(dir, `${task.id}.json`);
  const updated = {
    ...task,
    status: 'throttled',
    throttled_at: new Date().toISOString(),
  };
  writeFileSync(path, JSON.stringify(updated, null, 2) + '\n', 'utf8');
}

// ── Comenta en el Issue "diario" del día ──
// El diario se crea una vez al día por el diarist.js. Si no existe, abrimos uno nuevo.
async function ensureDailyIssue() {
  // Buscar si hay un Issue abierto con label "daily-diary" y título que empiece con hoy
  if (!config.token || !config.repo) {
    return { number: 0, simulated: true };
  }
  const today = todayISO();
  const res = await fetch(
    `https://api.github.com/repos/${config.repo}/issues?labels=daily-diary&state=open&per_page=10`,
    { headers: restApiHeaders() }
  );
  if (!res.ok) return { number: 0, simulated: true };
  const issues = await res.json();
  const existing = issues.find((i) => i.title.includes(today));
  if (existing) return { number: existing.number };

  // Crear nuevo Issue diario
  const createRes = await fetch(`https://api.github.com/repos/${config.repo}/issues`, {
    method: 'POST',
    headers: restApiHeaders(),
    body: JSON.stringify({
      title: `📊 Diario — ${today}`,
      body: `_Diario auto-generado. El sistema reportará aquí el gasto y aprendizaje del día._`,
      labels: ['daily-diary', 'auto-generated'],
    }),
  });
  if (!createRes.ok) return { number: 0, simulated: true };
  const issue = await createRes.json();
  return { number: issue.number };
}

async function postBudgetComment(issueInfo, spend, minutes, percent, action) {
  const lines = ['### 💰 Budget watch', ''];
  lines.push(`**Gasto de hoy (${todayISO()}):**`);
  lines.push(`- Tokens: ${spend.tokens.toLocaleString('es')} / ${config.budgetDailyTokens.toLocaleString('es')} _(${percent.tokens}%)_`);
  lines.push(`- Llamadas a inferencia: ${spend.calls}`);
  lines.push(`- Minutos de Actions (estimado): ${minutes} / ${config.budgetDailyActionsMinutes} _(${percent.minutes}%)_`);
  lines.push(`- Fallos de inferencia: ${spend.failures}`);

  if (action === 'WARN') {
    lines.push('', `⚠️ **Acercándonos al límite.** Si no prioritizas, llegaremos al 100% antes de fin de día.`);
  } else if (action === 'THROTTLE') {
    lines.push('', `🚫 **Cuota agotada.** Tareas en cola marcadas como \`throttled\`. Se reanudarán mañana.`);
  }
  const body = lines.join('\n');

  if (issueInfo.number && config.token && config.repo) {
    await fetch(`https://api.github.com/repos/${config.repo}/issues/${issueInfo.number}/comments`, {
      method: 'POST',
      headers: restApiHeaders(),
      body: JSON.stringify({ body }),
    });
  } else {
    console.log(`[budget simulated] issue=#${issueInfo.number}:\n${body}`);
  }
}

async function main() {
  console.log('[budget] inicio');
  const spend = sumTodaySpend();
  const minutes = estimateActionsMinutes();
  const percentTokens = Math.round((spend.tokens / config.budgetDailyTokens) * 100);
  const percentMinutes = Math.round((minutes / config.budgetDailyActionsMinutes) * 100);

  console.log(`[budget] hoy: tokens=${spend.tokens} (${percentTokens}%) minutos=${minutes} (${percentMinutes}%)`);

  let action = 'OK';
  if (percentTokens >= 100 || percentMinutes >= 100) action = 'THROTTLE';
  else if (percentTokens >= config.budgetWarnPercent || percentMinutes >= config.budgetWarnPercent) action = 'WARN';

  if (action === 'THROTTLE') {
    const tasks = loadThrottleableTasks();
    for (const t of tasks) {
      throttleTask(t);
      console.log(`[budget] tarea throttled: ${t.id}`);
    }
  }

  if (action !== 'OK') {
    const issueInfo = await ensureDailyIssue();
    await postBudgetComment(issueInfo, spend, minutes, { tokens: percentTokens, minutes: percentMinutes }, action);
  }

  // Escribir snapshot de gasto
  const id = nextId('budget');
  writeMemory('budget', id, {
    id,
    type: 'budget',
    kind: action,
    date: todayISO(),
    tokens_used: spend.tokens,
    tokens_limit: config.budgetDailyTokens,
    tokens_percent: percentTokens,
    minutes_estimated: minutes,
    minutes_limit: config.budgetDailyActionsMinutes,
    minutes_percent: percentMinutes,
    calls: spend.calls,
    failures: spend.failures,
    tasks_throttled: action === 'THROTTLE' ? loadThrottleableTasks().length : 0,
    created: new Date().toISOString(),
  }, `# Budget snapshot ${todayISO()}\n\n- Tokens: ${spend.tokens}/${config.budgetDailyTokens} (${percentTokens}%)\n- Minutos: ${minutes}/${config.budgetDailyActionsMinutes} (${percentMinutes}%)\n- Action: ${action}`);

  console.log(`[budget] action=${action} fin`);
}

main().catch((err) => {
  console.error('[budget] FATAL:', err.message);
  process.exit(1);
});
