// src/agents/diarist.js
// EL DIARISTA — escribe un resumen diario de una frase en un Issue.
//
// Filosofía (de la nota del usuario):
//   "Un 'diario' que se escribe solo. Cada noche, un resumen de una frase
//    de lo que el sistema hizo y aprendió, en un Issue. Abres la app por la
//    mañana y sabes qué pasó mientras atendías la tienda. Continuidad real."
//
// Funciones:
//   1. Resume el día: tareas cerradas, abiertas, stuck, lecciones propuestas.
//   2. Genera UNA frase principal + 3-5 bullets de contexto.
//   3. Comenta en el Issue diario (lo crea si no existe).
//   4. Si hubo STUCK o fallo importante, lo resalta arriba.

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { config, restApiHeaders } from '../config.js';
import { complete } from '../models.js';
import { listMemories } from '../memory.js';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function isToday(iso) {
  return iso && iso.startsWith(todayISO());
}

function gatherDay() {
  const episodes = listMemories('episode').filter((e) => isToday(e.created));
  const errors = listMemories('error').filter((e) => isToday(e.created) || isToday(e.updated));
  const decisions = listMemories('decision').filter((d) => isToday(d.created));
  const facts = listMemories('fact').filter((f) => isToday(f.created));
  const lessons = listMemories('lesson').filter((l) => isToday(l.created));

  const tasksDir = resolve(config.root, config.paths.tasks);
  let tasksToday = [];
  if (existsSync(tasksDir)) {
    tasksToday = readdirSync(tasksDir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        try {
          return JSON.parse(readFileSync(join(tasksDir, f), 'utf8'));
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .filter((t) => isToday(t.created) || isToday(t.updated));
  }

  return { episodes, errors, decisions, facts, lessons, tasks: tasksToday };
}

async function ensureDailyIssue() {
  if (!config.token || !config.repo) {
    return { number: 0, simulated: true };
  }
  const today = todayISO();
  const res = await fetch(
    `https://api.github.com/repos/${config.repo}/issues?labels=daily-diary&state=all&per_page=20`,
    { headers: restApiHeaders() }
  );
  if (!res.ok) return { number: 0, simulated: true };
  const issues = await res.json();
  const existing = issues.find((i) => i.title.includes(today));
  if (existing) return { number: existing.number };

  const createRes = await fetch(`https://api.github.com/repos/${config.repo}/issues`, {
    method: 'POST',
    headers: restApiHeaders(),
    body: JSON.stringify({
      title: `📊 Diario — ${today}`,
      body: `_Diario auto-generado por el diarista. El sistema reporta aquí lo que hizo y aprendió hoy._`,
      labels: ['daily-diary', 'auto-generated'],
    }),
  });
  if (!createRes.ok) return { number: 0, simulated: true };
  const issue = await createRes.json();
  return { number: issue.number };
}

function buildDiaristPrompt(day) {
  const tasksSummary = day.tasks.map((t) => `- ${t.id}: ${t.goal} [${t.status}]`).join('\n');
  const errorsSummary = day.errors.map((e) => `- ${e.id}: ${e.title} (${e.status}, conf=${e.confidence})`).join('\n');
  const lessonsSummary = day.lessons.map((l) => `- ${l.id}: ${l.title} → ${l.rule}`).join('\n');
  const decisionsSummary = day.decisions.map((d) => `- ${d.id}: ${d.title}`).join('\n');

  return `Eres EL DIARISTA. Tu trabajo es escribir el resumen diario del sistema en UNA FRASE principal + 3-5 bullets de contexto.

## REGLAS
- La frase principal debe ser skimmable en 5 segundos desde el móvil en 3G.
- Si hubo STUCK o fallo importante, se menciona primero. Lo bueno va después.
- Si el día estuvo tranquilo, dilo. "Día tranquilo" es información útil.
- No inventes. Solo reportas lo que pasó.

## FORMATO DE SALIDA (JSON estricto)
{
  "headline": "una frase, máx 120 chars",
  "bullets": ["...", "...", "..."],
  "highlight": "ok | stuck | warning | quiet",
  "stuck_tasks": ["TASK-XXXX"],
  "new_lessons": ["LESSON-XXXX"],
  "tomorrow_hint": "una frase sobre qué queda pendiente"
}

## CONTEXTO — Hoy (${todayISO()})
Tareas: ${day.tasks.length}
Episodios (intentos): ${day.episodes.length}
Errores registrados: ${day.errors.length}
Decisiones: ${day.decisions.length}
Hechos nuevos: ${day.facts.length}
Lecciones propuestas: ${day.lessons.length}

### TAREAS DE HOY
${tasksSummary || '(ninguna)'}

### ERRORES DE HOY
${errorsSummary || '(ninguno)'}

### DECISIONES DE HOY
${decisionsSummary || '(ninguna)'}

### LECCIONES PROPUESTAS HOY
${lessonsSummary || '(ninguna)'}
`;
}

async function postDiaryComment(issueInfo, diary) {
  const icon = diary.highlight === 'stuck' ? '🚨' : diary.highlight === 'warning' ? '⚠️' : diary.highlight === 'quiet' ? '🌙' : '✅';
  const lines = [`### ${icon} ${diary.headline}`, ''];
  if (diary.bullets?.length) {
    for (const b of diary.bullets) lines.push(`- ${b}`);
  }
  if (diary.stuck_tasks?.length) {
    lines.push('', `**STUCK:** ${diary.stuck_tasks.join(', ')}`);
  }
  if (diary.new_lessons?.length) {
    lines.push('', `**Lecciones nuevas:** ${diary.new_lessons.join(', ')}`);
  }
  if (diary.tomorrow_hint) {
    lines.push('', `**Pendiente para mañana:** ${diary.tomorrow_hint}`);
  }
  const body = lines.join('\n');

  if (issueInfo.number && config.token && config.repo) {
    await fetch(`https://api.github.com/repos/${config.repo}/issues/${issueInfo.number}/comments`, {
      method: 'POST',
      headers: restApiHeaders(),
      body: JSON.stringify({ body }),
    });
  } else {
    console.log(`[diarist simulated] issue=#${issueInfo.number}:\n${body}`);
  }
}

async function main() {
  console.log('[diarist] inicio');
  const day = gatherDay();
  console.log(`[diarist] hoy: ${day.tasks.length} tareas, ${day.episodes.length} episodios, ${day.lessons.length} lecciones`);

  const prompt = buildDiaristPrompt(day);
  const raw = await complete(
    [
      { role: 'system', content: prompt },
      { role: 'user', content: 'Escribe el resumen de hoy.' },
    ],
    { jsonMode: true, temperature: 0.4 }
  );

  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  const diary = JSON.parse(raw.slice(first, last + 1));
  console.log(`[diarist] headline="${diary.headline}" highlight=${diary.highlight}`);

  const issueInfo = await ensureDailyIssue();
  await postDiaryComment(issueInfo, diary);

  console.log('[diarist] fin');
}

main().catch((err) => {
  console.error('[diarist] FATAL:', err.message);
  process.exit(1);
});
