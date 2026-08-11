// src/tools/compare_inventories.js
// Compara inventarios de productos entre dos repos de GitHub.
//
// Estrategia:
//   - Busca archivos comunes de productos: products.json, inventory.json,
//     data/products.json, src/data/products.js, etc.
//   - Parsea los productos (soporta JSON, JS con export, CSV simple).
//   - Diff por campo "id" o "sku" o "name".
//   - Detecta: agotados (stock=0), nuevos (en B no en A), desaparecidos (en A no en B).
//
// Salida: { report: { agotados, nuevos, disponibles, diff, totalA, totalB } }

import { config, restApiHeaders } from '../config.js';

// Patrones de archivos de inventario comunes
const INVENTORY_PATTERNS = [
  'products.json',
  'inventory.json',
  'data/products.json',
  'data/inventory.json',
  'src/data/products.json',
  'src/data/inventory.json',
  'public/products.json',
  'api/products.json',
  'catalog.json',
  'items.json',
  'stock.json',
];

// Heurísticas para detectar el campo ID
function detectIdField(product) {
  if (!product || typeof product !== 'object') return null;
  for (const k of ['id', 'sku', '_id', 'productId', 'product_id', 'slug', 'name']) {
    if (product[k] != null) return k;
  }
  return null;
}

function detectStockField(product) {
  if (!product || typeof product !== 'object') return null;
  for (const k of ['stock', 'quantity', 'qty', 'available', 'inventory', 'count', 'units']) {
    if (product[k] != null) return k;
  }
  return null;
}

function detectPriceField(product) {
  if (!product || typeof product !== 'object') return null;
  for (const k of ['price', 'precio', 'cost', 'amount', 'value']) {
    if (product[k] != null) return k;
  }
  return null;
}

function detectNameField(product) {
  if (!product || typeof product !== 'object') return null;
  for (const k of ['name', 'nombre', 'title', 'titulo', 'label']) {
    if (product[k] != null) return k;
  }
  return null;
}

// Intenta parsear el contenido del archivo de inventario
function parseInventory(rawContent, filename) {
  if (!rawContent) return [];

  // JSON puro
  try {
    const data = JSON.parse(rawContent);
    if (Array.isArray(data)) return data;
    if (Array.isArray(data.products)) return data.products;
    if (Array.isArray(data.items)) return data.items;
    if (Array.isArray(data.data)) return data.data;
    if (data && typeof data === 'object') return Object.values(data).filter(v => typeof v === 'object');
  } catch {
    // no es JSON válido, probar JS
  }

  // JS con export default [...] o module.exports = [...]
  const jsArrayMatch = rawContent.match(/(?:export\s+default|module\.exports\s*=|export\s+const\s+\w+\s*=)\s*(\[[\s\S]*\])/);
  if (jsArrayMatch) {
    try {
      // Extraer el array y parsearlo como JSON-lik
      const arr = jsArrayMatch[1];
      // Convertir comillas simples a dobles, quitar trailing commas
      const normalized = arr
        .replace(/'/g, '"')
        .replace(/,(\s*[}\]])/g, '$1')
        .replace(/(\w+):/g, '"$1":');
      return JSON.parse(normalized);
    } catch {}
  }

  // CSV simple (header en primera línea)
  if (filename?.endsWith('.csv') || rawContent.includes(',')) {
    const lines = rawContent.trim().split('\n');
    if (lines.length > 1) {
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      const idIdx = headers.findIndex(h => ['id', 'sku', 'name'].includes(h));
      const stockIdx = headers.findIndex(h => ['stock', 'quantity', 'qty'].includes(h));
      if (idIdx >= 0) {
        return lines.slice(1).map(line => {
          const cells = line.split(',');
          return {
            id: cells[idIdx]?.trim(),
            name: cells[idIdx]?.trim(),
            stock: stockIdx >= 0 ? parseInt(cells[stockIdx]?.trim(), 10) : null,
          };
        }).filter(p => p.id);
      }
    }
  }

  return [];
}

// Lee un archivo de un repo vía GitHub API
async function fetchRepoFile(repo, path) {
  const url = `https://api.github.com/repos/${repo}/contents/${path}`;
  const res = await fetch(url, { headers: restApiHeaders() });
  if (!res.ok) return null;
  const data = await res.json();
  if (data.type !== 'file' || !data.content) return null;
  return {
    content: Buffer.from(data.content, 'base64').toString('utf8'),
    sha: data.sha,
    size: data.size,
  };
}

// Lista archivos raíz de un repo para detectar el archivo de inventario
async function findInventoryFile(repo) {
  // 1. Probar patrones comunes en raíz
  for (const pattern of INVENTORY_PATTERNS) {
    const file = await fetchRepoFile(repo, pattern);
    if (file) return { path: pattern, ...file };
  }
  // 2. Listar raíz y buscar archivos con "product" o "inventory" en el nombre
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/contents/`, { headers: restApiHeaders() });
    if (res.ok) {
      const items = await res.json();
      for (const item of items) {
        if (item.type === 'file' && /product|inventory|catalog|items?|stock/i.test(item.name)) {
          const file = await fetchRepoFile(repo, item.path);
          if (file) return { path: item.path, ...file };
        }
      }
    }
  } catch {}
  return null;
}

// Compara dos inventarios y devuelve el reporte
function diffInventories(productsA, productsB, labelA = 'A', labelB = 'B') {
  // Detectar campos
  const sampleA = productsA[0] || {};
  const sampleB = productsB[0] || {};

  const idField = detectIdField(sampleA) || detectIdField(sampleB) || 'id';
  const stockField = detectStockField(sampleA) || detectStockField(sampleB);
  const nameField = detectNameField(sampleA) || detectNameField(sampleB) || 'name';
  const priceField = detectPriceField(sampleA) || detectPriceField(sampleB);

  // Indexar por ID
  const indexA = new Map();
  for (const p of productsA) {
    const id = p[idField];
    if (id != null) indexA.set(String(id), p);
  }
  const indexB = new Map();
  for (const p of productsB) {
    const id = p[idField];
    if (id != null) indexB.set(String(id), p);
  }

  const idsA = new Set(indexA.keys());
  const idsB = new Set(indexB.keys());

  // Agotados: en ambos pero stock=0
  const agotados = [];
  // Nuevos: en B no en A
  const nuevos = [];
  // Desaparecidos: en A no en B
  const desaparecidos = [];
  // Disponibles: en ambos, stock > 0
  const disponibles = [];
  // Stock bajo: stock > 0 pero < 5
  const stockBajo = [];

  for (const id of idsB) {
    const pB = indexB.get(id);
    const stockB = stockField ? Number(pB[stockField]) || 0 : null;
    if (!idsA.has(id)) {
      nuevos.push({
        id,
        name: pB[nameField] || id,
        stock: stockB,
        price: priceField ? pB[priceField] : null,
      });
    } else {
      const pA = indexA.get(id);
      const stockA = stockField ? Number(pA[stockField]) || 0 : null;
      if (stockB === 0 && stockA > 0) {
        agotados.push({
          id,
          name: pB[nameField] || id,
          stockAgo: stockA,
          stockNow: 0,
          price: priceField ? pB[priceField] : null,
        });
      } else if (stockB > 0 && stockB < 5) {
        stockBajo.push({
          id,
          name: pB[nameField] || id,
          stock: stockB,
          price: priceField ? pB[priceField] : null,
        });
      } else if (stockB > 0) {
        disponibles.push({
          id,
          name: pB[nameField] || id,
          stock: stockB,
          price: priceField ? pB[priceField] : null,
        });
      }
    }
  }

  for (const id of idsA) {
    if (!idsB.has(id)) {
      const pA = indexA.get(id);
      desaparecidos.push({
        id,
        name: pA[nameField] || id,
        stockAgo: stockField ? Number(pA[stockField]) || 0 : null,
      });
    }
  }

  return {
    labelA,
    labelB,
    fields: { id: idField, stock: stockField, name: nameField, price: priceField },
    totalA: productsA.length,
    totalB: productsB.length,
    agotados,
    nuevos,
    desaparecidos,
    disponibles,
    stockBajo,
    summary: {
      total: productsB.length,
      agotados: agotados.length,
      nuevos: nuevos.length,
      desaparecidos: desaparecidos.length,
      disponibles: disponibles.length,
      stockBajo: stockBajo.length,
    },
  };
}

export const compare_inventories = {
  name: 'compare_inventories',
  description:
    'Compara inventarios de productos entre dos repos de GitHub. ' +
    'Detecta automáticamente el archivo de productos (products.json, inventory.json, etc.) ' +
    'y el campo ID/stock/name. ' +
    'Devuelve: agotados (stock=0), nuevos (en B no en A), desaparecidos (en A no en B), disponibles, stock bajo.',
  inputSchema: {
    repoA: 'string (owner/name) — repo de referencia (ej: axontech/axon-store)',
    repoB: 'string (owner/name) — repo a comparar (ej: tiendamax/tiendamax-web)',
    pathA: 'string (opcional, ruta específica al archivo de productos en A)',
    pathB: 'string (opcional, ruta específica al archivo de productos en B)',
  },
  permissions: ['read', 'github_api'],
  async run({ repoA, repoB, pathA, pathB }) {
    if (!repoA || !repoB) throw new Error('repoA y repoB requeridos');

    // Buscar archivos de inventario
    const fileA = pathA
      ? await fetchRepoFile(repoA, pathA).then(f => f ? { path: pathA, ...f } : null)
      : await findInventoryFile(repoA);
    const fileB = pathB
      ? await fetchRepoFile(repoB, pathB).then(f => f ? { path: pathB, ...f } : null)
      : await findInventoryFile(repoB);

    if (!fileA) {
      return {
        ok: false,
        error: `No se encontró archivo de inventario en ${repoA}. Especifica pathA manualmente.`,
        searchedPatterns: INVENTORY_PATTERNS,
      };
    }
    if (!fileB) {
      return {
        ok: false,
        error: `No se encontró archivo de inventario en ${repoB}. Especifica pathB manualmente.`,
        searchedPatterns: INVENTORY_PATTERNS,
      };
    }

    const productsA = parseInventory(fileA.content, fileA.path);
    const productsB = parseInventory(fileB.content, fileB.path);

    if (!productsA.length) {
      return { ok: false, error: `No se pudieron parsear productos de ${repoA}:${fileA.path}` };
    }
    if (!productsB.length) {
      return { ok: false, error: `No se pudieron parsear productos de ${repoB}:${fileB.path}` };
    }

    const report = diffInventories(productsA, productsB, repoA, repoB);
    report.fileA = fileA.path;
    report.fileB = fileB.path;

    return { ok: true, report };
  },
};

// Exportar para uso directo desde el agente inventory
export { findInventoryFile, parseInventory, diffInventories, fetchRepoFile };
