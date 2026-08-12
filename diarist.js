// src/tools/huggingface_search.js
// Busca modelos y datasets en Hugging Face Hub vía API pública.
//
// API pública (sin auth):
//   - GET https://huggingface.co/api/models?search=QUERY&limit=N
//   - GET https://huggingface.co/api/datasets?search=QUERY&limit=N
//
// Devuelve metadata compacta: id, downloads, likes, lastModified, tags.
// Útil para que el agente analyst sugiera modelos alternativos a MiniMax,
// o para que research encuentre modelos fine-tuned para una tarea específica.

const HF_API = 'https://huggingface.co/api';

function compactModel(m) {
  return {
    id: m.id || m.modelId,
    downloads: m.downloads || 0,
    likes: m.likes || 0,
    lastModified: m.lastModified,
    pipeline_tag: m.pipeline_tag || m.tags?.[0] || null,
    tags: (m.tags || []).slice(0, 8),
    library: m.library_name || null,
    license: (m.tags || []).find((t) => t.startsWith('license:'))?.replace('license:', '') || null,
  };
}

function compactDataset(d) {
  return {
    id: d.id || d.datasetId,
    downloads: d.downloads || 0,
    likes: d.likes || 0,
    lastModified: d.lastModified,
    tags: (d.tags || []).slice(0, 6),
  };
}

export const huggingface_search = {
  name: 'huggingface_search',
  description:
    'Busca modelos o datasets en Hugging Face Hub (API pública, sin auth). ' +
    'Devuelve id, downloads, likes, lastModified, tags, license. ' +
    'Útil para encontrar modelos open source alternativos (Qwen, DeepSeek, Mistral, etc.) ' +
    'o datasets para fine-tuning. Ordenado por popularidad.',
  inputSchema: {
    query: 'string (consulta de búsqueda)',
    kind: 'string (model | dataset, default model)',
    limit: 'number (opcional, default 5, máx 20)',
    filter_pipeline: 'string (opcional, ej: text-generation, text-classification)',
  },
  permissions: ['web'],
  async run({ query, kind = 'model', limit = 5, filter_pipeline }, ctx) {
    if (!query) throw new Error('query requerido');
    if (!['model', 'dataset'].includes(kind)) {
      throw new Error('kind debe ser "model" o "dataset"');
    }
    const maxLimit = Math.min(Math.max(limit || 5, 1), 20);
    const endpoint = kind === 'model' ? 'models' : 'datasets';

    const params = new URLSearchParams({
      search: query,
      limit: String(maxLimit * 2), // pedimos más, filtramos después
      full: 'false',
    });
    if (kind === 'model' && filter_pipeline) {
      params.set('filter', filter_pipeline);
    }

    const url = `${HF_API}/${endpoint}?${params}`;

    let res;
    try {
      res = await fetch(url, {
        headers: {
          'User-Agent': 'agent-brain/0.1 (https://github.com/Criptobox/agente-z)',
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      return { ok: false, query, error: `fetch falló: ${err.message}` };
    }

    if (!res.ok) {
      return { ok: false, query, status: res.status, error: `HF API ${res.status}` };
    }

    const data = await res.json();
    if (!Array.isArray(data)) {
      return { ok: false, query, error: 'Respuesta inesperada de HF API' };
    }

    // Ordenar por downloads (desc) y limitar
    const sorted = data
      .sort((a, b) => (b.downloads || 0) - (a.downloads || 0))
      .slice(0, maxLimit)
      .map(kind === 'model' ? compactModel : compactDataset);

    return {
      ok: true,
      query,
      kind,
      count: sorted.length,
      results: sorted,
    };
  },
};
