# ROADMAP — qué mejorar después

Lista priorizada de mejoras futuras para agent-brain. Ordenadas por impacto/coste.

---

## ✅ v0.1 — Hecho

- 11 agentes (5 spec + 5 extensiones + analyst)
- 9 workflows de Actions
- Memoria compartida (8 tipos) + búsqueda híbrida
- Dashboard PWA premium con sidebar, command palette, dark/light
- Setup wizard web (5 pasos, 2 min)
- Agente `analyst` para auditar repos externos
- UI para pegar URL de repo y lanzar análisis
- Drawer de detalle de tarea (click en card → historial)
- Bottom nav móvil + FAB

---

## 🎯 v0.2 — Próximas mejoras (alto impacto, bajo coste)

### 1. Notificaciones push (PWA)
- Suscribir al usuario a Web Push notifications
- Notificar cuando una tarea queda STUCK, cuando el budget pasa del 80%, o cuando el diarist publica
- Coste: ~2h. Solo necesita un VAPID key pair.

### 2. Polling automático del dashboard
- En vez de refrescar manualmente, hacer poll cada 30s a `memory/index.json` y `tasks/index.json`
- Si detecta cambios, animar las tarjetas (fade-in sutil)
- Coste: ~30 min. Ya hay skeleton loaders.

### 3. Búsqueda full-text en memoria
- Cmdk ya busca en tareas y errores. Extender a TODA la memoria (decisions, facts, lessons, criteria)
- Highlight de coincidencias con `<mark>`
- Coste: ~1h.

### 4. Filtros persistentes
- Guardar los filter chips activos en `localStorage`
- Al recargar, mantener el filtro seleccionado
- Coste: ~15 min.

### 5. Exportar memoria a JSON
- Botón en la vista Memoria para descargar todo como `agent-brain-memory.json`
- Útil para backup o migración
- Coste: ~30 min.

---

## 🚀 v0.3 — Medio impacto, medio coste

### 6. Webhooks en tiempo real (avanzado)
- En vez de polling, configurar webhook de GitHub → el dashboard recibe push en tiempo real
- Requiere un endpoint público (Cloudflare Workers gratis, o GitHub Pages con Server-Sent Events simulados)
- Coste: ~4h. Complejidad media.

### 7. Activity feed (timeline)
- Nueva vista "Actividad" que muestra un timeline de todos los eventos: tareas creadas, handoffs, gates verificados, lecciones propuestas, commits
- Como el feed de GitHub pero solo de agent-brain
- Coste: ~3h.

### 8. Métricas y tendencias
- Gráficos de: intentos promedio hasta gate verde (sección 13.6), tokens consumidos por día, tareas STUCK por semana
- Usar Chart.js o D3 ( CDN, sin build step)
- Coste: ~4h.

### 9. Multi-repo support en el dashboard
- Si tienes varios `TARGET_REPOS`, el dashboard debería poder filtrar por proyecto
- Selector de proyecto en el topbar
- Coste: ~2h.

### 10. Modo compacto (power users)
- Toggle en el topbar para reducir padding de tarjetas y mostrar más info por pantalla
- Recordar la preferencia en `localStorage`
- Coste: ~1h.

---

## 🔬 v0.4 — Alto impacto, alto coste

### 11. Integración con GitHub Codespaces
- Botón "Abrir en Codespace" en cada tarea → crea un codespace con el repo externo cargado
- El agente `code` puede entonces escribir código directamente en el codespace
- Coste: ~8h. Requiere API de Codespaces.

### 12. Visualización de grafo de memoria
- Las memorias tienen `files`, `symbols`, `supersedes`, `verified_by` — son aristas de un grafo
- Renderizar con D3 force-directed graph
- Permite ver relaciones: "este bug se originó de esta decisión y se verificó con este test"
- Coste: ~6h.

### 13. Diff viewer integrado
- Cuando un agente propone un cambio, mostrar el diff inline en el drawer (estilo GitHub)
- Syntax highlighting con Prism.js o Highlight.js
- Coste: ~5h.

### 14. Chat con el sistema
- Input en el bottom del dashboard para "hablar" con agent-brain
- Pregunta cosas como "¿qué tareas están stuck?" o "¿qué aprendimos esta semana?"
- Usa el mismo modelo de GitHub Models para responder
- Coste: ~6h. Necesita un endpoint (Cloudflare Worker o similar).

### 15. Mobile app nativa (React Native / Expo)
- Wrapper nativo de la PWA con notificaciones push nativas
- Mejor UX en móvil (gestos, compartir, etc.)
- Coste: ~20h. Solo si la PWA no es suficiente.

---

## 💡 Ideas experimentales

### 16. Voice input
- Usar Web Speech API para dictado
- "Crea una tarea para arreglar el bug del carrito" → crea el Issue
- Coste: ~3h. Solo Chrome/Edge.

### 17. AI-powered insights
- Cada noche, un agente analiza todos los datos y propone insights: "Noté que el 60% de tus bugs son de integridad referencial. ¿Quieres que cree una lección?"
- Coste: ~4h.

### 18. Integration con Linear / Jira
- Sync de tareas: cuando cierras una tarea en agent-brain, la cierra en Linear
- Bidirectional sync
- Coste: ~8h. Requiere API keys de Linear.

### 19. Templates de tareas
- Plantillas predefinidas: "bug report", "feature request", "refactor", "security audit"
- Al crear Issue, elegir template
- Coste: ~2h. Solo HTML + JS.

### 20. Multi-tenant
- Soportar múltiples usuarios en el mismo repo, cada uno con su propio workspace
- Coste: ~15h. Requiere refactor de auth.

---

## 🐛 Bugs conocidos

- `reindex.js` no genera `tasks/index.json` si no hay tareas (edge case, ya manejado con fallback)
- El setup wizard no valida si el PAT tiene permisos `workflow` antes de intentar crear variables
- El dashboard en móvil no tiene pull-to-refresh (solo botón de refresh)
- El cmdk no recuerda búsquedas recientes

---

## 📊 Métrica de éxito

La métrica clave (sección 13.6 del spec):

> **Intentos promedio hasta el primer gate verde, por mes.**

Si en agosto son 3.4 y en octubre son 2.1, el sistema está aprendiendo. Si no baja, las lecciones son decorativas.

Añadir un gráfico de esta métrica en el dashboard sería la mejora #1 de impacto real.

---

## 🤝 Cómo contribuir

Si quieres implementar alguna de estas mejoras:

1. Abre un Issue con label `enhancement` describiendo qué vas a hacer
2. Crea un branch: `git checkout -b feature/notificaciones-push`
3. Implementa
4. Abre PR
5. El agente `devil` auditará tu PR automáticamente (si tiene label `agent-task`)

El sistema puede mejorar de forma recursiva: usa agent-brain para mejorar agent-brain.
