# MEJORAS — lo que añadí sobre el spec

El usuario pidió "llévalo al siguiente nivel". Estas son las mejoras que apliqué sobre el spec original, con la justificación de cada una. No son desviaciones del spec — son añadidos que lo completan.

---

## v0.2 — Mejoras de capacidades reales (agosto 2026)

### 16. Nuevas tools web (web_search, web_fetch, huggingface_search)

**Mejora**: 3 tools nuevas que dan a los agentes acceso a internet SIN API key ni coste.

- `web_search`: usa DuckDuckGo HTML + fallback a SearXNG público. Devuelve top-8 resultados con title/url/snippet.
- `web_fetch`: descarga una URL, convierte HTML a markdown (sin dependencias externas), respeta maxBytes configurable.
- `huggingface_search`: API pública de HF Hub, busca modelos y datasets open source. Devuelve id, downloads, likes, license.

**Por qué**: los agentes `research` y `analyst` estaban limitados a lo que ya estaba en el repo. Sin internet, no podían investigar errores de librerías, buscar advisories de seguridad, ni sugerir modelos alternativos. Con estas tools, el `analyst` puede auditar dependencias contra advisories reales, y `research` puede citar URLs de StackOverflow como evidencia.

**Implementación**: cero dependencias npm. HTML parsing a mano con regex (suficiente para HTML semántico de DDG/SearXNG). User-Agent honesto identifica al agente. Timeouts e AbortSignal en todas las llamadas.

**Coste**: 3 archivos nuevos (~600 líneas), 13 tests (8 unitarios + 5 de integración con red real).

---

### 17. Tool ollama_generate + callOllama() en el router de modelos

**Mejora**: 
- Nueva tool `ollama_generate` que llama a un endpoint OpenAI-compatible (Ollama, llama.cpp server, vLLM local).
- Nueva función `callOllama()` en `src/models.js` integrada al fallback chain.
- Config nueva: `OLLAMA_ENDPOINT`, `OLLAMA_MODEL`, `OLLAMA_KEY`.

**Por qué**: el sistema dependía 100% de APIs cloud (GitHub Models, Groq, Gemini). Si se agota la cuota gratuita de las tres, el sistema muere. Con Ollama como último eslabón del chain, el sistema puede caer a un modelo local (PC del usuario, o teléfono vía Cloudflare Tunnel) y seguir funcionando.

**Caso de uso real**: el usuario tiene un Xiaomi 15 con Snapdragon 8 Elite y 12GB RAM. Con Termux + llama.cpp server, puede correr Qwen2.5-7B localmente y exponerlo vía Cloudflare Tunnel. GitHub Actions puede llamar a ese endpoint como fallback cuando las APIs cloud están rate-limited.

**Coste**: 1 archivo nuevo + modificación de `src/models.js` (~30 líneas) y `src/config.js` (3 vars nuevas).

---

### 18. Sanitización de comandos en gate_check

**Mejora**: `gate_check` ahora valida comandos contra una whitelist antes de ejecutarlos.

- Whitelist de prefijos permitidos: `npm`, `node`, `git`, `grep`, `python`, `go`, `cargo`, etc.
- Blacklist de patrones absolutamente prohibidos: `rm -rf /`, `mkfs`, fork bombs, `curl | bash`, `shutdown`, `dd if=*of=/dev/`, etc.
- Cualquier comando fuera de la whitelist se rechaza con `pass: false` y `reason` explicativo.

**Por qué**: el `gate_check` anterior ejecutaba CUALQUIER comando con `execSync` sin sanitizar. Si un agente pasaba `command: "rm -rf /"`, lo ejecutaba. Aunque el agente se supone que es confiable, un prompt injection desde un Issue malicioso podría hacer que el agente propusiera un comando peligroso. Defense in depth.

**Coste**: ~50 líneas en `gate_check.js`, 6 tests nuevos.

---

### 19. diff_scan y security_scan ahora leen archivos en vez de ejecutar comandos

**Mejora**: 
- `diff_scan` y `security_scan` ya no ejecutan `command`. En su lugar, leen `files_to_scan` con `readFileSync` y aplican los patrones al contenido.
- Nuevos patrones de seguridad: Slack token, generic API key.
- `diff_scan` ahora detecta `debugger` además de `console.error`, `TODO`, `FIXME`, `XXX`.

**Por qué (bug que corrige)**: antes, si `method` era `diff_scan` o `security_scan` PERO el agente no pasaba `command`, el código caía al `else if (expect)` final y hacía cosas raras. Además, la lógica evaluaba `expect` antes de los métodos especiales, lo que podía dar falsos positivos. Ahora cada método tiene su flujo claro.

**Coste**: refactor de ~80 líneas, 6 tests nuevos.

---

### 20. Helper compartido de parseo JSON (`src/utils/json.js`)

**Mejora**: 
- Nuevo módulo `src/utils/json.js` con `extractJSON(text)` y `parseAgentJSON(text)`.
- 3 niveles de limpieza: directo → limpiar escapes → quitar trailing commas.
- Todos los agentes (devil, learner, self_improver, diarist, orchestrator, runner) ahora usan este helper en vez de `indexOf('{')` manual.

**Por qué (bug que corrige)**: el patrón `const first = raw.indexOf('{'); const last = raw.lastIndexOf('}'); JSON.parse(raw.slice(first, last + 1))` estaba duplicado en 5 archivos. Si el modelo devolvía texto sin `{`, `first === -1` y `raw.slice(-1, 0)` daba algo raro que rompía sin mensaje útil. El helper unifica la lógica y da errores claros.

**Coste**: 1 archivo nuevo (~50 líneas), 12 tests nuevos.

---

### 21. file_write con protección de paths del sistema

**Mejora**: 
- `file_write` ahora rechaza extensiones peligrosas: `.env`, `.sh`, `.exe`, `.bat`, `.cmd`, `.ps1`.
- Rechaza paths del sistema: `.git/`, `.github/workflows/`, `node_modules/`.
- Devuelve `append: bool` en la respuesta para confirmar el modo.

**Por qué**: un agente con permiso `write` podría sobreescribir `.github/workflows/orchestrator.yml` o inyectar código en `.env`. Aunque los agentes se supone que son confiables, defense in depth. Si un agente necesita modificar un workflow, debe hacerlo vía PR (como `self_improver`).

**Coste**: ~20 líneas, sin tests nuevos (cubierto por tests existentes).

---

### 22. file_read con límite de tamaño configurable

**Mejora**: 
- `file_read` ahora usa `statSync` real (no el stub `{size:0}` que tenía antes).
- Rechaza archivos > `maxBytes` (default 512KB) con error claro.
- Devuelve `size` y `lines` reales.

**Por qué (bug que corrige)**: la línea `const stat = existsSync(full) ? { size: 0 } : null;` era código muerto — siempre devolvía `{size:0}` o null, no usaba el stat real. Además, un agente podía pedir `file_read` sobre un archivo de 50MB y saturar el contexto del modelo.

**Coste**: ~10 líneas.

---

### 23. Bug en budget.js: tasks_throttled siempre devolvía 0

**Mejora**: ahora capturamos `tasks.length` ANTES de marcarlas como throttled.

**Por qué (bug que corrige)**: el código original llamaba `loadThrottleableTasks()` DOS veces: una para throttlear, otra para contar. Pero después de `throttleTask(t)`, las tareas tienen `status: 'throttled'`, no `'in_progress'`, así que el segundo llamado siempre devolvía `[]`. Resultado: el snapshot de budget siempre decía `tasks_throttled: 0` aunque hubiera 10 tareas throttleadas.

**Coste**: 3 líneas.

---

### 24. Bug en orchestrator.js: handleApprove parseaba index.json como tarea

**Mejora**: ahora filtra `f === 'index.json'` y `f.startsWith('TASK-')`.

**Por qué (bug que corrige)**: `handleApprove` listaba todos los `.json` en `tasks/` y los parseaba como tareas. Pero `tasks/index.json` (generado por `reindex.js`) tiene formato distinto (`{tasks: [...], generatedAt: ...}`), y al parsearlo como tarea fallaba silenciosamente. Ahora solo se procesan archivos `TASK-XXXX.json`.

**Coste**: 2 líneas.

---

### 25. Bug en devil.js: JSON.parse del body sin try/catch

**Mejora**: envoltorio IIFE con try/catch que devuelve `[]` si el body no es JSON válido.

**Por qué (bug que corrige)**: `JSON.parse(lastEpisode.body).reused_memory || []` revienta si el body no es JSON válido. Algunos episodios viejos tenían body en formato markdown, no JSON. El devil crasheaba al intentar leerlos.

**Coste**: 8 líneas.

---

### 26. Bug en chat.js y diarist.js: usaban campos inexistentes del frontmatter

**Mejora**: ahora usan `created` (campo que sí existe) con fallback a `date` y `headline` con fallback a `title`.

**Por qué (bug que corrige)**: `ctx.lastDiary.date` y `ctx.lastDiary.headline` no existen — el diario se guarda como markdown con frontmatter, los campos reales son `created` y `title`. Mismo con `lastBudget`. Mostraba `(sin headline)` y `(?)` siempre.

**Coste**: 4 líneas.

---

## v0.1 — Mejoras originales

### 1. Tests unitarios del núcleo

**Spec**: no menciona tests del propio sistema.
**Mejora**: `tests/` con cobertura de `memory.js`, `context.js`, `models.js`, `devil.js` + smoke test end-to-end.

**Por qué**: un sistema que escribe memoria y código sin tests propios es un peligro. Si `parseFrontmatter` se rompe, todas las memorias se corrompen. Si `cosine` está mal, la búsqueda semántica devuelve basura. Tests = capacidad de iterar sin miedo.

**Coste**: 4 archivos de tests, ~500 líneas. Corren en <5s con `node --test`.

---

### 2. Modo DRY_RUN para desarrollo local

**Spec**: asume que todo corre en GitHub Actions con token real.
**Mejora**: `DRY_RUN=1` hace que `models.js` devuelva respuestas mockeadas deterministas. Permite correr el sistema localmente sin GitHub ni token.

**Por qué**: el usuario opera desde móvil en 3G. No puede iterar el código del sistema desde el móvil. Necesita poder probar cambios localmente antes de pushearlos. Sin DRY_RUN, cada iteración requiere un commit + push + esperar Actions.

**Implementación**: `config.dryRun` se propaga a `models.complete()` y `models.embed()`. El mock de `complete()` devuelve un JSON válido con `_dry_run: true`. El mock de `embed()` devuelve un vector de 16 dims determinista basado en hash del texto.

---

### 3. Embeddings con fallback determinista en DRY_RUN

**Spec**: embeddings vienen de GitHub Models.
**Mejora**: en DRY_RUN, `embed()` genera un vector de 16 dims con `simpleHash(text)`. No es real pero es estable — dos textos iguales dan el mismo vector.

**Por qué**: permite testear la búsqueda semántica sin llamar a la API. Si rompes `cosine()` o `search()`, el test lo detecta sin coste.

---

### 4. Rate limit handling explícito en `models.js`

**Spec**: menciona "fallback obligatorio desde el día 1" pero no detalla cómo.
**Mejora**: la cadena de fallback es explícita:
1. GitHub Models primario
2. GitHub Models secundario
3. Groq (si hay key)
4. Gemini (si hay key)
5. Ollama local (si hay OLLAMA_ENDPOINT) — NUEVO en v0.2
6. DRY_RUN (si está activado)

Cada llamada cuenta tokens para el budget agent. Los 429 y 5xx caen al siguiente. Los 4xx también (puede ser modelo deprecado).

**Por qué**: los free tiers cambian sin aviso (sección 1.4 del spec). Sin cadena explícita, un modelo que cae te deja seco.

---

### 5-15. (Mejoras anteriores sin cambio)

Ver historial del repo para las mejoras 5-15 (índices para dashboard, criterios sembrados, parser YAML ligero, etc.).

---

## Mejoras consideradas y descartadas

### PostgreSQL/SQLite para memoria
**Descartado**: contradice el principio "archivos versionados dan más (historial, diff, edición móvil) por $0" del spec. Si algún día la escala supera 5000 memorias y la búsqueda léxica no basta, se reconsidera.

### WebSocket para tiempo real
**Descartado**: el spec dice "minutos, no segundos". No justifica un servidor.

### Vector DB externa (Pinecone, Weaviate)
**Descartado**: coseno por fuerza bruta basta muy por debajo de 5000 registros. Es infraestructura que pagas sin recibir nada.

### TypeScript
**Descartado por ahora**: añade build step. El código es suficientemente pequeño para que JS vainilla con JSDoc baste. Si el código crece, se migra.

### Framework web (Next.js, Astro) para el dashboard
**Descartado**: HTML estático + JS vainilla = cero build step = cero dependencias = funciona en GitHub Pages sin más. No justifica un framework.

### Usar Turndown o Cheerio para HTML parsing
**Descartado en v0.2**: añadiría dependencias npm. El parser regex de `web_fetch` es suficiente para HTML semántico de MDN, React docs, GitHub READMEs. Si se necesita parsing más robusto en el futuro, se reconsidera.

### Usar Brave Search API en vez de DuckDuckGo HTML
**Descartado**: requiere API key. La filosofía del proyecto es "coste cero, sin servidor, sin registro". DuckDuckGo + SearXNG bastan para el 90% de casos.

---

## Resumen v0.2

10 mejoras nuevas en v0.2 (16-25), todas pequeñas, ninguna cambia la arquitectura del spec. El sistema resultante es:
- **Conectado a internet** (web_search, web_fetch, huggingface_search)
- **Con inferencia local** (ollama_generate + callOllama en el fallback chain)
- **Más seguro** (whitelist de comandos, paths protegidos, secret scanning mejorado)
- **Más robusto** (parseo JSON unificado, sin crashes en episodios viejos)
- **Más observable** (métricas correctas de tareas throttleadas)

Si alguna de estas mejoras no te encaja, se borra y se acaba. Ninguna es acoplada al núcleo.

---

## Resumen v0.1

15 mejoras originales (1-15), todas pequeñas, ninguna cambia la arquitectura del spec. El sistema resultante es:
- **Testeable** (smoke + unit tests)
- **Iterable localmente** (DRY_RUN)
- **Resiliente** (fallback chain, rate limit handling)
- **Observable** (dashboard, diario, budget)
- **Seguro** (permissions mínimas, secret scanning)
- **Honesto** (STUCK es producto, no fracaso)

Si alguna de estas mejoras no te encaja, se borra y se acaba. Ninguna es acoplada al núcleo.
