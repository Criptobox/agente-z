// src/models.js
// MODEL ROUTER con fallback obligatorio (sección 1.4 del spec).
//
// Cadena de fallback:
//   1. GitHub Models primario (gpt-4o-mini o lo que ponga MODELS_PRIMARY)
//   2. GitHub Models secundario (phi-3-mini o MODELS_FALLBACK)
//   3. Groq (si hay GROQ_API_KEY)
//   4. Gemini (si hay GEMINI_API_KEY)
//   5. Modo DRY_RUN (respuestas mockeadas para tests)
//
// Métricas: cada llamada cuenta tokens y se acumula al presupuesto del día.

import { config, modelsAuthHeaders, hasToken } from './config.js';

// ── Estado en memoria del proceso (no persiste entre jobs) ──
const metrics = {
  calls: 0,
  tokensIn: 0,
  tokensOut: 0,
  byModel: {},
  failures: 0,
  fallbacksTriggered: 0,
};

export function getMetrics() {
  return { ...metrics };
}

export function resetMetrics() {
  metrics.calls = 0;
  metrics.tokensIn = 0;
  metrics.tokensOut = 0;
  metrics.byModel = {};
  metrics.failures = 0;
  metrics.fallbacksTriggered = 0;
}

// ── Estimación barata de tokens (~4 chars/token, sin dependencias) ──
export function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

function recordUsage(model, promptText, completionText) {
  metrics.calls++;
  metrics.tokensIn += estimateTokens(promptText);
  metrics.tokensOut += estimateTokens(completionText || '');
  metrics.byModel[model] = metrics.byModel[model] || { calls: 0, tokens: 0 };
  metrics.byModel[model].calls++;
  metrics.byModel[model].tokens += estimateTokens(promptText) + estimateTokens(completionText || '');
}

// ── Llamada a GitHub Models ──
async function callGitHubModels(model, messages, opts = {}) {
  if (!hasToken()) {
    throw new Error('Sin GITHUB_TOKEN. No se puede llamar a GitHub Models.');
  }

  const url = `${config.modelsEndpoint}/chat/completions`;
  const body = {
    model,
    messages,
    temperature: opts.temperature ?? 0.2,
    max_tokens: opts.maxTokens ?? config.maxOutputTokens,
    response_format: opts.jsonMode ? { type: 'json_object' } : undefined,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.inferenceTimeoutMs);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: modelsAuthHeaders(),
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`GitHubModels ${res.status}: ${txt.slice(0, 300)}`);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content ?? '';
    recordUsage(model, messages.map((m) => m.content).join('\n'), content);
    return content;
  } finally {
    clearTimeout(timeout);
  }
}

// ── Llamada a Groq (OpenAI-compatible) ──
async function callGroq(model, messages, opts = {}) {
  if (!config.groqKey) throw new Error('Sin GROQ_API_KEY');
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.groqKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: opts.temperature ?? 0.2,
      max_tokens: opts.maxTokens ?? config.maxOutputTokens,
    }),
  });
  if (!res.ok) throw new Error(`Groq ${res.status}: ${await res.text().catch(() => '')}`);
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content ?? '';
  recordUsage(`groq:${model}`, messages.map((m) => m.content).join('\n'), content);
  return content;
}

// ── Llamada a Gemini ──
async function callGemini(model, messages, opts = {}) {
  if (!config.geminiKey) throw new Error('Sin GEMINI_API_KEY');
  // Gemini usa un formato distinto. Convertimos messages → contents.
  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
  const systemText = messages.find((m) => m.role === 'system')?.content || '';

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.geminiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      systemInstruction: systemText ? { parts: [{ text: systemText }] } : undefined,
      generationConfig: { temperature: opts.temperature ?? 0.2, maxOutputTokens: opts.maxTokens ?? config.maxOutputTokens },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text().catch(() => '')}`);
  const data = await res.json();
  const content = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '';
  recordUsage(`gemini:${model}`, messages.map((m) => m.content).join('\n'), content);
  return content;
}

// ── Mock para DRY_RUN ──
function mockResponse(messages, opts = {}) {
  const last = messages[messages.length - 1]?.content || '';
  // Si se pide JSON, devolvemos un esqueleto válido.
  if (opts.jsonMode) {
    return JSON.stringify({
      route: 'NEW',
      reused_memory: [],
      findings: [
        {
          kind: 'OBSERVATION',
          statement: '[DRY_RUN] Respuesta simulada para tests.',
          evidence: 'mock',
          confidence: 50,
        },
      ],
      memory_writes: [],
      conflicts: [],
      handoff: {
        completed: [],
        not_completed: ['[DRY_RUN] nada real ejecutado'],
        files_touched: [],
        risks: [],
        next_agent: null,
        next_task: '[DRY_RUN] decidir siguiente paso',
      },
      needs_human: false,
      _dry_run: true,
    });
  }
  return `[DRY_RUN] ${last.slice(0, 200)}`;
}

// ── API pública: complete() con fallback automático ──
export async function complete(messages, opts = {}) {
  // DRY_RUN tiene máxima prioridad — incluso sin token responde.
  if (config.dryRun) {
    recordUsage('dry-run', messages.map((m) => m.content).join('\n'), '');
    return mockResponse(messages, opts);
  }

  const chain = [
    ...config.modelsPrimary.map((m) => ({ kind: 'github', model: m })),
    ...config.modelsFallback.map((m) => ({ kind: 'github', model: m })),
  ];
  if (config.groqKey) chain.push({ kind: 'groq', model: config.groqModel });
  if (config.geminiKey) chain.push({ kind: 'gemini', model: config.geminiModel });

  if (chain.length === 0) {
    throw new Error('No hay modelos configurados. Revisa .env o los secrets del workflow.');
  }

  let lastError = null;
  for (let i = 0; i < chain.length; i++) {
    const { kind, model } = chain[i];
    try {
      let content;
      if (kind === 'github') content = await callGitHubModels(model, messages, opts);
      else if (kind === 'groq') content = await callGroq(model, messages, opts);
      else content = await callGemini(model, messages, opts);
      if (i > 0) metrics.fallbacksTriggered++;
      return content;
    } catch (err) {
      metrics.failures++;
      lastError = err;
      // Si es 429 (rate limit) o 5xx, probamos siguiente. Si es 4xx otro, también.
      console.error(`[models] ${kind}:${model} falló: ${err.message}`);
      continue;
    }
  }
  throw new Error(`Todos los modelos fallaron. Último error: ${lastError?.message}`);
}

// ── Embeddings (GitHub Models) ──
export async function embed(text) {
  if (config.dryRun) {
    // Vector determinista de 16 dims para tests. No es real pero es estable.
    const h = simpleHash(text);
    return Array.from({ length: 16 }, (_, i) => ((h >> i) & 0xff) / 255 - 0.5);
  }
  if (!hasToken()) throw new Error('Sin GITHUB_TOKEN para embeddings');

  const url = `${config.modelsEndpoint}/embeddings`;
  const res = await fetch(url, {
    method: 'POST',
    headers: modelsAuthHeaders(),
    body: JSON.stringify({ model: config.embeddingsModel, input: text }),
  });
  if (!res.ok) {
    throw new Error(`Embeddings ${res.status}: ${await res.text().catch(() => '')}`);
  }
  const data = await res.json();
  return data.data?.[0]?.embedding ?? [];
}

// Hash estable para DRY_RUN
function simpleHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}
