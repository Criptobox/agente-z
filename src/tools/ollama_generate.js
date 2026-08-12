// src/tools/ollama_generate.js
// Llama a un endpoint local de Ollama / llama.cpp server (OpenAI-compatible).
//
// Caso de uso:
//   - El usuario tiene Ollama corriendo en su PC (localhost:11434)
//   - O llama.cpp server en su Xiaomi 15 vía Termux (192.168.1.X:8080)
//   - El agente puede usarlo para inferencia local sin gastar cuota cloud
//
// Endpoint configurable vía env OLLAMA_ENDPOINT (default http://localhost:11434/v1)
// Modelo configurable vía env OLLAMA_MODEL (default qwen2.5:7b)
//
// Respeta el formato OpenAI /v1/chat/completions para máxima compatibilidad.

import { config } from '../config.js';

export const ollama_generate = {
  name: 'ollama_generate',
  description:
    'Llama a un modelo local vía Ollama o llama.cpp server (API compatible con OpenAI). ' +
    'Útil para inferencia local sin gastar cuota cloud. ' +
    'El endpoint se configura con OLLAMA_ENDPOINT (default http://localhost:11434/v1). ' +
    'El modelo se configura con OLLAMA_MODEL (default qwen2.5:7b). ' +
    'Acepta messages en formato OpenAI y devuelve la respuesta del modelo.',
  inputSchema: {
    prompt: 'string (texto del prompt)',
    system: 'string (opcional, system prompt)',
    model: 'string (opcional, sobreescribe OLLAMA_MODEL)',
    temperature: 'number (opcional, default 0.3)',
    max_tokens: 'number (opcional, default 1024)',
  },
  permissions: ['web', 'inference:local'],
  async run({ prompt, system, model, temperature = 0.3, max_tokens = 1024 }, ctx) {
    if (!prompt) throw new Error('prompt requerido');

    const endpoint = config.ollamaEndpoint;
    const defaultModel = config.ollamaModel;

    if (!endpoint) {
      return {
        ok: false,
        error: 'OLLAMA_ENDPOINT no configurado. Setéalo en .env o GitHub secrets.',
      };
    }

    const targetModel = model || defaultModel;
    if (!targetModel) {
      return { ok: false, error: 'No se especificó modelo y OLLAMA_MODEL no está configurado.' };
    }

    const messages = [];
    if (system) messages.push({ role: 'system', content: system });
    messages.push({ role: 'user', content: prompt });

    const url = `${endpoint.replace(/\/$/, '')}/chat/completions`;
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Ollama no requiere auth, pero llama.cpp server a veces sí.
          // Si OLLAMA_KEY está seteado, lo mandamos como Bearer.
          ...(config.ollamaKey ? { Authorization: `Bearer ${config.ollamaKey}` } : {}),
        },
        body: JSON.stringify({
          model: targetModel,
          messages,
          temperature,
          max_tokens,
          stream: false,
        }),
        signal: AbortSignal.timeout(config.inferenceTimeoutMs),
      });
    } catch (err) {
      return {
        ok: false,
        endpoint: url,
        model: targetModel,
        error: `No se pudo conectar a ${url}: ${err.message}. ¿Está Ollama corriendo?`,
      };
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return {
        ok: false,
        endpoint: url,
        model: targetModel,
        status: res.status,
        error: `HTTP ${res.status}: ${text.slice(0, 300)}`,
      };
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content ?? '';

    return {
      ok: true,
      endpoint: url,
      model: targetModel,
      content,
      tokens: {
        prompt: data.usage?.prompt_tokens || 0,
        completion: data.usage?.completion_tokens || 0,
      },
      raw: data,
    };
  },
};
