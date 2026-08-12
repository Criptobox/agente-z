// tests/smoke.js
// Smoke test end-to-end del runner en modo --dry-run.
// No llama a la API real — usa respuestas mockeadas.
// Ejecutar: npm run smoke (con DRY_RUN=1) o npm run smoke:dry

import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
import { config } from '../src/config.js';

console.log('=== SMOKE TEST ===');
console.log(`root: ${config.root}`);
console.log(`dryRun: ${config.dryRun}`);

const dryRun = process.argv.includes('--dry-run') || config.dryRun || true; // siempre dry run en smoke
const env = { ...process.env, DRY_RUN: '1' };

// 1. Ejecutar runner contra TASK-0001
console.log('\n[1/3] Ejecutando runner.js --agent=code --task=TASK-0001 --dry-run...');
const result = spawnSync('node', ['src/runner.js', '--agent=code', '--task=TASK-0001', '--dry-run'], {
  cwd: config.root,
  env,
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

// 2. Verificar que se crearon archivos de memoria
console.log('\n[2/3] Verificando que se crearon episodios y budget...');

const episodesDir = join(config.root, 'memory', 'episodes');
const budgetDir = join(config.root, 'memory', 'budget');
const tasksFile = join(config.root, 'tasks', 'TASK-0001.json');

let episodeCreated = false;
let budgetCreated = false;

try {
  const { readdirSync } = await import('node:fs');
  const eps = readdirSync(episodesDir).filter((f) => f.endsWith('.md'));
  episodeCreated = eps.length > 0;
  console.log(`episodios creados: ${eps.length}`);
} catch (err) {
  console.error('no se pudo leer episodes/:', err.message);
}

try {
  const { readdirSync } = await import('node:fs');
  const bs = readdirSync(budgetDir).filter((f) => f.endsWith('.md'));
  budgetCreated = bs.length > 0;
  console.log(`budget snapshots: ${bs.length}`);
} catch (err) {
  console.error('no se pudo leer budget/:', err.message);
}

// 3. Verificar que la tarea se actualizó
console.log('\n[3/3] Verificando actualización de TASK-0001...');
if (!existsSync(tasksFile)) {
  console.error('FAIL: tasks/TASK-0001.json no existe');
  process.exit(1);
}
const task = JSON.parse(readFileSync(tasksFile, 'utf8'));
console.log(`task.status: ${task.status}`);
console.log(`task.last_episode: ${task.last_episode}`);
console.log(`task.handoffs.length: ${task.handoffs?.length || 0}`);

assert.ok(episodeCreated, 'debería haberse creado al menos un episodio');
assert.ok(task.last_episode, 'la tarea debería tener last_episode');

console.log('\n=== SMOKE TEST OK ===');
console.log('El loop mínimo funciona end-to-end en modo DRY_RUN.');
console.log('Para test real: configura .env con GITHUB_TOKEN y TARGET_REPOS, quita --dry-run.');
