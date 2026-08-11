---
id: BUG-XXX
type: error
project: tiendamax
title: "<descripción corta del síntoma>"
status: open          # open | investigating | resolved | regressed
severity: medium      # low | medium | high | critical
confidence: 0         # 0-100 (ver calibración en agents/_template.md)
verified_by: null     # TEST-XXX si lo verificó un test
files: []             # ["js/cart.js"]
symbols: []           # ["calculateTotal", "removeItem"]
created: 2026-01-01
updated: 2026-01-01
agent: code
commit: null          # SHA del proyecto externo cuando se escribió
supersedes: null      # ID de memoria que esta reemplaza
invalidated_by: null  # TASK-XXXX que la invalidó (no borrar, dejar traza)
stale: false
tags: []
---

## Problema
<qué síntoma se observa>

## Causa raíz
<por qué pasa, no qué hacer>

## Intentos

### Intento 1 — FALLÓ
<qué se probó>
Resultado: <qué pasó>
Aprendizaje: <qué se aprendió del fallo>

### Intento 2 — FUNCIONÓ
<qué se probó>
Resultado: <evidencia objetiva: test, exit code, etc.>

## Verificación
<TEST-XXX: 3/3 passed, o evidencia equivalente>
