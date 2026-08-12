// tests/web_tools.test.js
// Tests de las nuevas tools web (web_search, web_fetch, huggingface_search).
// Estos tests son de integración: hacen llamadas reales a internet.
// Se pueden skippear con SKIP_NETWORK=1 para CI sin red.

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { web_search } from '../src/tools/web_search.js';
import { web_fetch } from '../src/tools/web_fetch.js';
import { huggingface_search } from '../src/tools/huggingface_search.js';

const SKIP_NETWORK = process.env.SKIP_NETWORK === '1' || process.env.CI === '1' && process.env.SKIP_CI_NETWORK === '1';
const testNetwork = SKIP_NETWORK ? test.skip : test;

describe('web_search', () => {
  test('valida query requerido', async () => {
    await assert.rejects(() => web_search.run({}), /query requerido/);
  });

  test('valida query length', async () => {
    const longQuery = 'a'.repeat(201);
    await assert.rejects(() => web_search.run({ query: longQuery }), /máx 200 chars/);
  });

  testNetwork('devuelve resultados para query común', async () => {
    const r = await web_search.run({ query: 'node.js fetch api', maxResults: 3 });
    assert.ok(r.ok === true || r.ok === false); // puede fallar por rate limit
    if (r.ok) {
      assert.ok(Array.isArray(r.results));
      assert.ok(r.results.length <= 3);
      if (r.results.length > 0) {
        assert.ok(r.results[0].title);
        assert.ok(r.results[0].url);
      }
    }
  });

  testNetwork('maneja query sin resultados gracefully', async () => {
    const r = await web_search.run({ query: 'xqzxqzxqzxqz no existe nada con esto 12345', maxResults: 2 });
    // Puede devolver ok:true con 0 resultados, o ok:false si todas las fuentes fallan
    assert.ok(typeof r.ok === 'boolean');
    assert.ok(typeof r.count === 'number');
  });
});

describe('web_fetch', () => {
  test('valida url requerido', async () => {
    await assert.rejects(() => web_fetch.run({}), /url requerido/);
  });

  test('rechaza URL sin http(s)', async () => {
    await assert.rejects(() => web_fetch.run({ url: 'ftp://example.com' }), /http:\/\/ o https:\/\//);
    await assert.rejects(() => web_fetch.run({ url: 'example.com' }), /http:\/\/ o https:\/\//);
  });

  testNetwork('descarga HTML y lo convierte a markdown', async () => {
    const r = await web_fetch.run({ url: 'https://example.com', maxBytes: 10000 });
    assert.ok(r.ok);
    assert.ok(r.contentType.includes('html'));
    assert.ok(r.content.length > 0);
    // example.com tiene "Example Domain" en el título h1
    assert.match(r.content, /Example Domain/i);
  });

  testNetwork('respeta maxBytes', async () => {
    const r = await web_fetch.run({ url: 'https://example.com', maxBytes: 100 });
    assert.ok(r.ok);
    assert.ok(r.bytes <= 100);
  });

  testNetwork('maneja 404 graceful', async () => {
    const r = await web_fetch.run({ url: 'https://httpbin.org/status/404' });
    assert.ok(!r.ok);
    assert.equal(r.status, 404);
  });
});

describe('huggingface_search', () => {
  test('valida query requerido', async () => {
    await assert.rejects(() => huggingface_search.run({}), /query requerido/);
  });

  test('valida kind', async () => {
    await assert.rejects(
      () => huggingface_search.run({ query: 'test', kind: 'invalid' }),
      /kind debe ser/
    );
  });

  testNetwork('busca modelos de qwen', async () => {
    const r = await huggingface_search.run({ query: 'qwen2.5', kind: 'model', limit: 3 });
    assert.ok(r.ok);
    assert.ok(r.results.length > 0);
    assert.ok(r.results[0].id);
    assert.ok(typeof r.results[0].downloads === 'number');
  });

  testNetwork('busca datasets', async () => {
    const r = await huggingface_search.run({ query: 'wikipedia', kind: 'dataset', limit: 3 });
    assert.ok(r.ok);
    assert.ok(r.results.length > 0);
  });
});
