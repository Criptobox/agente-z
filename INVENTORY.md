# INVENTORY — comparación de inventarios entre repos

Caso de uso: comparar productos de **AXONTECH** vs **TiendaMax**, detectar agotados, nuevos, desaparecidos y stock bajo, y recibir notificaciones automáticas.

---

## 🎯 Qué hace

1. **Lee** los archivos de productos de dos repos de GitHub (detección automática del archivo: `products.json`, `inventory.json`, `data/products.json`, etc.)
2. **Parsea** los productos (soporta JSON, JS con `export`, CSV simple)
3. **Detecta campos** automáticamente: `id` (o `sku`, `_id`, `productId`, `slug`, `name`), `stock` (o `quantity`, `qty`, `available`, etc.), `name`, `price`
4. **Compara** y clasifica:
   - 🔴 **Agotados**: stock era > 0 y ahora es 0
   - ✨ **Nuevos**: en B pero no en A
   - ❌ **Desaparecidos**: en A pero no en B
   - ⚠️ **Stock bajo**: stock < 5 unidades
   - ✅ **Disponibles**: stock > 0
5. **Notifica** vía Issue en GitHub (con label `urgent` si hay agotados)

---

## 📊 Cómo usarlo

### Opción 1: Desde el dashboard (instantáneo)

1. Abre el dashboard → vista **Inventario**
2. Rellena los campos:
   - **Repo A**: `axontech/axon-store` (tu repo de referencia)
   - **Repo B**: `tiendamax/tiendamax-web` (el repo a comparar)
   - **Path A/B**: opcional, deja vacío para detección automática
3. Click **Comparar ahora**
4. La comparación corre en tu navegador (GitHub API pública) — sin consumir Actions
5. El reporte aparece con KPIs + tablas por categoría

> 💡 Para repos privados, configura tu PAT con `setup.html` primero.

### Opción 2: Automático diario (cron)

1. En GitHub, ve a `Settings → Actions → Variables` y añade:
   - `INVENTORY_REPO_A` = `axontech/axon-store`
   - `INVENTORY_REPO_B` = `tiendamax/tiendamax-web`
2. El workflow `inventory-watch.yml` corre cada día a las **9 AM** hora local
3. Crea un Issue automáticamente con el reporte
4. Si hay agotados, el Issue se etiqueta como `urgent`

### Opción 3: Manual vía Actions

1. Ve a `Actions → inventory-watch → Run workflow`
2. Pasa `repo_a`, `repo_b` (y opcionalmente `path_a`, `path_b`, `issue_number`)
3. El workflow corre y comenta en el Issue especificado, o crea uno nuevo

---

## 🔔 Notificaciones

- **Issue automático**: cada día se crea (o actualiza) un Issue con el reporte
- **Label `urgent`**: si hay productos agotados, el Issue se etiqueta como urgente
- **Label `inventory`**: todos los Issues de inventario llevan esta label
- **Comentario en Issue diario**: si existe un Issue diario (label `daily-diary`), el reporte se comenta ahí en vez de crear uno nuevo

---

## 📁 Estructura de archivos esperada

El sistema busca automáticamente archivos de inventario en este orden:

```
products.json
inventory.json
data/products.json
data/inventory.json
src/data/products.json
src/data/inventory.json
public/products.json
api/products.json
catalog.json
items.json
stock.json
```

Si no encuentra ninguno, lista la raíz del repo y busca cualquier archivo con `product`, `inventory`, `catalog`, `items`, `stock` en el nombre.

### Formatos soportados

**JSON:**
```json
[
  { "id": "PROD-001", "name": "Camiseta", "stock": 15, "price": 25.99 },
  { "id": "PROD-002", "name": "Gorra", "stock": 0, "price": 19.99 }
]
```

**JS con export:**
```js
export default [
  { id: 'PROD-001', name: 'Camiseta', stock: 15 },
  { id: 'PROD-002', name: 'Gorra', stock: 0 }
]
```

**CSV simple:**
```csv
id,name,stock,price
PROD-001,Camiseta,15,25.99
PROD-002,Gorra,0,19.99
```

---

## 🧠 Memoria del inventario

Cada comparación guarda una memoria tipo `episode` en `memory/episodes/` con:

```yaml
id: EPI-XXXX
type: episode
project: inventory
task_id: INVENTORY-2026-08-11
agent: inventory
strategy: "Comparación axontech/axon-store vs tiendamax/tiendamax-web"
result: COMPLETED
needs_human: true  # si hay agotados
summary:
  total: 150
  agotados: 3
  nuevos: 8
  desaparecidos: 1
  stockBajo: 5
  disponibles: 137
repoA: axontech/axon-store
repoB: tiendamax/tiendamax-web
```

Esto permite ver histórico de inventarios en el activity feed.

---

## 🚀 Ejemplo completo

**Escenario:** Tienes AXONTECH como tu catálogo maestro y TiendaMax como tu tienda online. Quieres saber qué productos de AXONTECH faltan en TiendaMax y cuáles se agotaron.

1. Configura variables:
   - `INVENTORY_REPO_A` = `axontech/axon-store`
   - `INVENTORY_REPO_B` = `tiendamax/tiendamax-web`

2. Cada día a las 9 AM recibes un Issue así:

```markdown
### 📦 Reporte de inventario — 2026-08-11

**axontech/axon-store** (145 productos) vs **tiendamax/tiendamax-web** (150 productos)

🔴 **3 productos agotados** (urgente):
- PROD-042 — Camiseta negra M (was: 15, now: 0, $25.99)
- PROD-078 — Pantalón jean 32 (was: 8, now: 0, $45.00)
- PROD-103 — Gorra negra (was: 22, now: 0, $19.99)

✨ **8 productos nuevos** en TiendaMax:
- PROD-151 — Gorra trucker (30 unidades, $19.99)
- ...

⚠️ **5 productos con stock bajo** (<5):
- PROD-099 — Bufanda lana (3 unidades, $15.50)
- ...

**🚨 Acción recomendada:** reabastecer los 3 agotados hoy.
```

3. En el dashboard, vista **Inventario**, puedes hacer comparaciones ad-hoc cuando quieras sin esperar al cron.
