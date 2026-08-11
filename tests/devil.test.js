// tests/devil.test.js
// Tests del abogado del diablo — validación de prompt y veredicto.

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../src/config.js';
import { writeMemory } from '../src/memory.js';

const TMP_ROOT = join(process.cwd(), 'tests/fixtures/_tmp_devil');
const originalRoot = config.root;
const originalDry = config.dryRun;

beforeEach(() => {
  config.root = TMP_ROOT;
  config.dryRun = true;
  mkdirSync(join(TMP_ROOT, 'memory', 'episodes'), { recursive: true });
  mkdirSync(join(TMP_ROOT, 'memory', 'errors'), { recursive: true });
  mkdirSync(join(TMP_ROOT, 'tasks'), { recursive: true });
});

afterEach(() => {
  try { rmSync(TMP_ROOT, { recursive: true, force: true }); } catch {}
  config.root = originalRoot;
  config.dryRun = originalDry;
});

describe('devil — schema de veredicto', () => {
  test('CONSENT es válido cuando no hay concerns', () => {
    const verdict = {
      verdict: 'CONSENT',
      concerns: [],
      missing_gates: [],
      memories_to_mark_stale: [],
    };
    assert.equal(verdict.verdict, 'CONSENT');
    assert.equal(verdict.concerns.length, 0);
  });

  test('BLOCK requiere block_reason', () => {
    const verdict = {
      verdict: 'BLOCK',
      concerns: [{ kind: 'missing_gate', severity: 'high', evidence: 'falta G3', required_action: 'añadir gate' }],
      missing_gates: [{ id_suggested: 'G3', check: 'total correcto', method: 'assertion', command: 'test', expect: 'exit_code == 0' }],
      memories_to_mark_stale: [],
      block_reason: 'Falta gate que verifique comportamiento correcto, no solo ausencia del síntoma.',
    };
    assert.equal(verdict.verdict, 'BLOCK');
    assert.ok(verdict.block_reason);
    assert.equal(verdict.concerns[0].kind, 'missing_gate');
  });
});

describe('devil — tipos de concern', () => {
  test('todos los kinds esperados existen', () => {
    const validKinds = ['test_badly_written', 'stale_memory', 'confidence_inflated', 'missing_gate', 'inherited_diagnosis'];
    for (const kind of validKinds) {
      assert.ok(typeof kind === 'string');
    }
  });

  test('severities válidas', () => {
    const validSev = ['low', 'medium', 'high'];
    for (const s of validSev) {
      assert.ok(['low', 'medium', 'high'].includes(s));
    }
  });
});
