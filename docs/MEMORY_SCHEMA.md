# MEMORY_SCHEMA — esquemas detallados

Cada tipo de memoria es un archivo `.md` con frontmatter YAML + cuerpo markdown. Esta página documenta todos los campos de cada tipo.

---

## Tipos de memoria

| Tipo | Subdirectorio | Prefijo ID | Cuándo se escribe |
|---|---|---|---|
| error | `memory/errors/` | `BUG-XXXX` | Cuando un agente investiga/resuelve un bug |
| decision | `memory/decisions/` | `DEC-XXXX` | Cuando se toma una decisión arquitectónica |
| fact | `memory/facts/` | `FACT-XXXX` | Cuando se constata un hecho del código |
| lesson | `memory/lessons/` | `LESSON-XXXX` | Tras un post-mortem del learner |
| criteria | `memory/criteria/` | `CRIT-XXXX` | Preferencia del usuario (memoria de criterio) |
| episode | `memory/episodes/` | `EPI-XXXX` | Un intento de un agente sobre una tarea |
| budget | `memory/budget/` | `BUDGET-XXXX` | Snapshot de gasto del budget agent |
| diary | `memory/diary/` | `DIARY-XXXX` | Entrada del diario del diarist |
| project | `memory/projects/` | `<name>` | Memoria de un proyecto externo |

---

## error (BUG-XXXX)

```yaml
---
id: BUG-0001
type: error
project: tiendamax
title: "calculateTotal devuelve NaN al eliminar producto"
status: open          # open | investigating | resolved | regressed
severity: high        # low | medium | high | critical
confidence: 70        # 0-100 (ver calibración)
verified_by: null     # TEST-XXX si lo verificó un test
files: [js/cart.js]
symbols: [calculateTotal, removeItem]
created: 2026-08-11
updated: 2026-08-11
agent: code           # quién escribió esta memoria
commit: a81f2c4       # SHA del proyecto externo cuando se escribió
supersedes: null      # ID de memoria que esta reemplaza
invalidated_by: null  # TASK-XXXX que la invalidó
stale: false          # true si el archivo referenciado cambió
tags: [carrito, nan, referencia-invalida]
---

## Problema
<síntoma>

## Causa raíz
<por qué pasa>

## Intentos
### Intento 1 — FALLÓ
<qué se probó>
Resultado: <qué pasó>
Aprendizaje: <qué se aprendió>

### Intento 2 — FUNCIONÓ
<qué se probó>
Resultado: <evidencia objetiva>

## Verificación
<TEST-XXX: N/M passed, o evidencia equivalente>
```

### Campo crítico: Intento 1 fallido
Lo más importante de un BUG no es la solución — es el **intento fallido**. Eso es lo que impide que dentro de tres meses otro agente pierda una hora repitiéndolo.

---

## decision (DEC-XXXX)

```yaml
---
id: DEC-0001
type: decision
project: tiendamax
title: "Firebase Realtime DB en lugar de Firestore"
status: active        # active | superseded | reverted
confidence: 90
alternatives_rejected: [firestore, supabase]
created: 2026-08-11
agent: orchestrator
supersedes: null
superseded_by: null
---

## Decisión
<qué se decidió>

## Motivo
<por qué, no qué>

## Alternativas rechazadas
- <alternativa 1>: <por qué no>

## Cuándo reconsiderar
<condiciones que invalidarían esta decisión>
```

### Campo crítico: "Cuándo reconsiderar"
Este campo **no estaba en el spec original** y es el que evita que las decisiones se conviertan en dogma. Sin él, una decisión tomada en agosto sigue vigiendo en diciembre aunque las circunstancias hayan cambiado.

---

## fact (FACT-XXXX)

```yaml
---
id: FACT-0001
type: fact
project: tiendamax
statement: "Las llamadas a la API usan _tmFetch(), nunca fetch() directo."
evidence: [js/script.src.js:L120]
confidence: 100       # 100 solo si se leyó en código actual
verified: true
created: 2026-08-11
agent: code
commit: a81f2c4
files: [js/script.src.js]
symbols: [_tmFetch]
stale: false
---

## Verificación
<dónde se leyó, en qué commit>
```

### Regla
Un FACT con confidence 100 debe tener `verified: true` y `evidence` con archivo:línea. Si no, es HYPOTHESIS disfrazado.

---

## lesson (LESSON-XXXX)

```yaml
---
id: LESSON-0014
type: lesson
scope: general              # general | project:<name>
project: null
title: "NaN en cálculos suele ser integridad referencial"
trigger: "NaN|undefined en cálculos, totales incorrectos"
files_pattern: ["*cart*", "*total*", "*precio*"]
rule: "Antes de sanear el tipo, verificar integridad referencial del dato."
anti_pattern: "Number(x) || 0 como arreglo de un NaN"
born_from: [BUG-001]        # bugs/tareas que la originaron
times_applied: 0            # métrica de uso
times_prevented_failure: 0  # métrica de eficacia
times_ignored: 0            # métrica de calidad del trigger
promoted_to_rule: false     # true cuando se promueve a agents/*.md
archived: false             # true cuando se archiva por frío
confidence: 85
created: 2026-08-11
task_id: TASK-0042
---

## Origen
<en qué tarea o bug nació>

## Por qué importa
<qué habría pasado 3× más rápido si se hubiera sabido antes>
```

### Selección natural (sección 13.5)
- `times_prevented_failure >= 3` → promoción a regla (PR del self_improver).
- `times_applied == 0` a los 60 días → archivar.
- `times_ignored > times_applied` → mal escrita, marcar para reescribir.
- Máximo 12 reglas promovidas por agente.

---

## criteria (CRIT-XXXX)

```yaml
---
id: CRIT-0001
type: criteria
title: "Prefiere archivos completos sobre snippets"
criterion: "Cuando un agente lee o muestra código, prefiere el archivo completo contextualmente sobre snippets sueltos."
rationale: "El usuario pierde el contexto cuando un agente muestra 5 líneas sueltas."
scope: general             # general | project:<name> | agent:<name>
status: active             # active | retired
enforced_since: 2026-08-11
violated_count: 0          # métrica de cumplimiento
last_violated_by: null     # TASK-XXXX que la violó
created: 2026-08-11
---

## Contexto
<cuándo se identificó esta preferencia>

## Cómo se aplica
<qué hacen los agentes>

## Cuándo retirar
<condiciones>
```

### Carga
Los criterios se cargan TODOS en cada turno (no hay búsqueda — son pocos y estables). El Context Engine los inyecta en la sección "CRITERIOS DEL USUARIO" del prompt.

---

## episode (EPI-XXXX)

```yaml
---
id: EPI-0001
type: episode
project: tiendamax
task_id: TASK-0042
attempt: 1
agent: code
strategy: "Filtrar líneas huérfanas antes de reducir"
gates_failed: [G3]
gates_passed: [G1, G2]
result: NEW            # REUSE | CONTINUE | NEW | STUCK
needs_human: false
created: 2026-08-11T14:00:00Z
---

## Handoff
<JSON del handoff generado por el agente>
```

### Uso
Los episodios son la **entrada para la detección de repetición** (sección 12.3, paso [6]). El Context Engine los carga todos al inicio de un turno, para que el agente vea qué se intentó antes.

---

## budget (BUDGET-XXXX)

```yaml
---
id: BUDGET-0001
type: budget
kind: OK            # OK | WARN | THROTTLE
date: 2026-08-11
tokens_used: 45000
tokens_limit: 120000
tokens_percent: 38
minutes_estimated: 12
minutes_limit: 180
minutes_percent: 7
calls: 23
failures: 1
tasks_throttled: 0
created: 2026-08-11T15:00:00Z
---

# Budget snapshot 2026-08-11

- Tokens: 45000/120000 (38%)
- Minutos: 12/180 (7%)
- Action: OK
```

---

## diary (DIARY-XXXX)

```yaml
---
id: DIARY-0001
type: diary
date: 2026-08-11
headline: "Arreglado bug del carrito (TASK-0042). 1 lección nueva sobre NaN."
highlight: ok        # ok | stuck | warning | quiet
stuck_tasks: []
new_lessons: [LESSON-0014]
tomorrow_hint: "Revisar si el mismo bug existe en checkout.js"
created: 2026-08-11T03:00:00Z
---

# Diario 2026-08-11

- TASK-0042 cerrada con éxito. 3 intentos, 2 lessons aplicadas.
- Budget: 38% tokens, 7% minutos. OK.
- Devil: 1 BLOCK superado (missing gate G3 añadido).
```

---

## project (memory/projects/\<name\>.md)

```yaml
---
id: tiendamax
type: project
title: TiendaMax
repo: tiendamax/tiendamax-web
created: 2026-08-11
last_audited: null
health: unknown      # unknown | healthy | warning | critical
tags: [e-commerce, vanilla-js]
---

# TiendaMax

## Descripción
<descripción>

## Stack
- Frontend: vanilla JS
- Backend: Firebase Realtime DB
- Hosting: Firebase Hosting

## Decisiones activas
<se llena automáticamente>

## Bugs conocidos
<se llena automáticamente>
```

---

## Calibración de confidence

| Nivel | Significado |
|---|---|
| 100 | Verificado por test que pasa, o leído directamente en el código actual |
| 90 | Leído en código pero sin ejecutar |
| 70 | Deducido de evidencia fuerte y consistente |
| 50 | Hipótesis plausible sin evidencia directa |
| 30 | Conjetura |

**Regla**: un HYPOTHESIS con confidence > 70 sin verificación es un error tuyo. Si no puedes justificar el número, es demasiado alto.

---

## Invalidación (sección 6 del spec)

Toda memoria guarda `files`, `symbols` y `commit`. El workflow nocturno `reindex.yml` compara el HEAD actual del proyecto externo contra ese commit. Si un archivo referenciado cambió, la memoria se marca `stale: true` y su `confidence` baja automáticamente (×0.6, mín 30).

Un agente que recupere una memoria stale **debe reverificarla contra el código actual antes de usarla**, y luego confirmarla o invalidarla.

Nada se borra jamás. `invalidated_by` deja la traza.
