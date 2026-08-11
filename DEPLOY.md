# DEPLOY — guía de despliegue a GitHub

Tienes **dos caminos** para desplegar:

- **🚀 Camino rápido (recomendado):** usa el asistente web `setup.html` — configura todo en 2 minutos con tu token de GitHub.
- **📋 Camino manual:** sigue la checklist de abajo paso a paso desde la UI de GitHub.

---

## 🚀 Camino rápido — asistente web

### Qué hace el asistente automáticamente

1. Verifica tu token de GitHub
2. Verifica que tu repo existe y tienes permisos de admin
3. Crea las 8 variables (TARGET_REPOS, MODELS_PRIMARY, etc.)
4. Habilita GitHub Pages con source = "GitHub Actions"
5. Lanza el workflow `reindex` para publicar el dashboard
6. Te da los enlaces finales: dashboard, Actions, crear primer Issue

### Cómo usarlo

1. **Descomprime el zip** y abre `dashboard/setup.html` en tu navegador (doble clic)
2. Crea un PAT con permisos `repo` y `workflow` → [crear aquí](https://github.com/settings/tokens/new?scopes=repo,workflow&description=agent-brain-setup)
3. Pégalo en el wizard → "Probar conexión"
4. Sigue los 5 pasos. Cada uno muestra ✓ verde al completarse.

**Seguridad:** el PAT se usa solo en memoria, en tu navegador. No se guarda, no se envía a ningún servidor. Cierra la pestaña cuando termines.

> 💡 El wizard también queda disponible en `https://tu-usuario.github.io/agent-brain/setup.html` tras el primer deploy, por si quieres reconfigurar algo.

---

## 📋 Camino manual — checklist paso a paso

Usa este camino si prefieres controlar cada paso o si el wizard falla.

### ✅ Checklist rápida

- [ ] **Paso 1.** Crear repo público en GitHub
- [ ] **Paso 2.** Subir el código
- [ ] **Paso 3.** Configurar Variables (8)
- [ ] **Paso 4.** Configurar Secrets opcionales (2)
- [ ] **Paso 5.** Habilitar GitHub Pages
- [ ] **Paso 6.** Habilitar Actions
- [ ] **Paso 7.** Probar el loop mínimo (abrir un Issue)
- [ ] **Paso 8.** Verificar el dashboard

---

## 📋 Paso 1 — Crear repo público

**IMPORTANTE:** El repo debe ser **público**. Actions es ilimitado gratis en repos públicos. En privados tienes 2000 min/mes.

1. Ve a https://github.com/new
2. **Repository name:** `agent-brain`
3. **Description:** `Sistema multi-agente con memoria compartida — coste cero sobre GitHub`
4. **Visibility:** ✅ **Public**
5. **Initialize:** ❌ NO marques nada (no README, no .gitignore, no license — ya los tienes)
6. Click **Create repository**

Anota el `owner/name` del repo (ej: `tu-usuario/agent-brain`).

---

## 📤 Paso 2 — Subir el código

Desde tu máquina local, en el directorio donde descomprimiste el zip:

```bash
cd agent-brain

# Inicializar git
git init
git add .
git commit -m "init: agent-brain v0.1.0 — sistema multi-agente con memoria compartida"

# Conectar al repo remoto (cambia tu-usuario por el tuyo)
git branch -M main
git remote add origin https://github.com/tu-usuario/agent-brain.git
git push -u origin main
```

**Verifica:** entra a `https://github.com/tu-usuario/agent-brain` y debes ver todos los archivos.

---

## ⚙️ Paso 3 — Configurar Variables

Entra a `Settings → Secrets and variables → Actions → Variables` (pestaña **Variables**, no Secrets).

Click **New variable** para cada una:

| Name | Value | Notas |
|---|---|---|
| `TARGET_REPOS` | `tu-usuario/tiendamax-web` | Repo(s) externo(s) que los agentes analizarán. Si no tienes uno todavía, pon cualquier valor — lo cambiarás luego. |
| `MODELS_PRIMARY` | `gpt-4o-mini` | Modelo primario (catálogo: https://github.com/marketplace/models) |
| `MODELS_FALLBACK` | `phi-3-mini-4k-instruct` | Fallback si el primario cae |
| `EMBEDDINGS_MODEL` | `text-embedding-3-small` | Para búsqueda semántica |
| `BUDGET_DAILY_TOKENS` | `120000` | Cuota diaria estimada (ajústala a tu tier) |
| `BUDGET_DAILY_ACTIONS_MINUTES` | `180` | Límite diario de minutos de Actions |
| `BUDGET_WARN_PERCENT` | `80` | A partir de qué % avisar |
| `TIMEZONE` | `America/Havana` | Tu zona horaria (para el cron del diario) |

> 💡 **Si tienes varios repos externos:** sepáralos por coma: `tu-usuario/tiendamax-web,tu-usuario/axontech`

---

## 🔐 Paso 4 — Configurar Secrets opcionales (solo si quieres fallback externo)

Solo necesarios si GitHub Models te cae mucho. Entra a `Settings → Secrets and variables → Actions → Secrets`.

| Name | Dónde conseguirlo |
|---|---|
| `GROQ_API_KEY` | https://console.groq.com (gratis) |
| `GEMINI_API_KEY` | https://aistudio.google.com (gratis) |

**Sin estos, el sistema igual funciona** — solo usa GitHub Models. Si los pones, el router cae a Groq o Gemini cuando GitHub Models falla.

> ⚠️ **NO configures `GITHUB_TOKEN` como secret** — Actions lo inyecta automáticamente. Si lo defines, puedes romper el workflow.

---

## 🌐 Paso 5 — Habilitar GitHub Pages

1. Ve a `Settings → Pages`
2. **Source:** selecciona **GitHub Actions**
3. Guarda

El workflow `reindex.yml` publicará el dashboard automáticamente cada noche a las 2 AM. Para publicarlo ya:

1. Ve a `Actions → reindex → Run workflow`
2. Espera 2-3 min
3. Tu dashboard quedará en: `https://tu-usuario.github.io/agent-brain/`

---

## ▶️ Paso 6 — Habilitar Actions

1. Ve a `Actions` (pestaña del repo)
2. Si GitHub te pregunta "I understand my workflows, go ahead and enable them", click en ese botón
3. Verás 9 workflows listados:
   - `orchestrator` — se dispara al abrir/comentar Issues
   - `agent-run` — ejecuta un turno de un agente
   - `devil` — abogado del diablo post-handoff
   - `learner` — post-mortem al cerrar tarea
   - `budget-watch` — vigilancia horaria de cuota
   - `diary` — resumen nocturno
   - `self-improve` — auto-mejora semanal
   - `reindex` — reconstrucción nocturna
   - `pr-approve` — escucha `/approve` en Issues

---

## 🧪 Paso 7 — Probar el loop mínimo

### 7.1 Crear el primer Issue

1. Ve a `Issues → New issue`
2. **Title:** `El checkout de TiendaMax falla al pagar con tarjeta internacional`
3. **Body:** (cualquier descripción, opcional)
4. En la barra de labels, escribe `agent-task` y créala si no existe
5. Click **Submit new issue**

### 7.2 Qué debería pasar

En 1-2 minutos verás:

1. **Workflow `orchestrator` se dispara** (Actions tab)
2. El orchestrator crea `tasks/TASK-0001.json` con Definition of Done
3. **Comentario del orchestrator** en el Issue con:
   - Contexto recuperado de memoria
   - Gates propuestos
   - Agente asignado
4. **Workflow `agent-run` se dispara** para el agente `code`
5. El agente trabaja y comenta su **handoff**
6. **Workflow `devil` se dispara** automáticamente — el abogado del diablo audita
7. Si `devil` BLOCK, se añaden gates y el siguiente agente los respeta
8. Cuando `test` verifica y pasa todos los gates → tarea cerrada

### 7.3 Si algo falla

- **Error 403 en Actions:** verifica que el repo es público
- **Error de tokens:** revisa que configuraste las Variables del Paso 3
- **El orchestrator no se dispara:** verifica que el Issue tiene el label `agent-task` (exactamente ese nombre)
- **El dashboard no carga:** ejecuta `reindex` manualmente desde Actions

---

## 📊 Paso 8 — Verificar el dashboard

1. Ve a `https://tu-usuario.github.io/agent-brain/`
2. Debes ver:
   - Sidebar con 8 secciones
   - Hero con sparkline de actividad
   - 8 KPIs en grid 4×2
   - Panel de tareas activas
   - Último diario (vacío hasta que corra el cron de las 3 AM)
   - Presupuesto
3. Pulsa `⌘K` (o `Ctrl+K`) → command palette
4. Pulsa `1-8` → cambiar de vista
5. Botón sol/luna arriba a la derecha → cambiar tema

> ⚠️ Si el dashboard muestra "sin datos": ejecuta `reindex` manualmente desde Actions. Eso genera `memory/index.json` y `memory/stats.json`.

---

## 🚀 Instalar como PWA (opcional)

Una vez en GitHub Pages:

- **Chrome/Edge desktop:** botón de instalar en la barra de direcciones, o click en el botón "Instalar" del dashboard
- **iOS Safari:** Compartir → "Añadir a pantalla de inicio"
- **Android Chrome:** menú ⋮ → "Instalar aplicación"

La app funciona offline gracias al service worker.

---

## 🔧 Post-despliegue

### Conectar un repo externo real

Para que los agentes tengan código real que analizar:

1. Crea un repo `tiendamax-web` (público)
2. Sube cualquier proyecto vanilla JS que tengas
3. Actualiza la variable `TARGET_REPOS` en GitHub con `tu-usuario/tiendamax-web`
4. Listo — los agentes usarán `read_project_file` para leer su código

### Qué esperar los primeros días

- **Día 1:** Validación del loop. 1-2 tareas reales.
- **Día 2-7:** El `learner` empieza a proponer lecciones. El `diarist` escribe cada noche.
- **Semana 2:** El `self_improver` abre el primer PR de auto-mejora si hay lecciones promovibles.
- **Mes 1:** Métrica clave: "intentos promedio hasta primer gate verde" debe bajar.

### Mantenimiento

- **Semanal:** revisar PRs de `self-improvement`
- **Mensual:** ajustar `BUDGET_DAILY_TOKENS` según uso real
- **Trimestral:** auditar `agents/*.md` — las reglas siguen siendo correctas

---

## 🆘 Troubleshooting

| Problema | Solución |
|---|---|
| `Actions` no aparece | Repo privado → pásalo a público, o paga GitHub Pro |
| Workflows no se disparan | Verifica que están en `.github/workflows/` y que el YAML es válido |
| `GITHUB_TOKEN` sin permisos | Cada workflow declara sus `permissions` — no añadas más secret |
| Error `models: read` | Verifica que el workflow tiene `permissions: models: read` |
| Dashboard 404 en Pages | Verifica que `reindex.yml` corrió y que Pages está en modo "GitHub Actions" |
| Issue no dispara orchestrator | El label debe ser exactamente `agent-task` (sin mayúsculas) |
| `/approve` no funciona | El comentario debe empezar exactamente con `/approve` |

---

## 📞 Soporte

Si algo no funciona:

1. Revisa `Actions` → busca el workflow fallido → mira los logs
2. Los logs muestran exactamente qué archivo y línea falló
3. La mayoría de los errores son por Variables mal configuradas o por repos privados sin permisos

**No hay servidor que mantener. No hay base de datos que se caiga. No hay facturas que pagar.** El único punto de fallo es GitHub Actions, y ya lo pagas con tu cuenta de GitHub.

---

¡Listo! Cuando completes el Paso 8, tienes un sistema multi-agente auto-mejorable corriendo en producción por $0.
