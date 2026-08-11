# AGENTS — guía de los 10 agentes

Cada agente es un archivo `.md` en `agents/` con frontmatter YAML (rol, tools, permisos, autonomía) + cuerpo markdown (instrucciones del system prompt). El `runner.js` carga esta definición en runtime y la inyecta en el prompt.

---

## Agentes del spec original (F0-F5)

### `orchestrator`
**Rol**: dispatcher principal. Recibe Issues, crea TASK-XXXX con Definition of Done, despacha agentes.
**Cuándo entra**: Issue nuevo con label `agent-task` · comentario `/approve` · workflow_dispatch manual.
**Tools**: file_read, file_write, search_memory, github_api, issue_comment.
**Permisos**: read, write, github_api, issues:write.
**Autonomía**: autonomous.
**Poder especial**: es el único que puede crear tareas y despachar otros agentes.

### `code`
**Rol**: arregla bugs en proyectos externos (TiendaMax, AXONTECH).
**Cuándo entra**: handoff desde `orchestrator` (bug en código) · handoff desde `research` (causa raíz identificada) · handoff desde `test` (regresión detectada).
**Tools**: file_read, file_write, search_memory, gate_check, github_api, read_project_file.
**Permisos**: read, write, execute, github_api, issues:write.
**Autonomía**: assisted (necesita aprobación para escribir en producción).
**Antimanifesto**: no tapa síntomas, no reescribe módulos enteros, no añade `!important` ni `as any`.

### `research`
**Rol**: investiga causa raíz antes de que `code` toque nada.
**Cuándo entra**: handoff desde `orchestrator` (Issue complejo) · handoff desde `code` (nivel 2 de escalado: cuestionar diagnóstico) · handoff desde `code` (nivel 3: cambio de agente).
**Tools**: file_read, search_memory, github_api, read_project_file, issue_comment.
**Permisos**: read, github_api, issues:write (sin write — no propone fixes, solo diagnostica).
**Salida clave**: un finding HYPOTHESIS con confidence ≤ 70 si no ha verificado, o FACT con confidence ≥ 80 si leyó el código.

### `test`
**Rol**: verificador independiente. Ejecuta gates y declara pass/fail.
**Cuándo entra**: handoff desde `code` cuando declara terminado · handoff desde `orchestrator` para cerrar tarea.
**Tools**: file_read, gate_check, search_memory, issue_comment.
**Permisos**: read, execute, issues:write (sin write — no modifica código).
**Regla #1**: el agente que hace el trabajo NUNCA declara el éxito. El éxito lo declara `test` contra gates escritos ANTES de empezar.

### `security`
**Rol**: audita diffs, secretos, antipatrones.
**Cuándo entra**: handoff desde `code` cuando toca auth/payments · cron nocturno · trigger manual con label `security-audit`.
**Tools**: file_read, search_memory, github_api, read_project_file, issue_comment.
**Permisos**: read, github_api, issues:write.
**Salida**: `security_findings` con { severity, pattern, file, line, evidence }.

---

## Agentes de extensión (las 5 nuevas)

### `devil` 😈
**Rol**: abogado del diablo permanente. Rompe el consenso.
**Cuándo entra**: tras CADA handoff de cualquier agente (lo triggerea `agent-run.yml`).
**Tools**: file_read, search_memory, read_project_file (sin write, sin github_api — solo lee y opina).
**Permisos**: read.
**Poder especial**: si BLOCK, añade los `missing_gates` que propone a la tarea. La siguiente iteración no puede cerrarse sin pasarlos.
**Limitación**: NO puede aprobar. Solo puede BLOCKAR con razón objetivable.

### `learner` 📝
**Rol**: post-mortem al cerrar tarea. Propone lecciones.
**Cuándo entra**: tras cierre de tarea (status=completed o stuck).
**Tools**: file_read, search_memory, file_write.
**Permisos**: read, write.
**Regla innegociable**: solo escribe lección si la respuesta a "¿qué habría hecho esto 3× más rápido?" es concreta y aplicable.

### `budget` 💰
**Rol**: vela por la cuota gratis de tokens y minutos.
**Cuándo entra**: cron horario + post-turno (lo triggerea `agent-run.yml`).
**Tools**: file_read, search_memory, github_api, issue_comment.
**Permisos**: read, github_api, issues:write.
**Poder especial**: si THROTTLE, marca tareas en cola como `throttled` (no se ejecutan hasta el día siguiente).

### `diarist` 📅
**Rol**: escribe un resumen diario de una frase en un Issue.
**Cuándo entra**: cron nocturno (3 AM hora local).
**Tools**: file_read, search_memory, github_api, issue_comment.
**Permisos**: read, github_api, issues:write.
**Salida**: 1 headline (máx 120 chars) + 3-5 bullets + pendiente para mañana. Con highlight: ok | stuck | warning | quiet.

### `self_improver` 🤖
**Rol**: lee su propio historial y abre PRs para cambiar `agents/*.md`.
**Cuándo entra**: cron semanal (domingo 4 AM) + trigger manual.
**Tools**: file_read, search_memory, github_api.
**Permisos**: read, github_api (sin write directo — siempre vía PR).
**Poder especial**: crea branch + commit + PR vía GitHub API.
**Limitación**: NUNCA mergeea. El usuario decide.

---

## Tabla de permisos

| Agente | read | write | execute | github_api | issues:write |
|---|---|---|---|---|---|
| orchestrator | ✅ | ✅ | — | ✅ | ✅ |
| code | ✅ | ✅ | ✅ | ✅ | ✅ |
| research | ✅ | — | — | ✅ | ✅ |
| test | ✅ | — | ✅ | — | ✅ |
| security | ✅ | — | — | ✅ | ✅ |
| devil | ✅ | — | — | — | — |
| learner | ✅ | ✅ | — | — | — |
| budget | ✅ | — | — | ✅ | ✅ |
| diarist | ✅ | — | — | ✅ | ✅ |
| self_improver | ✅ | — | — | ✅ | — |

---

## Escalado entre agentes (sección 12.4 del spec)

| Nivel | Disparador | Acción |
|---|---|---|
| 1 | Fallo normal | Nueva estrategia dentro del mismo enfoque |
| 2 | Mismo error 2 veces | Handoff a `research` para cuestionar el diagnóstico |
| 3 | Mismo error 3 veces | Cambio de agente (contexto reconstruido desde cero) |
| 4 | Sigue fallando | `research` busca fuera (bug de librería conocido) |
| 5 | Presupuesto agotado | STUCK → humano con informe útil |

---

## Cómo añadir un agente nuevo

1. Copia `agents/_template.md` a `agents/<name>.md`.
2. Rellena frontmatter (role, tools, permissions, autonomy).
3. Escribe el system prompt en el cuerpo markdown.
4. Si necesita lógica especial, crea `src/agents/<name>.js`.
5. Si necesita un workflow, crea `.github/workflows/<name>.yml`.
6. Si despacha otros agentes, añádelo a la cadena de `orchestrator.js`.

No necesitas tocar `runner.js` — lee cualquier `.md` en `agents/` y lo carga.
