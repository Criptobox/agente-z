// src/reindex.js
// Reconstrucción nocturna del índice y los embeddings.
// Lo corre el workflow .github/workflows/reindex.yml (cron diario).
//
// Tareas:
//   1. Recorrer memory/**/*.md y reconstruir memory/index.json.
//   2. Calcular embeddings para memorias nuevas o modificadas.
//   3. Detectar staleness: comparar commit del proyecto externo contra el guardado.
//   4. Archivar lecciones sin uso (times_applied == 0 y > 60 días).
//   5. Reportar métricas al dashboard.

import { readFileSync, writeFileSync, existsSync, renameSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { config, restApiHeaders } from './config.js';
import {
  listMemories,
  buildIndex,
  saveIndex,
  loadVectors,
  saveVectors,
  writeMemory,
} from './memory.js';
import { embed } from './models.js';

// ── Para una memoria, calcula o recicla embedding ──
async function ensureEmbedding(mem, type, vectors) {
  if (vectors[mem.id]) {
    // Ya tiene vector. No recalculamos salvo que el título haya cambiado.
    // Heurística: guardamos el título junto al vector en metadata aparte.
    // Para simplicidad, no recalculamos. El nocturno puede forzar con --force.
    return;
  }
  const text = [mem.title, mem.statement, mem.rule, (mem.tags || []).join(' ')]
    .filter(Boolean)
    .join(' ');
  if (!text) return;
  try {
    const vec = await embed(text);
    vectors[mem.id] = vec;
    console.log(`[reindex] embedding calculado para ${mem.id} (${vec.length} dims)`);
  } catch (err) {
    console.error(`[reindex] embedding falló para ${mem.id}: ${err.message}`);
  }
}

// ── Staleness check ──
// Compara el commit guardado en cada memoria contra el HEAD actual del proyecto externo.
async function checkStaleness() {
  if (!config.token || !config.targetRepos.length) {
    console.log('[reindex] sin token o sin target repos, skip staleness');
    return;
  }
  // Para cada repo externo, obtener HEAD SHA
  const headShas = {};
  for (const repo of config.targetRepos) {
    try {
      const res = await fetch(`https://api.github.com/repos/${repo}/commits/main`, { headers: restApiHeaders() });
      if (res.ok) {
        const data = await res.json();
        headShas[repo] = data.sha;
      } else {
        // intenta con master
        const res2 = await fetch(`https://api.github.com/repos/${repo}/commits/master`, { headers: restApiHeaders() });
        if (res2.ok) {
          const data2 = await res2.json();
          headShas[repo] = data2.sha;
        }
      }
    } catch (err) {
      console.error(`[reindex] no se pudo obtener HEAD de ${repo}: ${err.message}`);
    }
  }

  // Para cada memoria con archivos referenciados, comparar
  const types = ['error', 'decision', 'fact', 'lesson'];
  for (const t of types) {
    for (const mem of listMemories(t)) {
      if (!mem.files?.length || !mem.project) continue;
      const repo = config.targetRepos.find((r) => r.includes(mem.project));
      if (!repo || !headShas[repo]) continue;

      // Si la memoria tiene commit y difiere de HEAD, marcamos stale
      // (no podemos saber si el archivo específico cambió sin más llamadas API;
      // esta es una aproximación conservadora — marcamos stale si el repo avanzó.)
      if (mem.commit && mem.commit !== headShas[repo]) {
        // Verificamos si algún archivo referenciado cambió desde mem.commit
        let anyChanged = false;
        for (const file of mem.files) {
          try {
            const url = `https://api.github.com/repos/${repo}/commits?path=${file}&sha=${headShas[repo]}&per_page=1`;
            const res = await fetch(url, { headers: restApiHeaders() });
            if (res.ok) {
              const commits = await res.json();
              if (commits[0] && commits[0].sha !== mem.commit) {
                anyChanged = true;
                break;
              }
            }
          } catch {}
        }
        if (anyChanged && !mem.stale) {
          console.log(`[reindex] marcando ${mem.id} como stale (archivos cambiaron en ${repo})`);
          // Reescribir con stale: true y confidence reducida
          const newConfidence = Math.max(30, Math.floor((mem.confidence || 80) * 0.6));
          const updated = {
            ...mem,
            stale: true,
            confidence: newConfidence,
            updated: new Date().toISOString().slice(0, 10),
          };
          writeMemory(t, mem.id, updated, mem.body || '');
        }
      }
    }
  }
}

// ── Archiva lecciones sin uso ──
function archiveColdLessons() {
  const now = Date.now();
  const cutoff = now - config.lessonArchiveDays * 24 * 60 * 60 * 1000;
  const archivedDir = resolve(config.root, config.paths.memory, 'lessons', 'archived');
  mkdirSync(archivedDir, { recursive: true });

  for (const lesson of listMemories('lesson')) {
    if (lesson.promoted_to_rule) continue; // no archivar promovidas
    if ((lesson.times_applied || 0) > 0) continue; // se usa
    const created = lesson.created ? new Date(lesson.created).getTime() : now;
    if (created > cutoff) continue; // muy joven
    // Archivar
    const src = resolve(config.root, config.paths.memory, 'lessons', `${lesson.id}.md`);
    const dst = join(archivedDir, `${lesson.id}.md`);
    try {
      renameSync(src, dst);
      console.log(`[reindex] archivada lección fría: ${lesson.id}`);
    } catch (err) {
      console.error(`[reindex] no se pudo archivar ${lesson.id}: ${err.message}`);
    }
  }
}

// ── Reporta métricas ──
function reportMetrics() {
  const index = buildIndex();
  const stats = {
    total: Object.keys(index).length,
    byType: {},
    stale: 0,
    lowConf: 0,
    promotedRules: 0,
    generatedAt: new Date().toISOString(),
  };
  for (const m of Object.values(index)) {
    stats.byType[m.type] = (stats.byType[m.type] || 0) + 1;
    if (m.stale) stats.stale++;
    if (typeof m.confidence === 'number' && m.confidence < 60) stats.lowConf++;
    if (m.promoted_to_rule) stats.promotedRules++;
  }
  writeFileSync(
    resolve(config.root, config.paths.memory, 'stats.json'),
    JSON.stringify(stats, null, 2) + '\n',
    'utf8'
  );
  console.log('[reindex] stats:', JSON.stringify(stats));
  return stats;
}

// ── Main ──
async function main() {
  const force = process.argv.includes('--force');
  console.log(`[reindex] inicio force=${force}`);

  // 1. Staleness
  await checkStaleness();

  // 2. Archivar lecciones frías
  archiveColdLessons();

  // 3. Reconstruir índice
  const index = buildIndex();
  saveIndex(index);
  console.log(`[reindex] índice reconstruido: ${Object.keys(index).length} entradas`);

  // 4. Embeddings
  const vectors = loadVectors();
  const types = ['error', 'decision', 'fact', 'lesson', 'criteria', 'episode'];
  for (const t of types) {
    for (const mem of listMemories(t)) {
      if (force || !vectors[mem.id]) {
        await ensureEmbedding(mem, t, vectors);
      }
    }
  }
  saveVectors(vectors);
  console.log(`[reindex] vectores: ${Object.keys(vectors).length}`);

  // 5. Métricas
  reportMetrics();

  console.log('[reindex] fin');
}

main().catch((err) => {
  console.error('[reindex] FATAL:', err.message);
  process.exit(1);
});
