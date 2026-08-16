# Mejoras pendientes — priorizadas

> Salidas de la revisión del 2026-08-16 (rama `fixes/revision-bugs`).
> Lo corregido ya está en esa rama; esto es lo que QUEDA por hacer.

---

## 🔴 Prioridad 1 — Seguridad

### 1. Endurecer la Edge Function chat-router
- Verificación JWT real (desplegar con `--verify-jwt` y exigir `Authorization: Bearer <anon key>` válido). El rate limit en memoria por isolate es mitigación básica, no garantía.
- Restringir CORS al dominio real del dashboard (GitHub Pages) en vez de `*`.
- **Esfuerzo:** bajo · **Riesgo si no se hace:** cualquiera que encuentre la URL puede quemar la `GROQ_API_KEY` y usar el modo proxy.

### 2. Cifrar secretos en reposo
- La migración guarda `user_settings.llm_api_key` y `github_token` en TEXT plano (el comentario "encriptado en producción" no está implementado).
- La PWA guarda PAT de GitHub, LLM keys y tokens de tiendas en localStorage sin cifrar.
- **Esfuerzo:** medio (pgcrypto en Supabase + derivación de clave por usuario en el cliente).

### 3. Migrar endpoint de GitHub Models (DEPRECATED)
- `models.inference.ai.azure.com` → `https://models.github.ai/inference`, con IDs tipo `openai/gpt-4o-mini`. Afecta `src/models.js:73`, `settings.js` y `streaming.js`.
- Añadir backoff exponencial ante 429/5xx (ahora la cadena de fallback se agota en segundos).
- **Esfuerzo:** bajo · **Riesgo si no se hace:** el sistema puede caer siempre al fallback.

---

## 🟠 Prioridad 2 — Fiabilidad del sistema

### 4. Carrera dispatch-antes-de-commit
- `orchestrator.js` dispara `repository_dispatch` DURANTE el job, pero `tasks/TASK-XXXX.json` se commitea al final → si el turno arranca antes del push, muere con "No existe tarea".
- **Fix propuesto:** que `orchestrator.js` commitee vía API (contents API) ANTES de despachar, o mover el dispatch al step posterior al commit.

### 5. Atomicidad de IDs y del índice
- `nextId()`/`nextTaskNum()` calculan el siguiente ID listando el directorio: dos workflows paralelos generan el mismo `TASK-/EPI-/BUDGET-XXXX` y se pisan.
- `budget-watch` se dispara tras CADA turno (`if: always()` en agent-run.yml) sin concurrency group → solapa con el cron horario y escribe un snapshot por turno (ruido en memoria).
- **Fix propuesto:** concurrency groups por directorio + reintentos con re-lectura ante colisión; en budget-watch, saltar snapshot si `action == 'OK'` y ya hay snapshot < 1h.

### 6. Idempotencia del orchestrator ante Issues editados
- `issues: [opened, edited, reopened, labeled]` re-entra con el label puesto: cada edición crea un TASK nuevo. Buscar tarea existente por `issue.number` antes de crear (como ya hace `handleApprove`).

### 7. Workflows no-op
- `qa`, `curator`, `onboarding`, `refactor`, `translator` llaman a `src/agents/<x>.js` que no existen; el `|| echo` los mantiene en verde sin hacer nada. Crear los agentes o quitar los crons.

### 8. Timezone consistente
- Los crons "3 AM" son UTC (= 10/11 PM en Havana). `budget.js`/`diarist.js` cortan el "día" a medianoche UTC aunque `config.timezone` diga otra cosa. Usar `Intl.DateTimeFormat` con `config.timezone` para calcular `todayISO()`.

---

## 🟡 Prioridad 3 — Producto / UX

### 9. Panel de moneda en Ventas IA
- `convertPrice` solo tiene tasas USD/EUR/MXN/CUP: convertir DESDE ARS/COP/CLP/PEN usa tasas de USD (error ~850× en ARS). Añadir tasas o bloquear esas monedas.

### 10. Atajos del manifest PWA
- Los shortcuts usan hash-routing (`#tasks`) pero no hay handler de `hashchange` → siempre abren el overview.

### 11. Badge de notificaciones con ID duplicado
- `updateNotificationCenter` crea un segundo `#notif-badge` cuando index.html ya tiene uno → dos writers sobre el mismo ID.

### 12. Índice pgvector sobre tabla vacía
- `ivfflat ... lists = 100` creado sin filas: los centroides quedan vacíos. Ejecutar `REINDEX` tras la primera carga de datos.

### 13. Limpieza de drift en docs y raíz
- README: badge apunta a `smoke.yml` inexistente y `OWNER/agent-brain`; dice 10 agentes y 9 workflows (hay 18 y 17).
- El `TASK-0001.json` de la RAÍZ contiene código fuente viejo (copia de budget.js) — borrarlo.
- Evaluar eliminar la duplicación raíz/`dashboard/` con un script de build/sync (ya causó el drift del SW v1.0.7 vs v1.0.8).

---

## Siguientes pasos sugeridos (orden)

1. #3 (endpoint models) + #4 (dispatch tras commit) — desbloquean el sistema en producción.
2. #1 + #2 — cerrar el frente de seguridad.
3. #5 + #6 + #8 — fiabilidad del loop diario.
4. El resto según uso real.
