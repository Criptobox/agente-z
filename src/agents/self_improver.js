// src/agents/self_improver.js
// EL AUTO-MEJORADOR — propone cambios a sus propias instrucciones vía PR.
//
// Filosofía (de la nota del usuario):
//   "Un agente que lee su propio historial y abre un PR:
//    'llevo 6 tareas fallando el mismo gate; propongo cambiar esta regla de mi prompt.'
//    Auto-mejora real, con tu aprobación en el PR. Eso es la sección 39 cumplida de verdad."
//
// Funciones:
//   1. Lee lecciones promovibles (times_prevented_failure >= 3).
//   2. Lee gates que fallan recurrentemente (de episodes).
//   3. Lee criterios del usuario sin aplicar (violated_count > 0).
//   4. Genera un patch concreto a un archivo agents/*.md.
//   5. Crea branch + commit + PR (GitHub API).
//
// NUNCA hace push directo a main. Siempre PR. Tú apruebas o no.

import { readFileSync, existsSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { config, restApiHeaders } from '../config.js';
import { complete } from '../models.js';
import { listMemories, writeMemory, readMemory } from '../memory.js';
import { parseAgentJSON } from '../utils/json.js';

// ── Carga lecciones listas para promover ──
function loadPromotableLessons() {
  return listMemories('lesson').filter(
    (l) => !l.promoted_to_rule && (l.times_prevented_failure || 0) >= config.lessonPromoteThreshold
  );
}

// ── Carga gates que fallan recurrentemente ──
function loadRecurrentGateFailures() {
  const episodes = listMemories('episode');
  const counts = {};
  for (const e of episodes) {
    for (const g of e.gates_failed || []) {
      counts[g] = (counts[g] || 0) + 1;
    }
  }
  // Solo gates que fallaron >=3 veces en cualquier tarea
  return Object.entries(counts)
    .filter(([, n]) => n >= 3)
    .map(([gate, count]) => ({ gate, count }));
}

// ── Carga agentes actuales ──
function loadAgents() {
  const dir = resolve(config.root, config.paths.agents);
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
    .map((f) => {
      const path = join(dir, f);
      const content = readFileSync(path, 'utf8');
      return { name: f.replace('.md', ''), path, content };
    });
}

function buildPrompt(lessons, failures, agents) {
  const lessonsText = lessons
    .map((l) => `- ${l.id}: ${l.title}\n  regla: ${l.rule}\n  antipatrón: ${l.anti_pattern || 'n/a'}\n  scope: ${l.scope}\n  veces que previno fallo: ${l.times_prevented_failure}`)
    .join('\n');

  const failuresText = failures.map((f) => `- Gate ${f.gate} falló ${f.count} veces`).join('\n');

  const agentsText = agents.map((a) => `- agents/${a.name}.md (${a.content.length} chars)`).join('\n');

  return `Eres EL AUTO-MEJORADOR. Lees el historial del sistema y propones cambios concretos a las instrucciones de los agentes (agents/*.md) vía PR.

## REGLAS
1. Cada PR propone UN solo cambio. Si hay varios, propón varios PRs.
2. El cambio debe ser específico: añadir una regla, modificar un permiso, ajustar una heurística.
3. Justifica con datos: "llevo 6 tareas fallando el mismo gate".
4. Máximo ${config.maxRulesPerAgent} reglas por agente. Si llegamos al límite, hay que retirar una para añadir otra.
5. NUNCA propongas eliminar reglas existentes salvo que estén contradichas por datos.
6. Si no hay nada que proponer, devuelve empty: true.

## FORMATO DE SALIDA (JSON estricto)
{
  "empty": false,
  "proposals": [
    {
      "title": "...",
      "rationale": "...",
      "target_file": "agents/code.md",
      "change_kind": "add_rule | modify_permission | adjust_heuristic",
      "patch": {
        "section": "## REGLAS",
        "new_lines": ["- PROHIBIDO arreglar NaN con Number()||0 sin descartar integridad referencial antes."],
        "after_line_containing": "## REGLAS"
      },
      "born_from_lesson": "LESSON-XXX",
      "evidence": "Esta lección previno 4 fallos en tareas TASK-001, TASK-007, TASK-012, TASK-019."
    }
  ]
}

## CONTEXTO
Lecciones promovibles (times_prevented_failure >= ${config.lessonPromoteThreshold}):
${lessonsText || '(ninguna)'}

Gates que fallan recurrentemente (>=3 veces):
${failuresText || '(ninguno)'}

Agentes disponibles:
${agentsText}
`;
}

// ── Crea branch + commit + PR vía GitHub API ──
async function createPullRequest(proposal) {
  if (!config.token || !config.repo) {
    console.log(`[self_improver] (simulado) PR: ${proposal.title}`);
    console.log(`[self_improver] target=${proposal.target_file} section=${proposal.patch.section}`);
    console.log(`[self_improver] new_lines=${proposal.patch.new_lines.join(' | ')}`);
    return { simulated: true };
  }

  const [owner, repo] = config.repo.split('/');
  const branchName = `self-improve/${Date.now()}-${proposal.change_kind}`;

  // 1. Obtener SHA del ref por defecto
  const refRes = await fetch(`https://api.github.com/repos/${config.repo}/git/refs/heads/main`, { headers: restApiHeaders() });
  if (!refRes.ok) throw new Error(`refs/heads/main ${refRes.status}`);
  const refData = await refRes.json();
  const mainSha = refData.object.sha;

  // 2. Crear branch
  const branchRes = await fetch(`https://api.github.com/repos/${config.repo}/git/refs`, {
    method: 'POST',
    headers: restApiHeaders(),
    body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: mainSha }),
  });
  if (!branchRes.ok) throw new Error(`create branch ${branchRes.status}: ${await branchRes.text()}`);

  // 3. Obtener archivo actual
  const fileRes = await fetch(
    `https://api.github.com/repos/${config.repo}/contents/${proposal.target_file}?ref=${branchName}`,
    { headers: restApiHeaders() }
  );
  if (!fileRes.ok) throw new Error(`get file ${fileRes.status}`);
  const fileData = await fileRes.json();
  const content = Buffer.from(fileData.content, 'base64').toString('utf8');

  // 4. Aplicar patch (simple: insertar after_line_containing)
  const lines = content.split('\n');
  const anchorIdx = lines.findIndex((l) => l.includes(proposal.patch.after_line_containing));
  if (anchorIdx === -1) throw new Error(`Anchor no encontrado: "${proposal.patch.after_line_containing}"`);
  const newLines = [...lines.slice(0, anchorIdx + 1), ...proposal.patch.new_lines, ...lines.slice(anchorIdx + 1)];
  const newContent = newLines.join('\n');

  // 5. Commit del archivo
  const commitRes = await fetch(`https://api.github.com/repos/${config.repo}/contents/${proposal.target_file}`, {
    method: 'PUT',
    headers: restApiHeaders(),
    body: JSON.stringify({
      message: `self-improve: ${proposal.title}\n\nRationale: ${proposal.rationale}\nEvidence: ${proposal.evidence}\nBorn from: ${proposal.born_from_lesson}`,
      content: Buffer.from(newContent).toString('base64'),
      branch: branchName,
      sha: fileData.sha,
    }),
  });
  if (!commitRes.ok) throw new Error(`commit ${commitRes.status}: ${await commitRes.text()}`);

  // 6. Crear PR
  const prRes = await fetch(`https://api.github.com/repos/${config.repo}/pulls`, {
    method: 'POST',
    headers: restApiHeaders(),
    body: JSON.stringify({
      title: `🤖 self-improve: ${proposal.title}`,
      head: branchName,
      base: 'main',
      body: `## Propuesta de auto-mejora

**Origen:** ${proposal.born_from_lesson}
**Archivo:** \`${proposal.target_file}\`
**Tipo:** ${proposal.change_kind}

## Razón
${proposal.rationale}

## Evidencia
${proposal.evidence}

## Cambio concreto
\`\`\`diff
+ ${proposal.patch.new_lines.join('\n+ ')}
\`\`\`

Se inserta tras la línea que contiene: \`${proposal.patch.after_line_containing}\`

---
_Auto-generado por src/agents/self_improver.js. Revisa con cuidado antes de mergear._`,
      labels: ['self-improvement', 'auto-generated'],
    }),
  });
  if (!prRes.ok) throw new Error(`PR ${prRes.status}: ${await prRes.text()}`);
  const pr = await prRes.json();
  return { pr_url: pr.html_url, pr_number: pr.number };
}

async function main() {
  console.log('[self_improver] inicio');

  const lessons = loadPromotableLessons();
  const failures = loadRecurrentGateFailures();
  const agents = loadAgents();

  console.log(`[self_improver] lecciones promovibles=${lessons.length}, gates recurrentes=${failures.length}`);

  if (lessons.length === 0 && failures.length === 0) {
    console.log('[self_improver] nada que proponer hoy. Fin.');
    return;
  }

  const prompt = buildPrompt(lessons, failures, agents);
  const raw = await complete(
    [
      { role: 'system', content: prompt },
      { role: 'user', content: '¿Hay algún PR de auto-mejora que abrir?' },
    ],
    { jsonMode: true, temperature: 0.3 }
  );

  const result = parseAgentJSON(raw);

  if (result.empty || !result.proposals?.length) {
    console.log('[self_improver] no hay propuestas. Fin.');
    return;
  }

  console.log(`[self_improver] ${result.proposals.length} propuesta(s)`);

  for (const proposal of result.proposals) {
    try {
      const prInfo = await createPullRequest(proposal);
      console.log(`[self_improver] PR creado:`, prInfo);

      // Marcar la lección subyacente como promoted para evitar duplicar PR la próxima semana
      if (proposal.born_from_lesson) {
        const lesson = readMemory('lesson', proposal.born_from_lesson);
        if (lesson) {
          await writeMemory('lesson', proposal.born_from_lesson, {
            ...lesson,
            promoted_to_rule: true,
            promoted_in_pr: prInfo.pr_url || prInfo.html_url || '',
            promoted_at: new Date().toISOString(),
          }, lesson.body || '');
          console.log(`[self_improver] lección ${proposal.born_from_lesson} marcada como promoted_to_rule`);
        } else {
          console.warn(`[self_improver] no se encontró la lección ${proposal.born_from_lesson} para marcar como promoted`);
        }
      }
    } catch (err) {
      console.error(`[self_improver] PR falló para "${proposal.title}":`, err.message);
    }
  }

  console.log('[self_improver] fin');
}

main().catch((err) => {
  console.error('[self_improver] FATAL:', err.message);
  process.exit(1);
});
