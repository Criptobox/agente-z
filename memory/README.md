# Esquemas de memoria

Cada tipo de memoria vive en su subdirectorio de `memory/` y es un archivo `.md` con frontmatter YAML + cuerpo markdown.

Cada escritura es un commit → tienes historial, diff, autoría y rollback gratis.

## Tipos

| Tipo | Subdirectorio | Prefijo ID | Cuándo se escribe |
|---|---|---|---|
| error | `memory/errors/` | `BUG-XXXX` | Cuando un agente investiga/resuelve un bug |
| decision | `memory/decisions/` | `DEC-XXXX` | Cuando se toma una decisión arquitectónica |
| fact | `memory/facts/` | `FACT-XXXX` | Cuando se constata un hecho del código (no opina) |
| lesson | `memory/lessons/` | `LESSON-XXXX` | Tras un post-mortem del learner |
| criteria | `memory/criteria/` | `CRIT-XXXX` | Preferencia del usuario (memoria de criterio) |
| episode | `memory/episodes/` | `EPI-XXXX` | Un intento de un agente sobre una tarea |
| budget | `memory/budget/` | `BUDGET-XXXX` | Snapshot de gasto (lo escribe el budget agent) |
| diary | `memory/diary/` | `DIARY-XXXX` | Snapshot del diario (lo escribe el diarist) |
| project | `memory/projects/` | `<name>` | Memoria de proyecto (una por proyecto externo) |

## Regla de oro

**Es preferible escribir 0 memorias que escribir ruido.** El sistema muere de ruido, no de falta de datos. Si una memoria no va a ahorrarle trabajo real a otro agente en el futuro, no la escribas.

## Invalidación (sección 6 del spec)

Toda memoria guarda `files`, `symbols` y `commit`. El workflow nocturno `reindex.yml` compara el HEAD actual del proyecto externo contra ese commit. Si un archivo referenciado cambió, la memoria se marca `stale: true` y su `confidence` baja automáticamente.

Un agente que recupere una memoria stale **debe reverificarla contra el código actual antes de usarla**, y luego confirmarla o invalidarla.

Nada se borra jamás. `invalidated_by` deja la traza.
