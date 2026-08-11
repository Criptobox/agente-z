// src/memory.js
// Memoria compartida. Toda lectura/escritura pasa por aquí.
//
// Reglas del spec (sección 5):
//   - Nunca guardar conversación, siempre estructura.
//   - Una memoria se escribe solo si va a ahorrar trabajo real a otro agente.
//   - Es preferible escribir 0 memorias que escribir ruido.
//
// Implementación:
//   - Una memoria = un archivo .md con frontmatter YAML + cuerpo markdown.
//   - Índice compacto en memory/index.json (id → {type, project, title, tags, confidence, stale}).
//   - Vectores en memory/vectors.json (id → [floats]).
//   - Búsqueda híbrida: léxico + coseno + rerank por confianza.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { config } from './config.js';
import { embed } from './models.js';

// MEM_DIR se calcula dinámicamente para que los tests puedan cambiar config.root.
function memDir() {
  return resolve(config.root, config.paths.memory);
}

// ── Helpers de path ──
function pathFor(type, id) {
  const sub = {
    error: 'errors',
    decision: 'decisions',
    fact: 'facts',
    lesson: 'lessons',
    criteria: 'criteria',
    episode: 'episodes',
    budget: 'budget',
    diary: 'diary',
    project: 'projects',
  }[type];
  if (!sub) throw new Error(`Tipo de memoria desconocido: ${type}`);
  return join(memDir(), sub, `${id}.md`);
}

// ── Parseo de frontmatter YAML ligero (no usamos dependencias) ──
// Soporta: claves escalares, listas con [a, b], strings entre comillas.
export function parseFrontmatter(raw) {
  if (!raw.startsWith('---')) return { data: {}, body: raw };
  const end = raw.indexOf('\n---', 3);
  if (end === -1) return { data: {}, body: raw };
  const yamlBlock = raw.slice(3, end).trim();
  const body = raw.slice(end + 4).replace(/^[\n\r]+/, '');
  const data = {};
  for (const line of yamlBlock.split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    let val = line.slice(colon + 1).trim();
    // Lista: [a, b, c]
    if (val.startsWith('[') && val.endsWith(']')) {
      val = val.slice(1, -1).split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    } else if (val === 'null' || val === '') {
      val = null;
    } else if (/^-?\d+$/.test(val)) {
      val = parseInt(val, 10);
    } else if (/^-?\d+\.\d+$/.test(val)) {
      val = parseFloat(val);
    } else if (val === 'true' || val === 'false') {
      val = val === 'true';
    } else {
      val = val.replace(/^["']|["']$/g, '');
    }
    data[key] = val;
  }
  return { data, body };
}

export function stringifyFrontmatter(data, body = '') {
  const lines = ['---'];
  for (const [k, v] of Object.entries(data)) {
    if (v === null || v === undefined) lines.push(`${k}: null`);
    else if (Array.isArray(v)) lines.push(`${k}: [${v.map((x) => String(x)).join(', ')}]`);
    else if (typeof v === 'boolean') lines.push(`${k}: ${v}`);
    else if (typeof v === 'number') lines.push(`${k}: ${v}`);
    else lines.push(`${k}: ${v}`);
  }
  lines.push('---', '', body.trim(), '');
  return lines.join('\n');
}

// ── Lectura ──
export function readMemory(type, id) {
  const p = pathFor(type, id);
  if (!existsSync(p)) return null;
  const raw = readFileSync(p, 'utf8');
  const { data, body } = parseFrontmatter(raw);
  return { ...data, body };
}

export function readMemoryByPath(absPath) {
  if (!existsSync(absPath)) return null;
  const raw = readFileSync(absPath, 'utf8');
  const { data, body } = parseFrontmatter(raw);
  return { ...data, body, _path: absPath };
}

// ── Listado por tipo ──
export function listMemories(type) {
  const sub = {
    error: 'errors',
    decision: 'decisions',
    fact: 'facts',
    lesson: 'lessons',
    criteria: 'criteria',
    episode: 'episodes',
    budget: 'budget',
    diary: 'diary',
    project: 'projects',
  }[type];
  if (!sub) return [];
  const dir = join(memDir(), sub);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
    .map((f) => {
      const full = join(dir, f);
      const raw = readFileSync(full, 'utf8');
      const { data } = parseFrontmatter(raw);
      return { ...data, _file: f, _path: full };
    });
}

// ── Escritura ──
// Solo escribe si el archivo no existe o si el contenido cambió.
// Devuelve { written: boolean, path: string }.
export function writeMemory(type, id, data, body = '') {
  const p = pathFor(type, id);
  mkdirSync(resolve(p, '..'), { recursive: true });
  const content = stringifyFrontmatter(data, body);
  if (existsSync(p)) {
    const existing = readFileSync(p, 'utf8');
    if (existing === content) return { written: false, path: p };
  }
  writeFileSync(p, content, 'utf8');
  return { written: true, path: p };
}

// ── Índice compacto ──
// Estructura: { [id]: { type, project, title, tags, confidence, stale, files, symbols } }
export function buildIndex() {
  const types = ['error', 'decision', 'fact', 'lesson', 'criteria', 'episode', 'budget', 'diary', 'project'];
  const index = {};
  for (const t of types) {
    for (const mem of listMemories(t)) {
      const id = mem.id || mem._file.replace(/\.md$/, '');
      index[id] = {
        type: t,
        project: mem.project || null,
        title: mem.title || '',
        tags: Array.isArray(mem.tags) ? mem.tags : [],
        confidence: typeof mem.confidence === 'number' ? mem.confidence : null,
        stale: mem.stale === true,
        files: Array.isArray(mem.files) ? mem.files : [],
        symbols: Array.isArray(mem.symbols) ? mem.symbols : [],
        scope: mem.scope || null,
        times_applied: typeof mem.times_applied === 'number' ? mem.times_applied : null,
        times_prevented_failure: typeof mem.times_prevented_failure === 'number' ? mem.times_prevented_failure : null,
        promoted_to_rule: mem.promoted_to_rule === true,
        updated: mem.updated || mem.created || null,
      };
    }
  }
  return index;
}

export function loadIndex() {
  const idxPath = join(memDir(), 'index.json');
  if (!existsSync(idxPath)) return buildIndex();
  try {
    const raw = JSON.parse(readFileSync(idxPath, 'utf8'));
    // Soporta dos formatos: {entries: {...}} o {ID: {...}} directo.
    const index = raw.entries || raw;
    // Auto-healing: si el índice está vacío pero hay archivos .md, regenerar.
    if (Object.keys(index).length === 0) {
      const fresh = buildIndex();
      if (Object.keys(fresh).length > 0) {
        saveIndex(fresh);
        return fresh;
      }
    }
    return index;
  } catch {
    return buildIndex();
  }
}

export function saveIndex(index) {
  writeFileSync(join(memDir(), 'index.json'), JSON.stringify(index, null, 2) + '\n', 'utf8');
}

// ── Vectores ──
export function loadVectors() {
  const p = join(memDir(), 'vectors.json');
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return {};
  }
}

export function saveVectors(vectors) {
  writeFileSync(join(memDir(), 'vectors.json'), JSON.stringify(vectors, null, 2) + '\n', 'utf8');
}

// ── Búsqueda léxica (gratis, sin API) ──
function tokenize(text) {
  if (!text) return [];
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quita acentos
    .split(/[^a-z0-9_]+/)
    .filter((t) => t.length >= 3);
}

function lexicalScore(queryTokens, mem) {
  const titleTokens = new Set(tokenize(mem.title));
  const tagSet = new Set((mem.tags || []).map((t) => t.toLowerCase()));
  let score = 0;
  for (const qt of queryTokens) {
    if (titleTokens.has(qt)) score += 3;
    if (tagSet.has(qt)) score += 2;
  }
  return score;
}

// ── Búsqueda semántica (coseno por fuerza bruta) ──
export function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// ── BÚSQUEDA HÍBRIDA (la que realmente funciona, sección 4 del spec) ──
//
// Pasos:
//   1. Filtro exacto: mismo proyecto, archivos/símbolos mencionados en la tarea.
//   2. Filtro léxico: tags + palabras del título.
//   3. Coseno: top 20 semánticos.
//   4. Fusión + rerank por confidence.
//
// Devuelve array de { id, score, reason, memory } ordenado desc.
export async function search(query, opts = {}) {
  const index = loadIndex();
  const projectFilter = opts.project || null;
  const filesFilter = opts.files || [];
  const symbolsFilter = opts.symbols || [];
  const typesFilter = opts.types || null; // array de tipos permitidos
  const topK = opts.topK || 5;
  const includeStale = opts.includeStale || false;

  const queryTokens = tokenize(query);
  const candidates = [];

  for (const [id, meta] of Object.entries(index)) {
    if (typesFilter && !typesFilter.includes(meta.type)) continue;
    if (projectFilter && meta.project && meta.project !== projectFilter) continue;
    if (!includeStale && meta.stale) continue;

    let score = 0;
    const reasons = [];

    // (1) Filtro exacto por archivo/símbolo
    if (filesFilter.length && meta.files?.length) {
      const interFiles = filesFilter.filter((f) => meta.files.includes(f));
      if (interFiles.length) {
        score += interFiles.length * 5;
        reasons.push(`archivo(s): ${interFiles.join(', ')}`);
      }
    }
    if (symbolsFilter.length && meta.symbols?.length) {
      const interSym = symbolsFilter.filter((s) => meta.symbols.includes(s));
      if (interSym.length) {
        score += interSym.length * 4;
        reasons.push(`símbolo(s): ${interSym.join(', ')}`);
      }
    }

    // (2) Léxico
    const lexScore = lexicalScore(queryTokens, meta);
    if (lexScore > 0) {
      score += lexScore;
      reasons.push(`léxico=${lexScore}`);
    }

    // Bonus por confianza alta
    if (typeof meta.confidence === 'number' && meta.confidence >= 80) {
      score += 1;
    }
    // Penalización por staleness si se incluye
    if (meta.stale) {
      score -= 3;
      reasons.push('STALE - requiere reverificación');
    }

    if (score > 0) {
      candidates.push({ id, score, reason: reasons.join(' | '), memory: meta });
    }
  }

  // (3) Coseno — solo si la query vale la pena y no estamos en DRY_RUN puro
  if (query && query.length >= 5) {
    try {
      const qVec = await embed(query);
      const vectors = loadVectors();
      const semScores = [];
      for (const [id, vec] of Object.entries(vectors)) {
        if (!index[id]) continue;
        if (typesFilter && !typesFilter.includes(index[id].type)) continue;
        if (projectFilter && index[id].project && index[id].project !== projectFilter) continue;
        if (!includeStale && index[id].stale) continue;
        const c = cosine(qVec, vec);
        if (c > 0.3) semScores.push({ id, score: c, reason: `coseno=${c.toFixed(3)}` });
      }
      // Top 20 semánticos se fusionan
      semScores.sort((a, b) => b.score - a.score);
      for (const s of semScores.slice(0, 20)) {
        const existing = candidates.find((c) => c.id === s.id);
        if (existing) {
          existing.score += s.score * 4;
          existing.reason += ' | ' + s.reason;
        } else {
          candidates.push({ id: s.id, score: s.score * 4, reason: s.reason, memory: index[s.id] });
        }
      }
    } catch (err) {
      // Si falla embeddings, seguimos solo con léxico. No es fatal.
      console.error('[memory] embeddings fallaron, usando solo léxico:', err.message);
    }
  }

  // (4) Rerank final
  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, topK);
}

// ── Métricas para el dashboard ──
export function memoryStats() {
  const index = loadIndex();
  const stats = {
    total: Object.keys(index).length,
    byType: {},
    stale: 0,
    lowConfidence: 0,
    promotedRules: 0,
  };
  for (const meta of Object.values(index)) {
    stats.byType[meta.type] = (stats.byType[meta.type] || 0) + 1;
    if (meta.stale) stats.stale++;
    if (typeof meta.confidence === 'number' && meta.confidence < 60) stats.lowConfidence++;
    if (meta.promoted_to_rule) stats.promotedRules++;
  }
  return stats;
}

// ── Utilidad: próximo ID libre para un tipo ──
export function nextId(type) {
  const prefix = {
    error: 'BUG',
    decision: 'DEC',
    fact: 'FACT',
    lesson: 'LESSON',
    criteria: 'CRIT',
    episode: 'EPI',
    budget: 'BUDGET',
    diary: 'DIARY',
  }[type];
  if (!prefix) throw new Error(`Sin prefijo para tipo: ${type}`);
  const existing = listMemories(type)
    .map((m) => m.id || '')
    .filter((id) => id.startsWith(prefix))
    .map((id) => parseInt(id.replace(prefix + '-', ''), 10))
    .filter((n) => !isNaN(n));
  const next = existing.length ? Math.max(...existing) + 1 : 1;
  return `${prefix}-${String(next).padStart(4, '0')}`;
}
