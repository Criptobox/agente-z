# agent-brain · TiendaMax Redesign — Resumen de cambios

## Diseño visual (TiendaMax premium)
- **Paleta actualizada** a deep midnight navy (`#0a0e27`) + neon accents:
  purple `#8b5cf6`, cyan `#06b6d4`, green `#10b981`, amber `#f59e0b`, pink `#ec4899`.
- **Glassmorphism**: tarjetas con `backdrop-filter: blur(16px)` y backgrounds semi-transparentes.
- **Mesh gradient background** sutil (radial gradients) en el body.
- **Sidebar 260px** con nav active state tipo TiendaMax (gradient + border-left).
- **Topbar premium**: notification bell con badge pulsante + user chip con avatar + online dot.

## Nuevos componentes (`tiendamax.js` + CSS)
1. **KPI Grid (5 columnas)**: cada tarjeta con icon circular coloreado, valor grande,
   % change (up/down/neutral), sparkline SVG y foot meta.
2. **Quick Actions (7 botones)**: grid de iconos con hover glow en color semántico.
3. **Activity Line Chart**: canvas nativo, dual-series (memorias + tareas), 14 días,
   gradient fill + dashed grid + axis labels.
4. **Donut Chart**: SVG nativo con segments por tipo de memoria + center value + legend.
5. **AI Center Card**: ring progress conical gradient (green→blue→purple) + health score
   calculado dinámicamente + CTA "Optimizar mi sistema" + chips de estado.
6. **Data Table**: tabla premium con status pills, mini progress bars, hover states.
7. **Notification Badge**: contador de tareas stuck/needs_human en el topbar.

## Bugs corregidos (de la auditoría)
1. **#1.1** Settings & Graph views blank → `switchView()` ahora llama `render*()` ANTES
   del toggle de `is-active`, y las secciones creadas dinámicamente incluyen `is-active`.
2. **#1.2** `state.repo` undefined → fallback a `localStorage.getItem('agent-brain-repo')`
   con mensaje de error claro si no está configurado.
3. **#1.3** `analyzeSingleRepoInventoryDirect` no definida → reemplazada por
   `analyzeSingleRepoInventory()` existente.
4. **#1.4** `updateAuthUI` hijackeaba el botón PWA install → ahora usa el slot dedicado
   `#topbar-user` (user chip en topbar).
5. **#1.5** Background sidebar auto-reabría cada segundo → añadido flag
   `bgSidebarUserClosed` que respeta el cierre del usuario.
6. **#1.7** Service worker default fetch handler devolvía undefined → ahora devuelve
   `Response.error()` como fallback final.
7. **#1.11** Tautological localStorage lookup en background-runner → corregido a
   `agent-brain-target-repos` como fallback.
8. **Security #1** XSS en activity feed → todos los campos interpolados de memoria
   ahora pasan por `escapeHtml()`.

## Optimizaciones
- `tiendamax.js` se carga con `defer` y hooka `renderAll()` sin romper el flujo existente.
- Canvas charts se re-renderizan en theme toggle y window resize.
- Notification badge se actualiza en cada `renderAll()`.

## Cómo usar
Abre `dashboard/index.html` directamente o sirve la carpeta:
\`\`\`bash
cd dashboard && python3 -m http.server 8000
# abre http://localhost:8000?demo=1 para modo demo
\`\`\`

## Archivos modificados
- `dashboard/index.html` — topbar premium + nueva vista general TiendaMax
- `dashboard/styles.css` — design tokens + nuevos componentes premium
- `dashboard/app.js` — bugfixes + exposure de `state`/`DEMO` a window
- `dashboard/auth.js` — bugfix #1.4
- `dashboard/settings.js` — bugfix #1.1
- `dashboard/graph.js` — bugfix #1.1
- `dashboard/sw.js` — bugfix #1.7
- `dashboard/background-runner.js` — bugfix #1.11
- `dashboard/tiendamax.js` — **NUEVO** — overlay con todos los componentes TiendaMax

## Verificación
- 23/23 checks PASS en headless browser (1440x900)
- Screenshots en `.verification-screenshots/`
- Audit report en `.verification-screenshots/audit-report.md`
- Verify report en `.verification-screenshots/verify-report.md`
