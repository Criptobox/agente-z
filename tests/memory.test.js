// tests/memory.test.js
// Tests unitarios de src/memory.js
// Ejecutar: npm test

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { parseFrontmatter, stringifyFrontmatter, writeMemory, readMemory, listMemories, buildIndex, cosine, nextId } from '../src/memory.js';

const TMP_ROOT = resolve(process.cwd(), 'tests/fixtures/_tmp_memory');

// Override config.root para que los tests no toquen el repo real
import { config } from '../src/config.js';
const originalRoot = config.root;
beforeEach(() => {
  config.root = TMP_ROOT;
  mkdirSync(join(TMP_ROOT, 'memory', 'errors'), { recursive: true });
  mkdirSync(join(TMP_ROOT, 'memory', 'decisions'), { recursive: true });
  mkdirSync(join(TMP_ROOT, 'memory', 'facts'), { recursive: true });
  mkdirSync(join(TMP_ROOT, 'memory', 'lessons'), { recursive: true });
  mkdirSync(join(TMP_ROOT, 'memory', 'criteria'), { recursive: true });
  mkdirSync(join(TMP_ROOT, 'memory', 'episodes'), { recursive: true });
  mkdirSync(join(TMP_ROOT, 'memory', 'budget'), { recursive: true });
  mkdirSync(join(TMP_ROOT, 'memory', 'diary'), { recursive: true });
  mkdirSync(join(TMP_ROOT, 'memory', 'projects'), { recursive: true });
});

afterEach(() => {
  try {
    rmSync(TMP_ROOT, { recursive: true, force: true });
  } catch {}
  config.root = originalRoot;
});

describe('parseFrontmatter', () => {
  test('parsea YAML simple con string, number, boolean, null, array', () => {
    const raw = `---
id: BUG-001
type: error
title: Bug de prueba
confidence: 95
verified: true
files: [js/cart.js, js/checkout.js]
stale: false
supersedes: null
---

## Problema
Algo pasó.`;
    const { data, body } = parseFrontmatter(raw);
    assert.equal(data.id, 'BUG-001');
    assert.equal(data.type, 'error');
    assert.equal(data.title, 'Bug de prueba');
    assert.equal(data.confidence, 95);
    assert.equal(data.verified, true);
    assert.deepEqual(data.files, ['js/cart.js', 'js/checkout.js']);
    assert.equal(data.stale, false);
    assert.equal(data.supersedes, null);
    assert.ok(body.startsWith('## Problema'));
  });

  test('sin frontmatter devuelve body completo', () => {
    const { data, body } = parseFrontmatter('solo texto');
    assert.deepEqual(data, {});
    assert.equal(body, 'solo texto');
  });

  test('frontmatter sin cerrar devuelve body vacío', () => {
    const { data, body } = parseFrontmatter('---\nid: BUG-X\n');
    assert.deepEqual(data, {});
  });
});

describe('stringifyFrontmatter', () => {
  test('serializa y re-parsea correctamente', () => {
    const data = {
      id: 'BUG-002',
      type: 'error',
      title: 'Test',
      confidence: 80,
      tags: ['a', 'b'],
      stale: false,
      supersedes: null,
    };
    const content = stringifyFrontmatter(data, 'cuerpo');
    const parsed = parseFrontmatter(content);
    assert.equal(parsed.data.id, 'BUG-002');
    assert.equal(parsed.data.confidence, 80);
    assert.deepEqual(parsed.data.tags, ['a', 'b']);
    assert.equal(parsed.data.stale, false);
  });
});

describe('writeMemory / readMemory', () => {
  test('escribe y lee', () => {
    const { written } = writeMemory('error', 'BUG-100', {
      id: 'BUG-100',
      type: 'error',
      title: 'Test write',
      confidence: 50,
    }, 'cuerpo del bug');
    assert.equal(written, true);

    const mem = readMemory('error', 'BUG-100');
    assert.ok(mem);
    assert.equal(mem.title, 'Test write');
    assert.equal(mem.confidence, 50);
    assert.ok(mem.body.includes('cuerpo del bug'));
  });

  test('no reescribe si el contenido es idéntico', () => {
    writeMemory('error', 'BUG-101', { id: 'BUG-101', type: 'error', title: 'Idem', confidence: 50 }, 'x');
    const { written } = writeMemory('error', 'BUG-101', { id: 'BUG-101', type: 'error', title: 'Idem', confidence: 50 }, 'x');
    assert.equal(written, false);
  });

  test('reescribe si cambia el contenido', () => {
    writeMemory('error', 'BUG-102', { id: 'BUG-102', type: 'error', title: 'v1', confidence: 50 }, 'x');
    const { written } = writeMemory('error', 'BUG-102', { id: 'BUG-102', type: 'error', title: 'v2', confidence: 60 }, 'x');
    assert.equal(written, true);
  });
});

describe('listMemories', () => {
  test('lista memorias de un tipo', () => {
    writeMemory('error', 'BUG-200', { id: 'BUG-200', type: 'error', title: 'A', confidence: 50 }, 'a');
    writeMemory('error', 'BUG-201', { id: 'BUG-201', type: 'error', title: 'B', confidence: 60 }, 'b');
    const list = listMemories('error');
    assert.equal(list.length, 2);
    assert.ok(list.some((m) => m.id === 'BUG-200'));
    assert.ok(list.some((m) => m.id === 'BUG-201'));
  });
});

describe('buildIndex', () => {
  test('construye índice con metadata compacta', () => {
    writeMemory('error', 'BUG-300', {
      id: 'BUG-300',
      type: 'error',
      project: 'tiendamax',
      title: 'Bug index',
      confidence: 90,
      tags: ['cart'],
      files: ['js/cart.js'],
      symbols: ['calculateTotal'],
      stale: false,
    }, 'cuerpo');
    const index = buildIndex();
    assert.ok(index['BUG-300']);
    assert.equal(index['BUG-300'].type, 'error');
    assert.equal(index['BUG-300'].project, 'tiendamax');
    assert.equal(index['BUG-300'].confidence, 90);
    assert.deepEqual(index['BUG-300'].tags, ['cart']);
    assert.deepEqual(index['BUG-300'].files, ['js/cart.js']);
  });
});

describe('cosine', () => {
  test('vectores idénticos → 1', () => {
    assert.equal(cosine([1, 2, 3], [1, 2, 3]), 1);
  });

  test('vectores ortogonales → 0', () => {
    assert.equal(cosine([1, 0], [0, 1]), 0);
  });

  test('vectores opuestos → -1', () => {
    assert.ok(Math.abs(cosine([1, 1], [-1, -1]) + 1) < 0.0001);
  });

  test('vectores vacíos → 0', () => {
    assert.equal(cosine([], []), 0);
  });

  test('dimensiones distintas → 0', () => {
    assert.equal(cosine([1, 2, 3], [1, 2]), 0);
  });
});

describe('nextId', () => {
  test('devuelve BUG-0001 si no hay memorias', () => {
    const id = nextId('error');
    assert.equal(id, 'BUG-0001');
  });

  test('incrementa correctamente', () => {
    writeMemory('error', 'BUG-0005', { id: 'BUG-0005', type: 'error', title: 'x' }, '');
    const id = nextId('error');
    assert.equal(id, 'BUG-0006');
  });
});
