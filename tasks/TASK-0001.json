{
  "id": "TASK-0001",
  "issue": null,
  "goal": "Tarea de ejemplo — investigar por qué calculateTotal devuelve NaN al eliminar un producto del carrito",
  "description": "Tarea sembrada para smoke test. No se ejecuta contra un repo real — valida que el loop del runner funciona end-to-end.",
  "project": "tiendamax",
  "status": "completed",
  "assigned": "code",
  "depends_on": [],
  "related_memory": [
    "BUG-001"
  ],
  "autonomy": "assisted",
  "current_attempt": 2,
  "files_involved": [
    "js/cart.js"
  ],
  "symbols_involved": [
    "calculateTotal",
    "removeItem"
  ],
  "definition_of_done": [
    {
      "id": "G1",
      "check": "El síntoma original (NaN tras eliminar producto) no se reproduce",
      "method": "test",
      "command": "node tests/fixtures/cart.test.js --case=nan-on-remove",
      "expect": "exit_code == 0"
    },
    {
      "id": "G2",
      "check": "Sin regresiones en el carrito",
      "method": "test",
      "command": "node tests/fixtures/cart.test.js",
      "expect": "0 failing"
    },
    {
      "id": "G3",
      "check": "El total es numéricamente correcto, no solo no-NaN",
      "method": "assertion",
      "command": "node tests/fixtures/cart.total.spec.js",
      "expect": "exit_code == 0"
    },
    {
      "id": "G4",
      "check": "No se introdujeron !important ni console.error nuevos",
      "method": "diff_scan"
    },
    {
      "id": "G5",
      "check": "Sin secretos ni tokens en el diff",
      "method": "security_scan"
    }
  ],
  "budget": {
    "max_attempts": 5,
    "max_minutes": 25,
    "max_tokens": 120000
  },
  "handoffs": [
    {
      "at": "2026-08-12T03:31:31.701Z",
      "agent": "code",
      "episode": "EPI-0001",
      "route": "NEW",
      "completed": [],
      "not_completed": [
        "[DRY_RUN] nada real ejecutado"
      ],
      "next_agent": null
    },
    {
      "at": "2026-08-12T03:33:16.252Z",
      "agent": "code",
      "episode": "EPI-0002",
      "route": "NEW",
      "completed": [],
      "not_completed": [
        "[DRY_RUN] nada real ejecutado"
      ],
      "next_agent": null
    }
  ],
  "created": "2026-08-11T00:00:00Z",
  "last_episode": "EPI-0002",
  "last_agent": "code",
  "next_agent": null,
  "next_task_hint": "[DRY_RUN] decidir siguiente paso",
  "updated": "2026-08-12T03:33:16.252Z"
}
