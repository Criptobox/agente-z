# agent-brain

> Sistema multi-agente con memoria compartida sobre GitHub — coste cero, sin servidor, operable desde móvil en 3G.

[![Smoke test](https://github.com/OWNER/agent-brain/actions/workflows/smoke.yml/badge.svg)](https://github.com/OWNER/agent-brain/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Este repositorio implementa la especificación de un sistema multi-agente donde:
- El **runtime** es GitHub Actions (gratis en repos públicos).
- Los **modelos de IA** son GitHub Models con `GITHUB_TOKEN` (gratis, sin tarjeta).
- La **base de datos** son archivos JSON/MD versionados en el repo.
- La **interfaz principal** es un Issue de GitHub.

---

## 🚀 Arranque en 5 minutos

### 1. Crea el repo
```bash
# Crea un repo PÚBLICO en GitHub (así Actions es ilimitado)
# Sube todo el contenido de agent-brain/
git init && git add . && git commit -m "init: agent-brain"
git remote add origin git@github.com:USER/agent-brain.git
git push -u origin main
```

### 2. Configura Variables y Secrets
En `Settings → Secrets and variables → Actions → Variables`:

| Variable | Valor | Notas |
|---|---|---|
| `TARGET_REPOS` | `tiendamax/tiendamax-web` | Repo(s) externo(s) que los agentes van a analizar |
| `MODELS_PRIMARY` | `gpt-4o-mini` | Modelo primario |
| `MODELS_FALLBACK` | `phi-3-mini-4k-instruct` | Fallback si el primario cae |
| `EMBEDDINGS_MODEL` | `text-embedding-3-small` | Para búsqueda semántica |
| `BUDGET_DAILY_TOKENS` | `120000` | Cuota diaria estimada |
| `BUDGET_DAILY_ACTIONS_MINUTES` | `180` | Cuota de minutos de Actions |
| `BUDGET_WARN_PERCENT` | `80` | A partir de qué % avisar |
| `TIMEZONE` | `America/Havana` | Para el cron del diario |
| `WEB_ENABLED` | `true` | Habilita web_search/web_fetch (default true) |
| `OLLAMA_ENDPOINT` | `http://localhost:11434/v1` | (opcional) Endpoint Ollama/llama.cpp para inferencia local |
| `OLLAMA_MODEL` | `qwen2.5:7b` | (opcional) Modelo local a usar como último fallback |

**Secrets** (opcionales, solo si quieres fallback externo):
- `GROQ_API_KEY` — fallback Groq
- `GEMINI_API_KEY` — fallback Gemini
- `OLLAMA_KEY` — (opcional) Bearer token si tu Ollama server requiere auth

El `GITHUB_TOKEN` lo inyecta Actions automáticamente, no lo configures.

### 3. Habilita GitHub Pages
`Settings → Pages → Source: GitHub Actions`. El workflow `reindex.yml` publica el dashboard automáticamente.

### 4. Prueba el loop mínimo
Abre un Issue:
```
Title: El checkout de TiendaMax falla al pagar con tarjeta
Labels: agent-task
Body: (lo que quieras, opcional)
```

El orchestrator se dispara automáticamente. En 1-2 min verás un comentario con el contexto recuperado y la tarea creada. Después vendrán los handoffs de los agentes.

### 5. Smoke test local (opcional, sin GitHub)
```bash
cp .env.example .env
# deja .env vacío, solo DRY_RUN=1
npm run smoke
```
Esto ejecuta el loop completo con respuestas mockeadas. No llama a la API real.

---

## 🧠 Filosofía

> **El criterio único de éxito:** que un agente diga *"esto ya se intentó y falló, por eso voy directo a la otra vía"* — y tenga razón.

Todo lo demás es andamiaje alrededor de esa frase.

### Reglas no negociables

1. **Nunca guardar conversación, siempre estructura.** Una memoria es un archivo .md con frontmatter YAML.
2. **Es preferible escribir 0 memorias que escribir ruido.** El sistema muere de ruido, no de falta de datos.
3. **El agente que hace el trabajo nunca declara el éxito.** Lo declara un verificador independiente, contra gates escritos ANTES de empezar.
4. **La verificación viene de una herramienta, no de una opinión.** Exit code, salida de test, diff. La frase "lo he revisado y está correcto" no es evidencia.
5. **Nada se borra jamás.** `invalidated_by` deja la traza.

---

## 🤖 Agentes

El sistema tiene 10 agentes. 5 son del spec original, 5 son extensiones nuevas:

| Agente | Rol | Origen |
|---|---|---|
| `orchestrator` | Recibe Issues, crea tareas con DoD, despacha | spec |
| `code` | Arregla bugs en código externo | spec |
| `research` | Investiga causa raíz antes de tocar código | spec |
| `test` | Verificador independiente — ejecuta gates | spec |
| `security` | Audita diffs, secretos, antipatrones | spec (F5) |
| **`devil`** | **Abogado del diablo** — rompe el consenso | **extensión** |
| `learner` | Post-mortem al cerrar tarea, propone lecciones | spec |
| **`budget`** | **Agente presupuesto** — vela por la cuota gratis | **extensión** |
| **`diarist`** | **Diario nocturno auto-escrito** | **extensión** |
| **`self_improver`** | **Auto-mejora** — abre PRs sobre agents/*.md | **extensión** |

Ver [`AGENTS.md`](AGENTS.md) para detalle de cada uno y [`EXTENSIONES.md`](EXTENSIONES.md) para la justificación de las 5 extensiones.

---

## 📁 Estructura del repo

```
agent-brain/
├── .github/workflows/      # 9 workflows (orchestrator, agent-run, devil, diary, budget-watch, ...)
├── agents/                 # 10 archivos .md con definiciones declarativas
├── memory/
│   ├── errors/             # BUG-XXXX
│   ├── decisions/          # DEC-XXXX
│   ├── facts/              # FACT-XXXX
│   ├── lessons/            # LESSON-XXXX (post-mortem del learner)
│   ├── criteria/           # CRIT-XXXX (memoria de criterio del usuario)
│   ├── episodes/           # EPI-XXXX (intentos de agentes)
│   ├── budget/             # BUDGET-XXXX (snapshots de gasto)
│   ├── diary/              # DIARY-XXXX (entradas del diario)
│   ├── projects/           # una memoria por proyecto externo
│   ├── index.json          # índice compacto
│   ├── vectors.json        # embeddings
│   └── stats.json          # métricas para dashboard
├── tasks/                  # TASK-XXXX.json
├── src/
│   ├── config.js           # entorno y constantes
│   ├── runner.js           # ciclo universal de agente
│   ├── orchestrator.js     # dispatcher principal
│   ├── reindex.js          # reconstrucción nocturna
│   ├── memory.js           # read/write/search híbrida
│   ├── context.js          # context engine
│   ├── models.js           # router de modelos con fallback
│   ├── tools/              # 7 tools (file_read, gate_check, github_api, ...)
│   └── agents/             # 5 agentes especializados (devil, learner, budget, diarist, self_improver)
├── dashboard/              # HTML estático → GitHub Pages
├── tests/                  # tests unitarios + smoke test
└── docs/                   # documentación extendida
```

---

## 🔄 Loop de convergencia

```
ENTRAR
  ↓
[0] Cargar lecciones aplicables → declarar pre-mortem
  ↓
[1] PLAN: estrategia S(n). Debe ser distinta a las falladas.
  ↓
[2] EJECUTAR
  ↓
[3] VERIFICAR ← agente distinto (test), gates objetivos, salida de herramienta
  ↓
[4] ¿Todos los gates en verde?
      SÍ → confidence = 98, escribir memoria, CERRAR
      NO ↓
[5] REGISTRAR el intento fallido (siempre, aunque sea el intento 1)
  ↓
[6] DIAGNÓSTICO DE PROGRESO:
      · ¿Mismo gate, mismo error? → REPETICIÓN. Subir de nivel.
      · ¿Gate distinto falla? → PROGRESO. Continuar.
      · ¿Se rompió un gate verde? → REGRESIÓN. Revertir.
  ↓
[7] ¿Presupuesto agotado?
      SÍ → STUCK. Informe útil para humano.
      NO → volver a [1]
```

**Lo que hace que converja no es el número de intentos — es el paso [6].** Sin detección de repetición, es un modelo probando sinónimos de la misma idea hasta agotar tu cuota.

Ver [`docs/OPERATIONS.md`](docs/OPERATIONS.md) para el runbook completo.

---

## 🆘 STUCK no es fracaso: es un producto

Al agotar el presupuesto, el sistema no dice "no pude". Genera un informe:

```markdown
## STUCK — TASK-0042

Gates verdes:   G2, G4, G5
Gate bloqueado: G3 (el total sigue siendo incorrecto tras eliminar)

Intentos (todos registrados en memoria):
1. Number()||0            → G3 falla. Oculta el síntoma.
2. Filtrar líneas nulas   → G3 falla. El id huérfano persiste en localStorage.
3. Limpiar en removeItem  → G1 pasa, G3 falla solo tras recargar página.

Hipótesis viva (confidence 74):
El carrito se rehidrata desde localStorage con un esquema antiguo.
El bug no está en cart.js sino en la serialización.

Lo que necesito de ti:
Confirmar si hay carritos guardados con formato anterior a la v2.
```

Eso es infinitamente más útil que 20 intentos ciegos.

---

## 📚 Documentación

- **[`DEPLOY.md`](DEPLOY.md)** — checklist de despliegue a GitHub en 30 min ⚡
- [`AGENTS.md`](AGENTS.md) — guía de los 10 agentes
- [`EXTENSIONES.md`](EXTENSIONES.md) — las 5 extensiones nuevas y por qué
- [`MEJORAS.md`](MEJORAS.md) — mejoras level-up aplicadas sobre el spec
- [`docs/OPERATIONS.md`](docs/OPERATIONS.md) — runbook: cómo operar el sistema día a día
- [`docs/MEMORY_SCHEMA.md`](docs/MEMORY_SCHEMA.md) — esquemas de memoria detallados

---

## 📜 Licencia

MIT — ver [`LICENSE`](LICENSE).
