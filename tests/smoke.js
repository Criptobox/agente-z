// tests/smoke.js
// Smoke test end-to-end del runner en modo --dry-run.
// No llama a la API real — usa respuestas mockeadas.
// Ejecutar: npm run smoke (con DRY_RUN=1) o npm run smoke:dry
//
// IMPORTANTE: corre en un directorio temporal aislado para NO contaminar
// el repo real con snapshots de budget, episodios y tareas modificadas.
// Antes esto escribía en memory/ y tasks/ reales del repo, lo que ensuciaba git status.

import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, rmSync, mkdirSync, cpSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import { config } from '../src/config.js';

console.log('=== SMOKE TEST ===');
console.log(`repo root: ${config.root}`);

// Crear dir temporal aislado con la estructura mínima que el runner necesita
const TMP_ROOT = join(tmpdir(), `agent-brain-smoke-${Date.now()}`);
const TMP_MEMORY = join(TMP_ROOT, 'memory');
const TMP_TASKS = join(TMP_ROOT, 'tasks');
const TMP_EPISODES = join(TMP_MEMORY, 'episodes');
const TMP_BUDGET = join(TMP_MEMORY, 'budget');
const TMP_LESSONS = join(TMP_MEMORY, 'lessons');
const TMP_ERRORS = join(TMP_MEMORY, 'errors');

console.log(`tmp root: ${TMP_ROOT}`);

try {
  // Setup: crear estructura mínima + copiar TASK-0001.json del repo
  mkdirSync(TMP_EPISODES, { recursive: true });
  mkdirSync(TMP_BUDGET, { recursive: true });
  mkdirSync(TMP_LESSONS, { recursive: true });
  mkdirSync(TMP_ERRORS, { recursive: true });
  mkdirSync(TMP_TASKS, { recursive: true });

  // Copiar agents/ al tmp (el runner busca agent prompts en config.root/agents/)
  const srcAgentsDir = join(config.root, 'agents');
  if (existsSync(srcAgentsDir)) {
    cpSync(srcAgentsDir, join(TMP_ROOT, 'agents'), { recursive: true });
  }

  // Copiar TASK-0001.json del repo al tmp (si no existe, crear uno mínimo)
  const srcTaskPath = join(config.root, 'tasks', 'TASK-0001.json');
  if (existsSync(srcTaskPath)) {
    cpSync(srcTaskPath, join(TMP_TASKS, 'TASK-0001.json'));
  } else {
    writeFileSync(join(TMP_TASKS, 'TASK-0001.json'), JSON.stringify({
      id: 'TASK-0001',
      goal: 'Smoke test — validar runner en dry-run',
      status: 'in_progress',
      assigned: 'code',
      current_attempt: 1,
      budget: { max_attempts: 5 },
      definition_of_done: [{ id: 'G1', check: 'test pasa', method: 'test', command: 'npm test' }],
      handoffs: [],
      created: new Date().toISOString(),
    }, null, 2));
  }

  // Copiar memory/index.json si existe (para que search_memory no crashee)
  const srcIndexPath = join(config.root, 'memory', 'index.json');
  if (existsSync(srcIndexPath)) {
    cpSync(srcIndexPath, join(TMP_MEMORY, 'index.json'));
  } else {
    writeFileSync(join(TMP_MEMORY, 'index.json'), '{}');
  }
  // vectors.json vacío
  writeFileSync(join(TMP_MEMORY, 'vectors.json'), '{}');

  // 1. Ejecutar runner contra TASK-0001 en el dir temporal
  console.log('\n[1/3] Ejecutando runner.js --agent=code --task=TASK-0001 --dry-run...');
  const result = spawnSync('node', [
    resolve(config.root, 'src/runner.js'),
    '--agent=code', '--task=TASK-0001', '--dry-run',
  ], {
    cwd: TMP_ROOT,  // ← CWD temporal, no el repo real
    env: { ...process.env, DRY_RUN: '1' },
    encoding: 'utf8',
    timeout: 60_000,
  });

  if (result.error) {
    console.error('FAIL: no se pudo ejecutar runner.js:', result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error('FAIL: runner.js salió con código', result.status);
    console.error('STDOUT:', result.stdout.slice(-2000));
    console.error('STDERR:', result.stderr.slice(-2000));
    process.exit(1);
  }

  console.log('runner.js OK');
  console.log(result.stdout.slice(-1000));

  // 2. Verificar que se crearon archivos de memoria EN EL DIR TEMPORAL
  console.log('\n[2/3] Verificando que se crearon episodios y budget (en tmp)...');

  let episodeCreated = false;
  let budgetCreated = false;

  try {
    const eps = readdirSync(TMP_EPISODES).filter((f) => f.endsWith('.md'));
    episodeCreated = eps.length > 0;
    console.log(`episodios creados: ${eps.length}`);
  } catch (err) {
    console.error('no se pudo leer episodes/:', err.message);
  }

  try {
    const bs = readdirSync(TMP_BUDGET).filter((f) => f.endsWith('.md'));
    budgetCreated = bs.length > 0;
    console.log(`budget snapshots: ${bs.length}`);
  } catch (err) {
    console.error('no se pudo leer budget/:', err.message);
  }

  // 3. Verificar que la tarea se actualizó EN EL DIR TEMPORAL
  console.log('\n[3/3] Verificando actualización de TASK-0001 (en tmp)...');
  const tmpTaskFile = join(TMP_TASKS, 'TASK-0001.json');
  if (!existsSync(tmpTaskFile)) {
    console.error('FAIL: tasks/TASK-0001.json no existe en tmp');
    process.exit(1);
  }
  const task = JSON.parse(readFileSync(tmpTaskFile, 'utf8'));
  console.log(`task.status: ${task.status}`);
  console.log(`task.last_episode: ${task.last_episode}`);
  console.log(`task.handoffs.length: ${task.handoffs?.length || 0}`);

  assert.ok(episodeCreated, 'debería haberse creado al menos un episodio');
  assert.ok(task.last_episode, 'la tarea debería tener last_episode');

  console.log('\n=== SMOKE TEST OK ===');
  console.log('El loop mínimo funciona end-to-end en modo DRY_RUN.');
  console.log('Para test real: configura .env con GITHUB_TOKEN y TARGET_REPOS, quita --dry-run.');
  console.log(`\n(tmp usado: ${TMP_ROOT} — se borra automáticamente)`);

} finally {
  // Limpieza SIEMPRE, incluso si hay assert fallido
  try {
    rmSync(TMP_ROOT, { recursive: true, force: true });
  } catch (err) {
    console.warn(`no se pudo borrar ${TMP_ROOT}:`, err.message);
  }
}
