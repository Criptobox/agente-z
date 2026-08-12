// tests/tools_registry.test.js
// Tests de src/tools/index.js — registro central de tools.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { TOOLS, getTool, listTools, runTool } from '../src/tools/index.js';

describe('tools registry', () => {
  test('todas las tools esperadas están registradas', () => {
    const expected = [
      'file_read',
      'file_write',
      'github_api',
      'search_memory',
      'gate_check',
      'issue_comment',
      'read_project_file',
      'list_repo_files',
      'compare_inventories',
      // Nuevas tools v0.2
      'web_search',
      'web_fetch',
      'huggingface_search',
      'ollama_generate',
    ];
    for (const name of expected) {
      assert.ok(TOOLS[name], `Falta tool: ${name}`);
      assert.ok(TOOLS[name].name, `${name} no tiene .name`);
      assert.ok(TOOLS[name].description, `${name} no tiene .description`);
      assert.ok(TOOLS[name].inputSchema, `${name} no tiene .inputSchema`);
      assert.ok(Array.isArray(TOOLS[name].permissions), `${name} no tiene .permissions array`);
      assert.equal(typeof TOOLS[name].run, 'function', `${name} no tiene .run()`);
    }
  });

  test('getTool devuelve la tool correcta', () => {
    const t = getTool('web_search');
    assert.ok(t);
    assert.equal(t.name, 'web_search');
  });

  test('getTool devuelve null para tool inexistente', () => {
    assert.equal(getTool('non_existent_tool'), null);
  });

  test('listTools devuelve metadatos sin .run', () => {
    const list = listTools();
    assert.ok(Array.isArray(list));
    assert.ok(list.length >= 13); // 9 originales + 4 nuevas
    for (const t of list) {
      assert.ok(t.name);
      assert.ok(t.description);
      assert.ok(t.inputSchema);
      assert.ok(Array.isArray(t.permissions));
      assert.equal(typeof t.run, 'undefined'); // no expone run
    }
  });

  test('web_search tiene permiso web', () => {
    assert.ok(TOOLS.web_search.permissions.includes('web'));
  });

  test('web_fetch tiene permiso web', () => {
    assert.ok(TOOLS.web_fetch.permissions.includes('web'));
  });

  test('huggingface_search tiene permiso web', () => {
    assert.ok(TOOLS.huggingface_search.permissions.includes('web'));
  });

  test('ollama_generate tiene permisos web e inference:local', () => {
    assert.ok(TOOLS.ollama_generate.permissions.includes('web'));
    assert.ok(TOOLS.ollama_generate.permissions.includes('inference:local'));
  });
});

describe('runTool - permisos', () => {
  test('rechaza tool inexistente', async () => {
    const r = await runTool('non_existent', {}, {}, ['read']);
    assert.ok(!r.ok);
    assert.match(r.error, /Tool desconocida/);
  });

  test('rechaza si faltan permisos', async () => {
    // web_search requiere 'web'
    const r = await runTool('web_search', { query: 'test' }, {}, ['read']);
    assert.ok(!r.ok);
    assert.match(r.error, /Permisos insuficientes/);
  });

  test('ejecuta si tiene todos los permisos', async () => {
    // file_read requiere 'read'
    const r = await runTool('file_read', { path: 'package.json' }, {}, ['read']);
    assert.ok(r.ok);
    assert.ok(r.result.content);
  });
});
