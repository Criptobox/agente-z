# OPERATIONS — runbook

Cómo operar el sistema día a día desde el móvil en 3G.

---

## Rutina diaria

### Mañana (1 min)
1. Abres la app de GitHub.
2. Revisas el Issue `📊 Diario — YYYY-MM-DD` (lo abre el diarist a las 3 AM).
3. Lees el headline + bullets. Si hay `🚨 stuck` o `⚠️ warning`, los atiendes.
4. Si hay un PR de auto-mejora (`self-improvement` label), lo revisas cuando tengas 5 min.

### Durante el día (cuando puedas)
- Si abriste un Issue con `agent-task`, los comentarios van llegando. No tienes que hacer nada — solo leer.
- Si un agente pide `/approve`, comentas `/approve` en el Issue cuando estés de acuerdo.
- Si el budget agent comenta con `⚠️ WARN`, decides si priorizas o dejas que siga.

### Noche (0 min)
- El sistema hace todo: reindex, diario, throttle si hace falta.
- Tú no haces nada.

---

## Tipos de Issues que verás

### Issue con label `agent-task`
Lo abres tú. El orchestrator lo procesa y crea TASK-XXXX. Verás:
1. Comentario inicial del orchestrator con contexto recuperado y gates propuestos.
2. Comentario de handoff del primer agente.
3. Comentario del devil (abogado del diablo).
4. Si todo va bien, comentario del test declarando success.
5. Comentario del learner con post-mortem.
6. Issue se cierra.

### Issue con label `daily-diary`
Lo crea el diarist. Cada día uno nuevo. Comentarios = snapshots diarios.

### Issue con label `auto-generated`
Variante de los anteriores. Filtra por esta label si quieres ver todo lo auto-generado.

### Pull Request con label `self-improvement`
Lo abre el self_improver. Revisa el diff, aprueba o cierra sin merger.

---

## Comandos que puedes escribir en Issues

| Comando | Dónde | Efecto |
|---|---|---|
| `/approve` | Comentario en Issue con tarea `needs_human` | Reanuda el agente que pidió permiso |
| (cualquier Issue con label `agent-task`) | Issue nuevo | Dispara el orchestrator |
| `agent-task` label | Label en Issue existente | Dispara el orchestrator sobre ese Issue |

---

## Workflows que puedes disparar manualmente

En `Actions` → `Run workflow`:

| Workflow | Cuándo dispararlo |
|---|---|
| `orchestrator` | Para re-procesar un Issue concreto |
| `agent-run` | Para ejecutar un agente concreto sobre una tarea concreta |
| `devil` | Para auditar una tarea concreta |
| `learner` | Para forzar post-mortem de una tarea |
| `budget-watch` | Para forzar snapshot de presupuesto |
| `reindex` | Para reconstruir índice + embeddings (con `--force` si quieres recalcular todos) |
| `self-improve` | Para forzar propuesta de auto-mejora |
| `diary` | Para forzar escritura del diario |

---

## Qué hacer cuando algo se rompe

### El presupuesto se agota antes de tiempo
1. Revisa `memory/budget/BUDGET-XXXX.md` para ver qué tarea consumió más.
2. Si es una tarea en loop de repetición, márcala `stuck` manualmente editando `tasks/TASK-XXXX.json`.
3. Sube `BUDGET_DAILY_TOKENS` en Variables si tu tier lo permite, o prioriza tareas.

### Un agente repite la misma estrategia fallida
1. El sistema debería detectarlo solo (nivel 2 de escalado). Si no lo hace, interviene.
2. Edita `tasks/TASK-XXXX.json` y añade un comentario en el Issue describiendo el diagnóstico correcto.
3. El siguiente agente leerá tu comentario y el historial de intentos.

### La memoria se llena de ruido
1. Revisa `memory/index.json` para ver cuántas memorias hay por tipo.
2. Si hay muchas con confidence < 50, están degradando la búsqueda.
3. Marca `archived: true` en las que sean ruido (no las borres — `invalidated_by` deja traza).
4. El `reindex.yml` nocturno archiva lecciones frías automáticamente (>60 días sin uso).

### El diario no se escribe
1. Revisa `Actions` → `diary` → ver si el cron corrió.
2. Si falló por timeout de inferencia, dispara `diary` manualmente.
3. Si falla repetidamente, baja la complejidad del prompt en `agents/diarist.md`.

### El dashboard no carga
1. Verifica que `memory/index.json` y `memory/stats.json` existen (los genera `reindex.yml`).
2. Si no existen, dispara `reindex` manualmente.
3. Si Pages no está configurado, en `Settings → Pages → Source: GitHub Actions`.

---

## Mantenimiento semanal

### Revisar lecciones activas
1. En el dashboard, sección "Lecciones activas".
2. Si alguna tiene `times_applied == 0` y >60 días, se archiva sola.
3. Si alguna tiene `times_ignored > times_applied`, está mal escrita — reescribela o archiva.

### Revisar PRs de auto-mejora
1. `Pull requests` → filtra por label `self-improvement`.
2. Para cada PR: lee la rationale, revisa el diff.
3. Si apruebas, merge. Si no, cierra sin merger con un comentario explicando.

### Ajustar presupuesto
1. Revisa `memory/budget/` — mira los snapshots de la última semana.
2. Si consistentemente pasas del 80%, sube `BUDGET_DAILY_TOKENS` o prioriza tareas.
3. Si nunca pasas del 30%, baja el límite para que el `WARN` sea significativo.

---

## Mantenimiento mensual

### Limpiar criterios retirados
1. `memory/criteria/` — revisa los `status: retired`.
2. Si llevan >30 días retirados, muévelos a `memory/criteria/archived/`.

### Auditar agentes
1. Revisa `agents/*.md` — ¿las reglas siguen siendo correctas?
2. Si una regla promueve un antipatrón (ej: "usar !important para todo"), retírala.
3. Documenta el cambio en un commit con mensaje claro.

### Revisar métrica clave
> **Intentos promedio hasta el primer gate verde, por mes.**

Si en agosto son 3.4 y en octubre son 2.1, el sistema está aprendiendo. Si no baja, las lecciones son decorativas — arregla el post-mortem, no añadas más agentes.

---

## Cuándo intervenir manualmente

El sistema está diseñado para funcionar solo. Pero hay momentos donde tu intervención es necesaria:

1. **STUCK con hipótesis viva**: el sistema te pide confirmar algo (ej: "¿hay carritos guardados con formato anterior a la v2?"). Responde en el Issue.
2. **Conflicto de conocimiento** (KNOWLEDGE_CONFLICT): dos memorias se contradicen. Decide cuál queda como DECISION.
3. **PR de auto-mejora**: apruebas o rechazas.
4. **Cambio de preferencia**: si dejaste de preferir algo (ej: ya no trabajas mobile-only), edita el criterio correspondiente en `memory/criteria/`.

Para todo lo demás, el sistema se las arregla solo.
