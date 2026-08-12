// src/config.js
// Centraliza lectura de entorno y constantes operativas.
// Toda variable se lee aquí una sola vez; el resto del código importa desde aquí.

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// ── Carga de .env local (en Actions no existe, las vars vienen del workflow) ──
function loadDotenv() {
  const envPath = resolve(process.cwd(), '.env');
  if (!existsSync(envPath)) return;
  const raw = readFileSync(envPath, 'utf8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
loadDotenv();

export const config = {
  // ── GitHub ──
  token: process.env.GITHUB_TOKEN || '',
  repo: process.env.GITHUB_REPOSITORY || '', // owner/name
  targetRepos: (process.env.TARGET_REPOS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  // ── Modelos de inferencia ──
  modelsPrimary: (process.env.MODELS_PRIMARY || 'gpt-4o-mini')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  modelsFallback: (process.env.MODELS_FALLBACK || 'phi-3-mini-4k-instruct')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  embeddingsModel: process.env.EMBEDDINGS_MODEL || 'text-embedding-3-small',

  // ── Proveedores alternativos (fallback de fallback) ──
  groqKey: process.env.GROQ_API_KEY || '',
  groqModel: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
  geminiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-1.5-flash',

  // ── Inferencia local (Ollama / llama.cpp server) ──
  // Endpoint compatible con OpenAI /v1/chat/completions
  // Ejemplos:
  //   - Ollama en PC:        http://localhost:11434/v1
  //   - llama.cpp en móvil:  http://192.168.1.50:8080/v1
  //   - Cloudflare Tunnel:   https://tu-tunnel.trycloudflare.com/v1
  ollamaEndpoint: process.env.OLLAMA_ENDPOINT || '',
  ollamaModel: process.env.OLLAMA_MODEL || 'qwen2.5:7b',
  ollamaKey: process.env.OLLAMA_KEY || '', // opcional, solo si el server requiere auth

  // ── Web search / web fetch ──
  // Permite a los agentes acceder a internet. Sin coste (DuckDuckGo HTML + SearXNG público).
  webEnabled: process.env.WEB_ENABLED !== 'false', // default true
  webFetchMaxBytes: parseInt(process.env.WEB_FETCH_MAX_BYTES || '50000', 10),

  // ── Presupuesto ──
  budgetDailyTokens: parseInt(process.env.BUDGET_DAILY_TOKENS || '120000', 10),
  budgetDailyActionsMinutes: parseInt(process.env.BUDGET_DAILY_ACTIONS_MINUTES || '180', 10),
  budgetWarnPercent: parseInt(process.env.BUDGET_WARN_PERCENT || '80', 10),

  // ── Runtime ──
  locale: process.env.LOCALE || 'es',
  timezone: process.env.TIMEZONE || 'America/Havana',
  dryRun: process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true',

  // ── Paths base (siempre relativos al repo root) ──
  root: process.cwd(),
  paths: {
    agents: 'agents',
    memory: 'memory',
    tasks: 'tasks',
    src: 'src',
    dashboard: 'dashboard',
  },

  // ── GitHub Models API ──
  // Documentación: https://docs.github.com/en/github-models
  modelsEndpoint: 'https://models.inference.ai.azure.com',

  // ── Límites duros del sistema ──
  // Si un agente emite más de esto, se trunca y se avisa.
  maxOutputTokens: 4096,
  // Tiempo máximo por llamada a inferencia (ms).
  inferenceTimeoutMs: 60_000,
  // Máximo de reglas promovidas por agente (sección 13.5 del spec).
  maxRulesPerAgent: 12,
  // Antigüedad en días para archivar lecciones sin uso.
  lessonArchiveDays: 60,
  // Mínimo de times_prevented_failure para promover lección a regla.
  lessonPromoteThreshold: 3,
};

// Helper: ¿estamos corriendo dentro de GitHub Actions?
export const isInActions = !!process.env.GITHUB_ACTIONS;

// Helper: ¿tenemos token válido?
export function hasToken() {
  return Boolean(config.token) && config.token.length > 10;
}

// Helper: cabeceras estándar para la API de GitHub Models.
export function modelsAuthHeaders() {
  return {
    Authorization: `Bearer ${config.token}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
}

// Helper: cabeceras para la REST API de GitHub.
export function restApiHeaders() {
  return {
    Authorization: `Bearer ${config.token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}
