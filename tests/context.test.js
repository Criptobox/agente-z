// tests/context.test.js
// Tests de src/context.js — buildContext, serializeContext, loadApplicableLessons.

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../src/config.js';
import { writeMemory } from '../src/memory.js';
import { buildContext, serializeContext, contextSummary } from '../src/context.js';

const TMP_ROOT = join(process.cwd(), 'tests/fixtures/_tmp_context');
const originalRoot = config.root;
const originalDry = config.dryRun;

beforeEach(() => {
  config.root = TMP_ROOT;
  config.dryRun = true; // para que no llame a embeddings reales
  for (const sub of ['errors', 'decisions', 'facts', 'lessons', 'criteria', 'episodes', 'budget', 'diary', 'projects']) {
    mkdirSync(join(TMP_ROOT, 'memory', sub), { recursive: true });
  }
});

afterEach(() => {
  try { rmSync(TMP_ROOT, { recursive: true, force: true }); } catch {}
  config.root = originalRoot;
  config.dryRun = originalDry;
});

describe('buildContext', () => {
  test('devuelve estructura completa aunque no haya memoria', async () => {
    const task = {
      id: 'TASK-T1',
      goal: 'investigar bug X',
      project: 'tiendamax',
      files_involved: [],
      symbols_involved: [],
      definition_of_done: [{ id: 'G1', check: 'test pasa', method: 'test', command: 'echo ok', expect: 'exit_code == 0' }],
    };
    const ctx = await buildContext(task);
    assert.equal(ctx.task.id, 'TASK-T1');
    assert.equal(ctx.task.gates.length, 1);
    assert.equal(ctx.memory.length, 0);
    assert.equal(ctx.lessons.length, 0);
    assert.equal(ctx.criteria.length, 0);
    assert.equal(ctx.previousAttempts.length, 0);
  });

  test('recupera memorias relevantes por archivo', async () => {
    writeMemory('error', 'BUG-T1', {
      id: 'BUG-T1', type: 'error', project: 'tiendamax', title: 'Bug en cart',
      confidence: 80, files: ['js/cart.js'], tags: ['cart'],
    }, 'cuerpo del bug');

    const task = {
      id: 'TASK-T2',
      goal: 'arreglar bug en cart',
      project: 'tiendamax',
      files_involved: ['js/cart.js'],
      definition_of_done: [],
    };
    const ctx = await buildContext(task);
    assert.ok(ctx.memory.length >= 1, 'debería encontrar al menos BUG-T1');
    const found = ctx.memory.find((m) => m.id === 'BUG-T1');
    assert.ok(found, 'BUG-T1 debería estar en el contexto');
    assert.equal(found.type, 'error');
  });

  test('carga criterios activos', async () => {
    writeMemory('criteria', 'CRIT-T1', {
      id: 'CRIT-T1', type: 'criteria', title: 'test criterion',
      criterion: 'preferir archivos completos', scope: 'general', status: 'active',
    }, 'x');
    const ctx = await buildContext({ id: 'TASK-T3', goal: 'test', definition_of_done: [] });
    assert.equal(ctx.criteria.length, 1);
    assert.equal(ctx.criteria[0].criterion, 'preferir archivos completos');
  });
});

describe('serializeContext', () => {
  test('incluye sección TAREA ACTUAL', () => {
    const ctx = {
      task: { id: 'TASK-S1', goal: 'test goal', attempt: 1, gates: [], files_involved: [] },
      memory: [], lessons: [], criteria: [], previousAttempts: [],
      stats: { totalMemories: 0, lessonsActive: 0, criteriaActive: 0, previousAttempts: 0 },
    };
    const text = serializeContext(ctx);
    assert.ok(text.includes('## TAREA ACTUAL'));
    assert.ok(text.includes('TASK-S1'));
    assert.ok(text.includes('test goal'));
  });

  test('incluye gates cuando los hay', () => {
    const ctx = {
      task: {
        id: 'TASK-S2', goal: 'g', attempt: 1,
        gates: [{ id: 'G1', check: 'no NaN', method: 'test', command: 'echo', expect: 'exit_code == 0' }],
        files_involved: [],
      },
      memory: [], lessons: [], criteria: [], previousAttempts: [],
      stats: { totalMemories: 0, lessonsActive: 0, criteriaActive: 0, previousAttempts: 0 },
    };
    const text = serializeContext(ctx);
    assert.ok(text.includes('## DEFINITION OF DONE'));
    assert.ok(text.includes('G1'));
    assert.ok(text.includes('no NaN'));
  });
});

describe('contextSummary', () => {
  test('resume correctamente', () => {
    const ctx = {
      task: { id: 'TASK-S3', attempt: 2, gates: [{}, {}] },
      memory: [{}, {}],
      lessons: [{}],
      criteria: [],
      previousAttempts: [{}],
      stats: {},
    };
    const s = contextSummary(ctx);
    assert.equal(s.taskId, 'TASK-S3');
    assert.equal(s.attempt, 2);
    assert.equal(s.memoryHits, 2);
    assert.equal(s.lessonsActive, 1);
    assert.equal(s.gates, 2);
  });
});
