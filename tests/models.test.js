// tests/models.test.js
// Tests de src/models.js — estimateTokens y fallback chain (con DRY_RUN).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { estimateTokens, complete, resetMetrics, getMetrics, embed } from '../src/models.js';
import { config } from '../src/config.js';

describe('estimateTokens', () => {
  test('string vacío → 0', () => {
    assert.equal(estimateTokens(''), 0);
    assert.equal(estimateTokens(null), 0);
  });

  test('estima ~4 chars por token', () => {
    assert.equal(estimateTokens('hola'), 1);
    assert.equal(estimateTokens('hola mundo esto es una prueba'), 8); // 30 chars / 4 = 7.5 → 8
  });
});

describe('complete (DRY_RUN)', () => {
  // Forzamos DRY_RUN para no llamar a la API real
  const originalDry = config.dryRun;
  test.before(() => {
    config.dryRun = true;
    resetMetrics();
  });
  test.after(() => {
    config.dryRun = originalDry;
  });

  test('devuelve JSON mock válido cuando se pide jsonMode', async () => {
    const out = await complete(
      [
        { role: 'system', content: 'test system' },
        { role: 'user', content: 'test user' },
      ],
      { jsonMode: true }
    );
    const parsed = JSON.parse(out);
    assert.equal(parsed.route, 'NEW');
    assert.ok(parsed.findings);
    assert.ok(parsed.handoff);
    assert.equal(parsed._dry_run, true);
  });

  test('devuelve texto simple sin jsonMode', async () => {
    const out = await complete([{ role: 'user', content: 'hola' }]);
    assert.ok(out.startsWith('[DRY_RUN]'));
  });

  test('acumula métricas', async () => {
    resetMetrics();
    await complete([{ role: 'user', content: 'test' }]);
    const m = getMetrics();
    assert.equal(m.calls, 1);
    assert.ok(m.byModel['dry-run']);
  });
});

describe('embed (DRY_RUN)', () => {
  const originalDry = config.dryRun;
  test.before(() => {
    config.dryRun = true;
  });
  test.after(() => {
    config.dryRun = originalDry;
  });

  test('devuelve vector de 16 dims determinista', async () => {
    const v1 = await embed('test');
    const v2 = await embed('test');
    assert.equal(v1.length, 16);
    assert.deepEqual(v1, v2); // determinista
  });

  test('dos textos distintos dan vectores distintos', async () => {
    const v1 = await embed('hola');
    const v2 = await embed('mundo');
    assert.notDeepEqual(v1, v2);
  });
});
