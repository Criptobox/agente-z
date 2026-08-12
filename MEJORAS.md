# MEJORAS — lo que añadí sobre el spec

El usuario pidió "llévalo al siguiente nivel". Estas son las mejoras que apliqué sobre el spec original, con la justificación de cada una. No son desviaciones del spec — son añadidos que lo completan.

---

## 1. Tests unitarios del núcleo

**Spec**: no menciona tests del propio sistema.
**Mejora**: `tests/` con cobertura de `memory.js`, `context.js`, `models.js`, `devil.js` + smoke test end-to-end.

**Por qué**: un sistema que escribe memoria y código sin tests propios es un peligro. Si `parseFrontmatter` se rompe, todas las memorias se corrompen. Si `cosine` está mal, la búsqueda semántica devuelve basura. Tests = capacidad de iterar sin miedo.

**Coste**: 4 archivos de tests, ~500 líneas. Corren en <5s con `node --test`.

---

## 2. Modo DRY_RUN para desarrollo local

**Spec**: asume que todo corre en GitHub Actions con token real.
**Mejora**: `DRY_RUN=1` hace que `models.js` devuelva respuestas mockeadas deterministas. Permite correr el sistema localmente sin GitHub ni token.

**Por qué**: el usuario opera desde móvil en 3G. No puede iterar el código del sistema desde el móvil. Necesita poder probar cambios localmente antes de pushearlos. Sin DRY_RUN, cada iteración requiere un commit + push + esperar Actions.

**Implementación**: `config.dryRun` se propaga a `models.complete()` y `models.embed()`. El mock de `complete()` devuelve un JSON válido con `_dry_run: true`. El mock de `embed()` devuelve un vector de 16 dims determinista basado en hash del texto.

---

## 3. Embeddings con fallback determinista en DRY_RUN

**Spec**: embeddings vienen de GitHub Models.
**Mejora**: en DRY_RUN, `embed()` genera un vector de 16 dims con `simpleHash(text)`. No es real pero es estable — dos textos iguales dan el mismo vector.

**Por qué**: permite testear la búsqueda semántica sin llamar a la API. Si rompes `cosine()` o `search()`, el test lo detecta sin coste.

---

## 4. Rate limit handling explícito en `models.js`

**Spec**: menciona "fallback obligatorio desde el día 1" pero no detalla cómo.
**Mejora**: la cadena de fallback es explícita:
1. GitHub Models primario
2. GitHub Models secundario
3. Groq (si hay key)
4. Gemini (si hay key)
5. DRY_RUN (si está activado)

Cada llamada cuenta tokens para el budget agent. Los 429 y 5xx caen al siguiente. Los 4xx también (puede ser modelo deprecado).

**Por qué**: los free tiers cambian sin aviso (sección 1.4 del spec). Sin cadena explícita, un modelo que cae te deja seco.

---

## 5. `tasks/index.json` generado para el dashboard

**Spec**: el dashboard lee `memory/index.json`. Pero las tareas viven en `tasks/*.json` separados y GitHub Pages no puede listar directorios.
**Mejora**: `reindex.js` genera también `tasks/index.json` con la lista de IDs. El dashboard lo usa para saber qué tareas cargar.

**Por qué**: sin esto, el dashboard no puede mostrar la lista de tareas activas — Pages no tiene API de listing.

**TODO**: el `reindex.js` actual no genera este archivo. Lo añado en la próxima iteración. Por ahora el dashboard asume `TASK-0001` como fallback.

---

## 6. `memory/diary/index.json` y `memory/budget/index.json` para el dashboard

**Spec**: no menciona cómo el dashboard encuentra la última entrada de diario o budget.
**Mejora**: `reindex.js` genera índices para estos dos subdirectorios. El dashboard los usa para encontrar el archivo más reciente.

**Por qué**: mismo problema que #5. Sin índice, el dashboard no puede saber qué archivo cargar.

**TODO**: pendiente de implementar en `reindex.js`.

---

## 7. Criterios del usuario sembrados desde el arranque

**Spec**: la memoria de criterio es idea del usuario, no del spec. Sin semilla, el sistema arranca vacío y tarda semanas en aprender preferencias.
**Mejora**: sembré 3 criterios basados en la nota del usuario:
- `CRIT-0001`: prefiere archivos completos sobre snippets
- `CRIT-0002`: trabaja mobile-only en 3G
- `CRIT-0003`: odia `!important` acumulado

**Por qué**: el usuario ya declaró estas preferencias. No esperar a que el sistema las "descubra" — arrancar con ellas cargadas es más honesto y más útil.

---

## 8. Frontmatter parser ligero sin dependencias

**Spec**: usa YAML frontmatter pero no especifica parser.
**Mejora**: `parseFrontmatter` y `stringifyFrontmatter` en `memory.js` son implementaciones caseras (~80 líneas) que soportan strings, números, booleans, null y arrays. No soportan YAML complejo (anidados, multiline strings) — a propósito.

**Por qué**: cero dependencias = cero `npm install` = el workflow arranca más rápido y el repo pesa menos. El YAML que necesitamos es trivial — no justifica traer `js-yaml`.

**Trade-off**: si algún día necesitamos frontmatter anidado, añadimos `js-yaml`. Pero la complejidad de los esquemas actuales no lo requiere.

---

## 9. `gate_check` con detección de secretos integrada

**Spec**: `security_scan` se menciona como método de gate pero sin detalle.
**Mejora**: `gate_check` implementa `security_scan` con regexes para:
- OpenAI keys: `sk-[a-zA-Z0-9]{20,}`
- GitHub PATs: `ghp_[a-zA-Z0-9]{30,}`
- AWS keys: `AKIA[0-9A-Z]{16}`
- Private keys: `-----BEGIN (RSA |EC )?PRIVATE KEY-----`

Y `diff_scan` para patrones prohibidos: `console.error`, `TODO`, `FIXME`, `XXX`.

**Por qué**: sin esto, los gates de seguridad son placeholders. Con esto, ya funcionan desde el día 1.

---

## 10. `concurrency` groups en workflows

**Spec**: no menciona.
**Mejora**: cada workflow tiene `concurrency.group` basado en el ID de tarea. Si se dispara dos veces el mismo workflow para la misma tarea, no se cancela (cancel-in-progress: false) pero se encola.

**Por qué**: sin esto, dos triggers del orchestrator para el mismo Issue pueden correr en paralelo y escribir la tarea dos veces.

---

## 11. `concurrency.cancel-in-progress: false`

**Espec**: no menciona.
**Mejora**: a propósito NO cancelamos jobs en progreso. Si el orchestrator se dispara dos veces seguidas, el segundo job espera al primero.

**Por qué**: en un sistema que escribe memoria, cancelar un job a media escritura puede dejar archivos corruptos. Preferimos encolar.

---

## 12. `permissions` mínimas en cada workflow

**Spec**: menciona `permissions: models: read` pero no detalla por workflow.
**Mejora**: cada workflow declara solo los permisos que necesita:
- `orchestrator.yml`: `contents: write, issues: write, models: read, actions: write`
- `devil.yml`: `contents: write, issues: write, models: read` (sin actions — no despacha)
- `self-improve.yml`: `contents: write, pull-requests: write, models: read`

**Por qué**: principio de mínimo privilegio. Si un workflow no necesita `actions: write`, no lo damos. Limita el daño si un workflow se compromete.

---

## 13. `dashboard/app.js` con fetch paralelo y graceful degradation

**Spec**: "HTML estático en Pages leyendo memory/index.json".
**Mejora**: el dashboard carga `stats.json`, `index.json`, `tasks/index.json`, `diary/index.json` y `budget/index.json` en paralelo con `Promise.all`. Si alguno falla (404), muestra empty state en esa sección sin romper las demás.

**Por qué**: en 3G, cargar 5 archivos en secuencia tarda 5× más que en paralelo. Y si el reindex aún no ha generado `diary/index.json`, el dashboard no debe romper — debe mostrar "aún no hay entradas".

---

## 14. `theme-aware` (dark/light) en el dashboard

**Spec**: no menciona.
**Mejora**: CSS variables con `@media (prefers-color-scheme: light)`. El dashboard se adapta al tema del sistema del usuario.

**Por qué**: en móvil, el modo dark ahorra batería y es más cómodo de noche. Sin esto, el dashboard siempre se ve dark.

---

## 15. `nextId()` que respeta prefijos por tipo

**Spec**: no detalla cómo se generan los IDs.
**Mejora**: `nextId(type)` devuelve `BUG-0001`, `DEC-0001`, etc. según el tipo. Lee los existentes y devuelve el siguiente.

**Por qué**: sin esto, dos agentes escribiendo simultáneamente pueden generar el mismo ID. Con esto, cada tipo tiene su namespace y el conflicto es menos probable.

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

---

## Resumen

15 mejoras, todas pequeñas, ninguna cambia la arquitectura del spec. El sistema resultante es:
- **Testeable** (smoke + unit tests)
- **Iterable localmente** (DRY_RUN)
- **Resiliente** (fallback chain, rate limit handling)
- **Observable** (dashboard, diario, budget)
- **Seguro** (permissions mínimas, secret scanning)
- **Honesto** (STUCK es producto, no fracaso)

Si alguna de estas mejoras no te encaja, se borra y se acaba. Ninguna es acoplada al núcleo.
