// src/tools/gate_check.js
// Ejecuta un gate de Definition of Done.
// Sección 12.2 del spec: la verificación viene de una herramienta, no de una opinión.

import { execSync } from 'node:child_process';
import { config } from '../config.js';

export const gate_check = {
  name: 'gate_check',
  description:
    'Ejecuta un gate objetivo (test, assertion, diff_scan, security_scan). ' +
    'Devuelve pass/fail con salida exacta. ' +
    'El agente QUE HACE EL TRABAJO no puede declarar éxito — esta tool es la única evidencia válida.',
  inputSchema: {
    gate_id: 'string (ej: G1)',
    method: 'test|assertion|diff_scan|security_scan',
    command: 'string (comando a ejecutar)',
    expect: 'string (criterio de éxito, ej: "exit_code == 0" o "0 failing")',
  },
  permissions: ['execute'],
  async run({ gate_id, method, command, expect }, ctx) {
    if (!command) throw new Error('command requerido');
    if (!gate_id) throw new Error('gate_id requerido');

    let stdout = '';
    let stderr = '';
    let exitCode = 0;
    let timedOut = false;

    try {
      const out = execSync(command, {
        cwd: config.root,
        encoding: 'utf8',
        timeout: 60_000,
        maxBuffer: 1024 * 1024 * 5,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      stdout = out;
    } catch (err) {
      stdout = err.stdout || '';
      stderr = err.stderr || '';
      exitCode = err.status ?? 1;
      if (err.killed) timedOut = true;
    }

    // Evaluación del expect
    let pass = false;
    if (expect === 'exit_code == 0') {
      pass = exitCode === 0;
    } else if (expect && expect.includes('failing')) {
      // "0 failing" → busca "0 failing" en stdout
      const m = stdout.match(/(\d+)\s+failing/i);
      const failing = m ? parseInt(m[1], 10) : -1;
      const targetMatch = expect.match(/(\d+)\s+failing/);
      const target = targetMatch ? parseInt(targetMatch[1], 10) : 0;
      pass = failing === target;
    } else if (method === 'diff_scan') {
      // Heurística: busca patrones prohibidos en el diff
      const forbidden = ['console.error', 'TODO', 'FIXME', 'XXX'];
      const found = forbidden.filter((p) => stdout.includes(p));
      pass = found.length === 0;
      if (!pass) {
        return {
          ok: true,
          gate_id,
          method,
          pass: false,
          reason: `Patrones prohibidos en diff: ${found.join(', ')}`,
          stdout: stdout.slice(0, 2000),
          exitCode,
        };
      }
    } else if (method === 'security_scan') {
      const patterns = [
        /sk-[a-zA-Z0-9]{20,}/, // OpenAI key
        /ghp_[a-zA-Z0-9]{30,}/, // GitHub PAT
        /AKIA[0-9A-Z]{16}/, // AWS
        /-----BEGIN (RSA |EC )?PRIVATE KEY-----/,
      ];
      const found = patterns.filter((p) => p.test(stdout) || p.test(stderr));
      pass = found.length === 0;
      if (!pass) {
        return {
          ok: true,
          gate_id,
          method,
          pass: false,
          reason: 'Posible secreto detectado en el diff',
          exitCode,
        };
      }
    } else if (expect) {
      // Aceptación literal: el expect aparece en stdout
      pass = stdout.includes(expect);
    } else {
      pass = exitCode === 0;
    }

    return {
      ok: true,
      gate_id,
      method,
      pass,
      exitCode,
      timedOut,
      stdout: stdout.slice(0, 2000),
      stderr: stderr.slice(0, 500),
      expect,
    };
  },
};
