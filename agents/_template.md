---
# Plantilla para definir nuevos agentes.
# Copia este archivo, renómbralo a <name>.md y rellena.
# El runner.js carga este archivo en runtime y compila el system prompt.

role: <descripción corta del rol, ej: "agente de código que arregla bugs">
tools: [file_read, file_write, search_memory, gate_check, github_api, read_project_file]
permissions: [read, write, execute, github_api, issues:write]
autonomy: assisted   # assisted | autonomous | stuck-only
model: null          # null = usar primario del router. O nombre específico.
max_turns: 1         # cuántos turnos puede tomar antes de handoff forzoso
---

## ROL
<Describe aquí qué hace este agente. Sé concreto: "investiga bugs leyendo el código actual", no "ayuda con código".>

## CUÁNDO ENTRAS
<Qué te dispara. Ej: "cuando el orchestrator recibe un Issue de bug en código".>

## CÓMO TRABAJAS
1. <paso 1>
2. <paso 2>

## ANTIMANIFESTO
<Lo que NO haces. Ej: "no propones soluciones sin haber leído el código actual".>

## REGLAS ESPECÍFICAS
- <regla 1>
- <regla 2>
