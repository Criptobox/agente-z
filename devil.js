// src/tools/gate_check.js
// Ejecuta un gate de Definition of Done.
// Sección 12.2 del spec: la verificación viene de una herramienta, no de una opinión.

import { execSync } from 'node:child_process';
import { config } from '../config.js';

// Comandos permitidos para gate_check (whitelist básica anti-inyección)
// Cualquier command debe empezar con uno de estos prefijos.
const ALLOWED_COMMAND_PREFIXES = [
  'npm ', 'npx ', 'node ', 'yarn ', 'pnpm ',
  'git ', 'grep ', 'rg ', 'cat ', 'echo ',
  'ls ', 'find ', 'pwd',
  'python ', 'python3 ', 'pytest ', 'pip ',
  'go ', 'cargo ', 'rustc ',
  'curl ', 'wget ',
  'bash ', 'sh ',
  'diff ', 'wc ',
  'mkdir ', 'cp ', 'mv ',  // solo para setup de tests
];

// Patrones absolutamente prohibidos en cualquier comando
const FORBIDDEN_PATTERNS = [
  /rm\s+-rf\s+\//,           // rm -rf /
  /rm\s+-rf\s+~/,            // rm -rf ~
  /:\(\)\s*\{\s*:\s*\|\s*:&\s*\};/, // fork bomb
  /mkfs/,                    // formatear disco
  /dd\s+if=.*of=\/dev\//,    // dd a dispositivo
  />\s*\/dev\/sd[a-z]/,      // escribir a disco
  /shutdown|reboot|halt/,    // apagar
  /curl.*\|\s*(bash|sh)/,    // curl | sh
  /wget.*\|\s*(bash|sh)/,    // wget | sh
];

function isCommandAllowed(command) {
  if (!command || typeof command !== 'string') return false;
  const trimmed = command.trim();

  // Verificar patrones prohibidos
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { ok: false, reason: `comando contiene patrón prohibido: ${pattern.source}` };
    }
  }

  // Verificar prefijo permitido
  const matched = ALLOWED_COMMAND_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
  if (!matched) {
    return {
      ok: false,
      reason: `comando debe empezar con uno de: ${ALLOWED_COMMAND_PREFIXES.join(', ')}. Recibido: "${trimmed.slice(0, 80)}"`,
    };
  }
  return { ok: true };
}

export const gate_check = {
  name: 'gate_check',
  description:
    'Ejecuta un gate objetivo (test, assertion, diff_scan, security_scan). ' +
    'Devuelve pass/fail con salida exacta. ' +
    'El agente QUE HACE EL TRABAJO no puede declarar éxito — esta tool es la única evidencia válida. ' +
    'Los comandos se validan contra una whitelist para prevenir inyección.',
  inputSchema: {
    gate_id: 'string (ej: G1)',
    method: 'test|assertion|diff_scan|security_scan',
    command: 'string (comando a ejecutar)',
    expect: 'string (criterio de éxito, ej: "exit_code == 0" o "0 failing")',
    files_to_scan: 'array de strings (para diff_scan/security_scan: lista de archivos a leer)',
  },
  permissions: ['execute'],
  async run({ gate_id, method, command, expect, files_to_scan }, ctx) {
    if (!gate_id) throw new Error('gate_id requerido');
    if (!method) throw new Error('method requerido (test|assertion|diff_scan|security_scan)');

    let stdout = '';
    let stderr = '';
    let exitCode = 0;
    let timedOut = false;

    // ── Para diff_scan y security_scan: leer archivos en vez de ejecutar comando ──
    if (method === 'diff_scan' || method === 'security_scan') {
      const { readFileSync, existsSync } = await import('node:fs');
      const { resolve: resolvePath } = await import('node:path');
      const targetFiles = Array.isArray(files_to_scan) && files_to_scan.length
        ? files_to_scan
        : (command ? command.split(/\s+/).filter(Boolean) : []);

      if (targetFiles.length === 0) {
        return {
          ok: true,
          gate_id,
          method,
          pass: false,
          reason: 'diff_scan/security_scan requiere files_to_scan o command con lista de archivos',
          exitCode: 0,
        };
      }

      // Leer contenido de todos los archivos
      const fileContents = [];
      for (const f of targetFiles) {
        const full = resolvePath(config.root, f);
        if (!existsSync(full)) {
          stderr += `archivo no encontrado: ${f}\n`;
          continue;
        }
        try {
          fileContents.push(`--- ${f} ---\n${readFileSync(full, 'utf8')}`);
        } catch (err) {
          stderr += `error leyendo ${f}: ${err.message}\n`;
        }
      }
      stdout = fileContents.join('\n\n');

      // Evaluar según método
      if (method === 'diff_scan') {
        const forbidden = ['console.error', 'TODO', 'FIXME', 'XXX', 'debugger'];
        const found = forbidden.filter((p) => stdout.includes(p));
        const pass = found.length === 0;
        return {
          ok: true,
          gate_id,
          method,
          pass,
          reason: pass
            ? 'Sin patrones prohibidos en los archivos escaneados'
            : `Patrones prohibidos encontrados: ${found.join(', ')}`,
          files_scanned: targetFiles,
          stdout: stdout.slice(0, 2000),
          stderr: stderr.slice(0, 500),
          exitCode: 0,
          expect,
        };
      }

      if (method === 'security_scan') {
        const patterns = [
          { name: 'OpenAI key', re: /sk-[a-zA-Z0-9]{20,}/ },
          { name: 'GitHub PAT', re: /ghp_[a-zA-Z0-9]{30,}/ },
          { name: 'AWS key', re: /AKIA[0-9A-Z]{16}/ },
          { name: 'Private key', re: /-----BEGIN (RSA |EC )?PRIVATE KEY-----/ },
          { name: 'Slack token', re: /xox[baprs]-[a-zA-Z0-9-]{10,}/ },
          { name: 'Generic API key', re: /api[_-]?key\s*[:=]\s*["'][a-zA-Z0-9]{32,}["']/i },
        ];
        const found = patterns.filter((p) => p.re.test(stdout) || p.re.test(stderr));
        const pass = found.length === 0;
        return {
          ok: true,
          gate_id,
          method,
          pass,
          reason: pass
            ? 'Sin secretos detectados'
            : `Posibles secretos: ${found.map((f) => f.name).join(', ')}`,
          files_scanned: targetFiles,
          stdout: stdout.slice(0, 2000),
          stderr: stderr.slice(0, 500),
          exitCode: 0,
          expect,
        };
      }
    }

    // ── Para test y assertion: ejecutar comando ──
    if (!command) {
      return {
        ok: true,
        gate_id,
        method,
        pass: false,
        reason: 'method test/assertion requiere parámetro command',
        exitCode: 0,
        expect,
      };
    }

    // Validar comando contra whitelist
    const cmdCheck = isCommandAllowed(command);
    if (!cmdCheck.ok) {
      return {
        ok: true,
        gate_id,
        method,
        pass: false,
        reason: `Comando rechazado: ${cmdCheck.reason}`,
        command,
        exitCode: 0,
        expect,
      };
    }

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
    let reason = '';

    if (expect === 'exit_code == 0') {
      pass = exitCode === 0;
      reason = pass ? 'exit code 0' : `exit code ${exitCode}`;
    } else if (expect && /failing/.test(expect)) {
      // "0 failing" → busca "X failing" en stdout
      const m = stdout.match(/(\d+)\s+failing/i);
      const failing = m ? parseInt(m[1], 10) : -1;
      const targetMatch = expect.match(/(\d+)\s+failing/);
      const target = targetMatch ? parseInt(targetMatch[1], 10) : 0;
      pass = failing === target;
      reason = pass
        ? `${failing} failing (esperado ${target})`
        : `${failing} failing (esperado ${target})`;
    } else if (expect && expect.startsWith('contains:')) {
      // "contains:texto" → el texto aparece en stdout
      const needle = expect.slice('contains:'.length).trim();
      pass = stdout.includes(needle);
      reason = pass ? `encontrado "${needle}"` : `no encontrado "${needle}"`;
    } else if (expect && expect.startsWith('regex:')) {
      // "regex:patrón" → el patrón aparece en stdout
      const pattern = expect.slice('regex:'.length).trim();
      try {
        const re = new RegExp(pattern);
        pass = re.test(stdout);
        reason = pass ? `regex "${pattern}" matcheó` : `regex "${pattern}" no matcheó`;
      } catch {
        pass = false;
        reason = `regex inválido: ${pattern}`;
      }
    } else if (expect) {
      // Aceptación literal: el expect aparece en stdout
      pass = stdout.includes(expect);
      reason = pass ? `encontrado "${expect}"` : `no encontrado "${expect}"`;
    } else {
      pass = exitCode === 0;
      reason = pass ? 'exit code 0' : `exit code ${exitCode}`;
    }

    return {
      ok: true,
      gate_id,
      method,
      pass,
      reason,
      exitCode,
      timedOut,
      stdout: stdout.slice(0, 2000),
      stderr: stderr.slice(0, 500),
      expect,
    };
  },
};
