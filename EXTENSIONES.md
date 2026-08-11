# EXTENSIONES — las 5 que se añadieron sobre el spec

El usuario propuso 5 extensiones en su nota inicial. Esta es la justificación de cada una y cómo se implementaron.

---

## 1. 😈 Abogado del diablo permanente

> *"Un agente cuyo único trabajo es dudar del consenso. Cuando todos los agentes están de acuerdo, este pregunta '¿y si el test estaba mal escrito y por eso pasa?'. El fallo más caro de estos sistemas no es equivocarse — es equivocarse en grupo con confianza alta."*

### Por qué es crítico
La sección 12.1 del spec ya identifica el peligro: un modelo al que le exiges terminar puede **declarar éxito falso**. Pero el spec no prevé el fallo más sutil: **varios agentes de acuerdo con confianza alta sobre un éxito falso**. Si `code` arregla, `test` verifica y `orchestrator` aprueba, los tres pueden estar mal sin que nadie lo dude.

El abogado del diablo es el único rol en el sistema que **no puede aprobar**. Solo puede BLOCKAR con razón objetivable.

### Implementación
- **Archivo**: `agents/devil.md` (definición) + `src/agents/devil.js` (script)
- **Workflow**: `.github/workflows/devil.yml` — se triggerea automáticamente tras cada handoff (lo lanza `agent-run.yml`).
- **5 preguntas obligatorias**:
  1. ¿Y si el test está mal escrito y por eso pasa?
  2. ¿Las memorias citadas como REUSE son stale?
  3. ¿La confidence ≥90 tiene evidencia real?
  4. ¿Falta un gate que habría roto la solución?
  5. ¿El agente cuestionó el diagnóstico inicial?
- **Poder real**: si BLOCK, añade los `missing_gates` que propone a la tarea. La siguiente iteración no puede cerrarse sin pasarlos.

### Coste
~200 líneas de código + 1 workflow. Se ejecuta 1 vez por handoff. Asume ~5k tokens por análisis. Para 20 tareas/día son 100k tokens — dentro del tier gratuito.

---

## 2. 🧠 Memoria de criterio (no solo de hechos)

> *"El sistema aprende bugs. Lo que no aprende es cómo decides tú. Que aprenda que prefieres archivos completos sobre snippets, que trabajas mobile-only, que odias el !important acumulado — y que aplique eso sin que se lo repitas."*

### Por qué es crítico
La memoria de hechos evita repetir errores técnicos. Pero el sistema puede estar técnicamente correcto y **culturalmente equivocado**: usa snippets cuando tú prefieres archivos completos, te manda comentarios de 5000 chars cuando estás en 3G desde el móvil, añade `!important` cuando lo odias.

La memoria de criterio captura **cómo decides tú**, no qué sabes tú. Es lo que hace que se sienta un hermano y no una herramienta.

### Implementación
- **Tipo de memoria nuevo**: `criteria` con prefijo `CRIT-XXXX`.
- **Esquema**: `criterion`, `rationale`, `scope`, `status`, `violated_count`, `last_violated_by`.
- **Carga**: el Context Engine carga TODOS los criterios activos en cada turno (no hay búsqueda — son pocos y estables).
- **Sembrado inicial**: ya creamos 3 criterios basados en la nota del usuario:
  - `CRIT-0001`: prefiere archivos completos sobre snippets
  - `CRIT-0002`: trabaja mobile-only en 3G
  - `CRIT-0003`: odia `!important` acumulado
- **Auto-aprendizaje**: cuando un usuario rechaza repetidamente un tipo de output, el `learner` puede proponer un nuevo criterio. Pendiente de iteración 2.

### Coste
~50 líneas extra en `context.js` + esquema. Sin workflow adicional.

---

## 3. 💰 Agente presupuesto

> *"Un agente que vigila tu cuota gratis de tokens y mata tareas que se te comen el día antes de dejarte seco. En 3G y tier gratuito, quedarte sin cuota a media tarea es el fallo más real que vas a tener."*

### Por qué es crítico
El tier gratuito de GitHub Models tiene límites bajos (del orden de miles de tokens/minuto). Una tarea que entra en loop de repetición puede agotar la cuota diaria en 30 minutos. Sin este agente, te quedas seco a media tarde y no puedes trabajar en nada más.

### Implementación
- **Archivo**: `agents/budget.md` + `src/agents/budget.js`
- **Workflow**: `.github/workflows/budget-watch.yml` — cron horario + trigger post-turno.
- **3 niveles**:
  - `OK` (< 80%): silencio.
  - `WARN` (≥ 80%): comenta en el Issue diario.
  - `THROTTLE` (≥ 100%): marca tareas en cola como `throttled` y comenta.
- **Recuperación**: tareas `throttled` se reanudan al día siguiente (cron de medianoche).
- **Excepción**: si una tarea está en su intento 4/5 y queda throttled, NO se reanuda — se queda en `stuck` para que el learner haga post-mortem.

### Coste
~150 líneas + 1 workflow que corre cada hora. Sin llamadas a inferencia (solo lee archivos locales).

---

## 4. 📅 Diario nocturno auto-escrito

> *"Cada noche, un resumen de una frase de lo que el sistema hizo y aprendió, en un Issue. Abres la app por la mañana y sabes qué pasó mientras atendías la tienda. Continuidad real."*

### Por qué es crítico
El usuario tiene una tienda que atender. No puede vigilar el sistema. Pero necesita **continuidad**: saber qué pasó sin tener que preguntar. El diario es la diferencia entre "un sistema que trabaja para mí" y "un sistema que tengo que operar".

### Implementación
- **Archivo**: `agents/diarist.md` + `src/agents/diarist.js`
- **Workflow**: `.github/workflows/diary.yml` — cron a las 3 AM hora local.
- **Issue diario**: busca o crea un Issue con label `daily-diary` y título `📊 Diario — YYYY-MM-DD`.
- **Formato**: 1 headline (máx 120 chars) + 3-5 bullets + pendiente para mañana.
- **Highlight**: `ok` | `stuck` | `warning` | `quiet` — con emoji para skimmabilidad móvil.
- **Honestidad**: si el día estuvo mal (todo STUCK, fallos de inferencia, presupuesto agotado), lo dice claro. El diario no es marketing.

### Coste
~150 líneas + 1 workflow diario. Una llamada a inferencia de ~2k tokens.

---

## 5. 🤖 Auto-mejora por PR

> *"Que el sistema proponga sus propias mejoras. Un agente que lee su propio historial y abre un PR: 'llevo 6 tareas fallando el mismo gate; propongo cambiar esta regla de mi prompt.' Auto-mejora real, con tu aprobación en el PR. Eso es la sección 39 de tu spec cumplida de verdad."*

### Por qué es crítico
El spec ya contempla lecciones (nivel 2) y reglas en `agents/*.md` (nivel 3). Pero el salto de lección a regla **lo hacía un humano manualmente**. Sin automatizar ese salto, las lecciones se acumulan y nunca se promueven — el prompt no evoluciona.

El auto-mejorador cierra el loop: lee qué lecciones han prevenido fallo 3+ veces, genera un patch concreto al archivo `agents/*.md` correspondiente, abre un PR. El usuario aprueba o no.

### Implementación
- **Archivo**: `agents/self_improver.md` + `src/agents/self_improver.js`
- **Workflow**: `.github/workflows/self-improve.yml` — cron semanal (domingo 4 AM) + trigger manual.
- **Trigger de promoción**: `times_prevented_failure >= 3` en una lección.
- **Patch concreto**: añade una línea a una sección específica de un archivo `agents/*.md`. No edits vagos.
- **Límite**: máximo 12 reglas por agente (sección 13.5 del spec). Si se llega al límite, hay que retirar una para añadir otra — el PR debe justificar cuál.
- **NUNCA mergeea**: siempre PR, el usuario decide.

### Coste
~250 líneas + 1 workflow semanal. 1-3 PRs por semana como mucho (no abre PR por deporte).

---

## Sinergia entre las 5

Las 5 extensiones no son features aisladas. Forman un sistema:

1. **devil** detecta consensos sospechosos → **learner** registra el post-mortem → **self_improver** promueve lecciones a reglas → el prompt evoluciona.
2. **budget** evita que el sistema se muera de éxito (gastando cuota en reintentos inútiles) → **diarist** reporta el estado cada noche → el usuario decide qué ajustar.
3. **criteria** carga preferencias del usuario en cada contexto → todos los agentes las respetan sin que se las repitan.

El resultado: un sistema que **aprende de sus errores**, **duda de sus éxitos**, **cuida su presupuesto**, **se explica cada noche** y **se reescribe a sí mismo** con tu aprobación.
