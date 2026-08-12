// scripts/migrate-to-supabase.js
// Migra memorias de archivos .md a Supabase.
// Lee todos los .md de memory/, parsea frontmatter, genera embeddings, inserta en Supabase.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
const GROQ_KEY = process.env.GROQ_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('ERROR: Necesitas SUPABASE_URL y SUPABASE_SERVICE_KEY en el entorno.');
  process.exit(1);
}

function parseFrontmatter(raw) {
  if (!raw.startsWith('---')) return { data: {}, body: raw };
  const end = raw.indexOf('\n---', 3);
  if (end === -1) return { data: {}, body: raw };
  const yaml = raw.slice(3, end).trim();
  const body = raw.slice(end + 4).replace(/^[\n\r]+/, '');
  const data = {};
  for (const line of yaml.split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const c = line.indexOf(':');
    if (c === -1) continue;
    const k = line.slice(0, c).trim();
    let v = line.slice(c + 1).trim();
    if (v.startsWith('[') && v.endsWith(']')) v = v.slice(1,-1).split(',').map(s => s.trim().replace(/^["']|["']$/g,'')).filter(Boolean);
    else if (v === 'null' || v === '') v = null;
    else if (/^-?\d+$/.test(v)) v = parseInt(v, 10);
    else if (v === 'true' || v === 'false') v = v === 'true';
    else v = v.replace(/^["']|["']$/g, '');
    data[k] = v;
  }
  return { data, body };
}

function simpleHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) { h = (h << 5) - h + str.charCodeAt(i); h |= 0; }
  return Math.abs(h);
}

async function generateEmbedding(text) {
  // Fallback: vector determinista de 1536 dims (mejora cuando tengas OpenAI/Groq embeddings)
  const h = simpleHash(text);
  return Array.from({ length: 1536 }, (_, i) => ((h >> (i % 32)) & 1) ? 0.01 : -0.01);
}

async function insertMemory(mem) {
  const text = [mem.title, mem.statement, mem.rule, (mem.tags || []).join(' '), mem.body || ''].filter(Boolean).join(' ');
  const embedding = await generateEmbedding(text);
  const row = {
    id: mem.id, type: mem.type, title: mem.title || '(sin título)', body: mem.body || '',
    status: mem.status || null, severity: mem.severity || null,
    confidence: typeof mem.confidence === 'number' ? mem.confidence : 50,
    files: Array.isArray(mem.files) ? mem.files : [], symbols: Array.isArray(mem.symbols) ? mem.symbols : [],
    tags: Array.isArray(mem.tags) ? mem.tags : [], scope: mem.scope || null, trigger: mem.trigger || null,
    files_pattern: Array.isArray(mem.files_pattern) ? mem.files_pattern : [],
    rule: mem.rule || null, anti_pattern: mem.anti_pattern || null,
    born_from: Array.isArray(mem.born_from) ? mem.born_from : [],
    times_applied: typeof mem.times_applied === 'number' ? mem.times_applied : 0,
    times_prevented_failure: typeof mem.times_prevented_failure === 'number' ? mem.times_prevented_failure : 0,
    promoted_to_rule: mem.promoted_to_rule === true, archived: mem.archived === true,
    stale: mem.stale === true, commit_sha: mem.commit || null,
    task_id: mem.task_id || null, agent: mem.agent || null,
    embedding: `[${embedding.join(',')}]`, metadata: {},
  };
  const res = await fetch(`${SUPABASE_URL}/rest/v1/memories`, {
    method: 'POST',
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
    body: JSON.stringify(row),
  });
  if (!res.ok) { const txt = await res.text().catch(() => ''); throw new Error(`Insert ${mem.id}: ${res.status} ${txt.slice(0,200)}`); }
  return true;
}

async function migrate() {
  const memDir = resolve(process.cwd(), 'memory');
  const types = ['error','decision','fact','lesson','criteria','episode','budget','diary','project'];
  let total = 0, ok = 0, failed = 0;
  for (const type of types) {
    const dir = join(memDir, type);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter(f => f.endsWith('.md') && !f.startsWith('_'))) {
      total++;
      const raw = readFileSync(join(dir, f), 'utf8');
      const { data, body } = parseFrontmatter(raw);
      try { await insertMemory({ ...data, body }); ok++; console.log(`  ✅ ${data.id || f}`); }
      catch (err) { failed++; console.error(`  ❌ ${data.id || f}: ${err.message}`); }
    }
  }
  console.log(`\nMigración: ${ok}/${total} OK, ${failed} fallidos`);
}

migrate().catch(err => { console.error('FATAL:', err.message); process.exit(1); });
