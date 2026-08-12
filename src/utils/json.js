// src/utils/json.js
// Helpers para parseo robusto de JSON devuelto por modelos de lenguaje.
// Los modelos suelen devolver JSON con texto alrededor, fences ```json, etc.

// Extrae el primer objeto JSON válido de un texto.
// - Quita fences ```json ... ```
// - Encuentra el primer { y el último }
// - Intenta parsear, con cleanup de escapes comunes
// Devuelve { ok: true, value } o { ok: false, error, raw }
export function extractJSON(text) {
  if (!text || typeof text !== 'string') {
    return { ok: false, error: 'Texto vacío o no-string', raw: text };
  }
  let cleaned = text.trim();

  // Quitar fences ```json ... ``` o ``` ... ```
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  // Buscar primer { y último }
  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  if (first === -1 || last === -1 || last < first) {
    return { ok: false, error: 'No se encontró objeto JSON en el texto', raw: text };
  }
  const jsonStr = cleaned.slice(first, last + 1);

  // Intento 1: directo
  try {
    return { ok: true, value: JSON.parse(jsonStr) };
  } catch (err) {
    // Intento 2: limpiar escapes comunes (modelo que escapa comillas sin motivo)
    try {
      const cleaned2 = jsonStr.replace(/\\([^"\\nrtbf/])/g, '$1');
      return { ok: true, value: JSON.parse(cleaned2) };
    } catch (err2) {
      // Intento 3: quitar trailing commas
      try {
        const cleaned3 = jsonStr.replace(/,(\s*[}\]])/g, '$1');
        return { ok: true, value: JSON.parse(cleaned3) };
      } catch (err3) {
        return {
          ok: false,
          error: `JSON inválido: ${err3.message}`,
          raw: text,
          extracted: jsonStr.slice(0, 500),
        };
      }
    }
  }
}

// Igual que extractJSON pero lanza si falla (para compatibilidad con código existente)
export function parseAgentJSON(text) {
  const result = extractJSON(text);
  if (!result.ok) {
    throw new Error(`No se pudo parsear JSON del agente: ${result.error}`);
  }
  return result.value;
}
