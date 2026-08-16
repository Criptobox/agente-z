// src/tools/gate_check.js
// Ejecuta un gate de Definition of Done.
// Sección 12.2 del spec: la verificación viene de una herramienta, no de una opinión.
//
// Métodos:
//   test | assertion  → ejecuta `command` (sanitizado) y evalúa `expect`
//   diff_scan         → escanea `files_to_scan` (o el stdout del command) en busca
//                       de patrones prohibidos (console.error, TODO, FIXME...)
//   security_scan     → escanea `files_to_scan` (o stdout/stderr del command) en
//                       busca de secretos (API keys, tokens, private keys)
//
// Seguridad: NINGÚN comando se ejecuta sin pasar la sanitización:
//   1. patrones prohibidos (rm -rf /, pipes a shells, shutdown, mkfs...)
//   2. whitelist de binarios por segmento de pipe
//   3. sin metacaracteres de shell (;, &&, `, $( )

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { config } from '../config.js';

// ── Sanitización de comandos ──────────────────────────────────────────────

const FORBIDDEN_PATTERNS = [
  { name: 'rm recursivo sobre /', re: /\brm\s+-[a-z]*[rf][a-z]*\s+\/(?:\s|$)/i },
  { name: 'pipe a shell', re: /\|\s*(sudo\s+)?(ba|z|da|k)?sh\b/i },
  { name: 'shutdown', re: /(^|[\s;&])(sudo\s+)?shutdown\b/i },
  { name: 'mkfs', re: /\bmkfs\b/i },
  { name: 'dd sobre dispositivo/entrada cruda', re: /\bdd\s+if=/i },
  { name: 'fork bomb', re: /:\(\)\s*\{/ },
  { name: 'chmod 777 sobre /', re: /\bchmod\s+(-r\s+)?777\s+\/(?:\s|$)/i },
  { name: 'escritura a dispositivo de bloque', re: />\s*\/dev\/(sd|hd|nvme)/i },
];

const ALLOWED_BINARIES = new Set([
  'node', 'npm', 'npx', 'yarn', 'pnpm',
  'git', 'echo', 'printf',
  'ls', 'cat', 'head', 'tail', 'grep', 'wc', 'mkdir', 'test',
  'true', 'false',
  'python', 'python3', 'pytest', 'jest', 'vitest', 'nyc',
]);

// Devuelve { ok: true } o { ok: false, reason }. NO ejecuta nada.
function sanitizeCommand(command) {
  if (typeof command !== 'string' || !command.trim()) {
    return { ok: false, reason: 'command requerido y debe ser string no vacío' };
  }
  for (const { name, re } of FORBIDDEN_PATTERNS) {
    if (re.test(command)) {
      return { ok: false, reason: `Comando rechazado: patrón prohibido (${name}).` };
    }
  }
  for (const rawSegment of command.split('|')) {
    const segment = rawSegment.trim();
    if (!segment) {
      return { ok: false, reason: 'Comando rechazado: segmento vacío en el pipe.' };
    }
    if (/`/.test(segment) || /\$\(/.test(segment) || /\b&&\b/.test(segment) || /[;]/.test(segment)) {
      return {
        ok: false,
        reason: `Comando rechazado: segmento con metacaracteres de shell no permitido: "${segment.slice(0, 60)}".`,
      };
    }
    const binary = segment.split(/\s+/)[0];
    if (!ALLOWED_BINARIES.has(binary)) {
      return {
        ok: false,
        reason: `Comando rechazado: binario no permitido "${binary}". Cada segmento debe empezar con uno de: ${[...ALLOWED_BINARIES].join(', ')}.`,
      };
    }
  }
  return { ok: true };
}

// ── Escaneos de archivos ──────────────────────────────────────────────────

const DIFF_FORBIDDEN = ['console.error', 'TODO', 'FIXME', 'XXX', '!important'];

const SECRET_PATTERNS = [
  { label: 'OpenAI key', re: /sk-[a-zA-Z0-9]{20,}/ },
  { label: 'GitHub PAT', re: /ghp_[a-zA-Z0-9]{30,}/ },
  { label: 'AWS Access Key', re: /AKIA[0-9A-Z]{16}/ },
  { label: 'Private key', re: /-----BEGIN (RSA |EC )?PRIVATE KEY-----/ },
];

// Resuelve una ruta relativa al repo root, rechazando escapar fuera del repo.
function resolveSafe(relPath) {
  const root = resolve(config.root);
  const abs = resolve(root, relPath);
  if (abs !== root && !abs.startsWith(root + sep) && !abs.startsWith(root + '/')) {
    return null;
  }
  return abs;
}

function readScanFiles(filesToScan) {
  if (!Array.isArray(filesToScan) || filesToScan.length === 0) {
    return {
      ok: false,
      reason: 'files_to_scan requerido: array de rutas relativas al repo (ej: ["src/app.js"]).',
    };
  }
  const contents = [];
  const missing = [];
  for (const rel of filesToScan) {
    const abs = resolveSafe(String(rel));
    if (!abs) {
      missing.push(`${rel} (fuera del repo)`);
      continue;
    }
    try {
      contents.push({ rel: String(rel), content: readFileSync(abs, 'utf8') });
    } catch {
      missing.push(rel);
    }
  }
  return { ok: true, contents, missing };
}

function runDiffScan(gateId, filesToScan, stdout = '', stderr = '') {
  if (Array.isArray(filesToScan) && filesToScan.length > 0) {
    const read = readScanFiles(filesToScan);
    if (!read.ok) {
      return { ok: true, gate_id: gateId, method: 'diff_scan', pass: false, reason: read.reason };
    }
    const found = [];
    for (const { rel, content } of read.contents) {
      for (const pattern of DIFF_FORBIDDEN) {
        if (content.includes(pattern)) found.push(`${pattern} (en ${rel})`);
      }
    }
    const missingNote = read.missing.length > 0 ? ` Archivos no legibles: ${read.missing.join(', ')}.` : '';
    if (found.length > 0) {
      return {
        ok: true,
        gate_id: gateId,
        method: 'diff_scan',
        pass: false,
        reason: `Patrones prohibidos: ${found.join('; ')}.${missingNote}`,
        files_scanned: read.contents.length,
      };
    }
    if (read.contents.length === 0) {
      return {
        ok: true,
        gate_id: gateId,
        method: 'diff_scan',
        pass: false,
        reason: `Ningún archivo de files_to_scan pudo leerse.${missingNote}`,
        files_scanned: 0,
      };
    }
    return { ok: true, gate_id: gateId, method: 'diff_scan', pass: true, files_scanned: read.contents.length };
  }

  // Compatibilidad: sin files_to_scan, escanear la salida del comando.
  const found = DIFF_FORBIDDEN.filter((p) => stdout.includes(p) || stderr.includes(p));
  if (found.length > 0) {
    return {
      ok: true,
      gate_id: gateId,
      method: 'diff_scan',
      pass: false,
      reason: `Patrones prohibidos en la salida: ${found.join(', ')}.`,
    };
  }
  return { ok: true, gate_id: gateId, method: 'diff_scan', pass: false, reason: 'files_to_scan requerido para diff_scan.' };
}

function runSecurityScan(gateId, filesToScan, stdout = '', stderr = '') {
  if (Array.isArray(filesToScan) && filesToScan.length > 0) {
    const read = readScanFiles(filesToScan);
    if (!read.ok) {
      return { ok: true, gate_id: gateId, method: 'security_scan', pass: false, reason: read.reason };
    }
    const found = [];
    for (const { rel, content } of read.contents) {
      for (const { label, re } of SECRET_PATTERNS) {
        if (re.test(content)) found.push(`${label} (en ${rel})`);
      }
    }
    const missingNote = read.missing.length > 0 ? ` Archivos no legibles: ${read.missing.join(', ')}.` : '';
    if (found.length > 0) {
      return {
        ok: true,
        gate_id: gateId,
        method: 'security_scan',
        pass: false,
        reason: `Posible secreto detectado: ${found.join('; ')}.${missingNote}`,
        files_scanned: read.contents.length,
      };
    }
    if (read.contents.length === 0) {
      return {
        ok: true,
        gate_id: gateId,
        method: 'security_scan',
        pass: false,
        reason: `Ningún archivo de files_to_scan pudo leerse.${missingNote}`,
        files_scanned: 0,
      };
    }
    return { ok: true, gate_id: gateId, method: 'security_scan', pass: true, files_scanned: read.contents.length };
  }

  // Compatibilidad: sin files_to_scan, escanear la salida del comando.
  const found = SECRET_PATTERNS.filter(({ re }) => re.test(stdout) || re.test(stderr)).map(({ label }) => label);
  if (found.length > 0) {
    return {
      ok: true,
      gate_id: gateId,
      method: 'security_scan',
      pass: false,
      reason: `Posible secreto detectado en la salida: ${found.join(', ')}.`,
    };
  }
  return { ok: true, gate_id: gateId, method: 'security_scan', pass: false, reason: 'files_to_scan requerido para security_scan.' };
}

// ── Evaluación de expect ──────────────────────────────────────────────────

function evaluateExpect(expect, { stdout, exitCode }) {
  if (!expect || expect === 'exit_code == 0') {
    return { pass: exitCode === 0 };
  }
  if (expect.startsWith('contains:')) {
    const needle = expect.slice('contains:'.length);
    return { pass: stdout.includes(needle) };
  }
  if (expect.startsWith('regex:')) {
    const pattern = expect.slice('regex:'.length);
    try {
      return { pass: new RegExp(pattern).test(stdout) };
    } catch {
      return { pass: false, reason: `regex inválida en expect: ${pattern}` };
    }
  }
  if (/\d+\s+failing/i.test(expect)) {
    // "0 failing" → número de failing esperado en stdout
    const m = stdout.match(/(\d+)\s+failing/i);
    const failing = m ? parseInt(m[1], 10) : -1;
    const target = parseInt(expect.match(/(\d+)\s+failing/i)[1], 10);
    return { pass: failing === target };
  }
  // Aceptación literal: el expect aparece en stdout
  return { pass: stdout.includes(expect) };
}

// ── Tool ──────────────────────────────────────────────────────────────────

export const gate_check = {
  name: 'gate_check',
  description:
    'Ejecuta un gate objetivo (test, assertion, diff_scan, security_scan). ' +
    'Devuelve pass/fail con salida exacta. ' +
    'El agente QUE HACE EL TRABAJO no puede declarar éxito — esta tool es la única evidencia válida. ' +
    'Los comandos pasan por sanitización (whitelist de binarios, sin pipes a shells). ' +
    'diff_scan/security_scan escanean files_to_scan (rutas relativas al repo). ' +
    'expect admite: "exit_code == 0", "contains:TEXTO", "regex:PATRON", "N failing" o literal.',
  inputSchema: {
    gate_id: 'string (ej: G1)',
    method: 'test|assertion|diff_scan|security_scan',
    command: 'string (comando a ejecutar; no requerido en diff_scan/security_scan)',
    expect: 'string (criterio de éxito: "exit_code == 0", "contains:x", "regex:x", "0 failing")',
    files_to_scan: 'array de strings (rutas relativas al repo, para diff_scan/security_scan)',
  },
  permissions: ['execute'],
  async run({ gate_id, method, command, expect, files_to_scan }, ctx) {
    if (!gate_id) throw new Error('gate_id requerido');

    // Escaneos de archivos: no requieren command
    if (method === 'diff_scan' || method === 'security_scan') {
      if (Array.isArray(files_to_scan) && files_to_scan.length > 0) {
        return method === 'diff_scan'
          ? runDiffScan(gate_id, files_to_scan)
          : runSecurityScan(gate_id, files_to_scan);
      }
      // Sin files_to_scan: cae al modo compatibilidad ejecutando command (si es seguro)
    } else if (!command) {
      throw new Error('command requerido');
    }

    if (command) {
      const sanitized = sanitizeCommand(command);
      if (!sanitized.ok) {
        return {
          ok: true,
          gate_id,
          method,
          pass: false,
          reason: sanitized.reason,
          executed: false,
        };
      }
    } else {
      return {
        ok: true,
        gate_id,
        method,
        pass: false,
        reason: 'files_to_scan requerido (o command para escanear su salida).',
      };
    }

    // Ejecución
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

    // Escaneos en modo compatibilidad (sobre la salida del comando)
    if (method === 'diff_scan') {
      const result = runDiffScan(gate_id, null, stdout, stderr);
      return { ...result, executed: true, exitCode, timedOut, stdout: stdout.slice(0, 2000) };
    }
    if (method === 'security_scan') {
      const result = runSecurityScan(gate_id, null, stdout, stderr);
      return { ...result, executed: true, exitCode, timedOut, stdout: stdout.slice(0, 2000) };
    }

    const evaluation = evaluateExpect(expect, { stdout, exitCode });

    return {
      ok: true,
      gate_id,
      method,
      pass: evaluation.pass,
      reason: evaluation.reason,
      exitCode,
      timedOut,
      stdout: stdout.slice(0, 2000),
      stderr: stderr.slice(0, 500),
      expect,
    };
  },
};
