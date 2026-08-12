// src/tools/search_memory.js
// Wrapper sobre la búsqueda híbrida de memoria.

import { search } from '../memory.js';

export const search_memory = {
  name: 'search_memory',
  description:
    'Busca en la memoria compartida (errores, decisiones, hechos, lecciones). ' +
    'Usa búsqueda híbrida: léxica + coseno + filtros por archivo/símbolo. ' +
    'Devuelve top-K resultados con score y razón.',
  inputSchema: {
    query: 'string',
    project: 'string (opcional)',
    files: 'array de strings (opcional)',
    symbols: 'array de strings (opcional)',
    types: 'array de tipos permitidos: error|decision|fact|lesson|criteria|episode',
    topK: 'number (default 5)',
  },
  permissions: ['read'],
  async run(input, ctx) {
    const results = await search(input.query || '', {
      project: input.project,
      files: input.files,
      symbols: input.symbols,
      types: input.types,
      topK: input.topK || 5,
    });
    return {
      ok: true,
      count: results.length,
      results: results.map((r) => ({
        id: r.id,
        type: r.memory.type,
        title: r.memory.title,
        score: r.score,
        reason: r.reason,
        confidence: r.memory.confidence,
        stale: r.memory.stale,
      })),
    };
  },
};
