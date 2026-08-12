// tests/json.test.js
// Tests de src/utils/json.js — parseo robusto de JSON devuelto por modelos.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { extractJSON, parseAgentJSON } from '../src/utils/json.js';

describe('extractJSON', () => {
  test('JSON puro', () => {
    const r = extractJSON('{"a":1,"b":"x"}');
    assert.ok(r.ok);
    assert.deepEqual(r.value, { a: 1, b: 'x' });
  });

  test('JSON dentro de fences ```json', () => {
    const r = extractJSON('Texto antes\n```json\n{"a":1}\n```\nTexto después');
    assert.ok(r.ok);
    assert.deepEqual(r.value, { a: 1 });
  });

  test('JSON dentro de fences ```', () => {
    const r = extractJSON('```\n{"a":1}\n```');
    assert.ok(r.ok);
    assert.deepEqual(r.value, { a: 1 });
  });

  test('JSON con texto alrededor', () => {
    const r = extractJSON('Aquí está la respuesta:\n{"route":"NEW","findings":[]}\nEso es todo.');
    assert.ok(r.ok);
    assert.equal(r.value.route, 'NEW');
  });

  test('JSON con trailing comma (limpieza)', () => {
    const r = extractJSON('{"a":1,"b":2,}');
    assert.ok(r.ok);
    assert.deepEqual(r.value, { a: 1, b: 2 });
  });

  test('JSON con escape incorrecto (limpieza)', () => {
    // Algunos modelos escapan el guión: \- en vez de -
    const r = extractJSON('{"path":"src\\-cart.js"}');
    assert.ok(r.ok);
    assert.equal(r.value.path, 'src-cart.js');
  });

  test('Texto vacío devuelve error', () => {
    const r = extractJSON('');
    assert.ok(!r.ok);
    assert.ok(r.error);
  });

  test('Sin JSON devuelve error', () => {
    const r = extractJSON('Esto es solo texto sin JSON');
    assert.ok(!r.ok);
    assert.ok(r.error);
  });

  test('Null input devuelve error', () => {
    const r = extractJSON(null);
    assert.ok(!r.ok);
  });

  test('JSON anidado', () => {
    const r = extractJSON('{"a":{"b":[1,2,3]},"c":true}');
    assert.ok(r.ok);
    assert.deepEqual(r.value, { a: { b: [1, 2, 3] }, c: true });
  });
});

describe('parseAgentJSON', () => {
  test('Devuelve el objeto si el parseo es exitoso', () => {
    const v = parseAgentJSON('```json\n{"route":"REUSE","reused_memory":["BUG-001"]}\n```');
    assert.equal(v.route, 'REUSE');
    assert.deepEqual(v.reused_memory, ['BUG-001']);
  });

  test('Lanza si no hay JSON', () => {
    assert.throws(() => parseAgentJSON('sin json aquí'), /No se pudo parsear/);
  });
});
