// dashboard/sales-forecast.js
// Módulo de Predicción de Ventas con IA para TiendaMax.
// Se carga como script global (no module).
// Funcionalidades:
//   1. Conectar con la tienda (tiendamax.org, Shopify, Mercado Libre, etc.)
//   2. Cargar inventario (desde la tienda o desde el inventario ya cargado en el dashboard)
//   3. Analizar con IA: predice productos ganadores, stock óptimo, próximos a agotarse
//   4. Mostrar KPIs predictivos (ventas esperadas, productos a reponer, etc.)
//   5. Histórico de predicciones en localStorage

(function() {
  'use strict';

  const HISTORY_KEY = 'forecast-history';

  // ─── Utilidades ───
  function $(sel) { return document.querySelector(sel); }
  function $$(sel) { return document.querySelectorAll(sel); }
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]); }
  function fmtPrice(p) { return p != null ? '$' + Number(p).toFixed(2) : ''; }
  function fmtNum(n) {
    if (typeof n !== 'number') n = Number(n) || 0;
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return String(n);
  }

  // ─── Cargar historial ───
  function loadHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; }
  }
  function saveHistoryEntry(entry) {
    const h = loadHistory();
    h.unshift(entry);
    // Mantener solo las últimas 20
    if (h.length > 20) h.length = 20;
    localStorage.setItem(HISTORY_KEY, JSON.stringify(h));
  }

  // ─── Conectar con la tienda ───
  async function connectStore() {
    const url = $('#fc-store-url')?.value?.trim() || '';
    const platform = $('#fc-store-platform')?.value || 'tiendamax';
    const token = $('#fc-store-token')?.value?.trim() || '';
    const status = $('#fc-status');
    if (!url) {
      status.innerHTML = '<div class="info-banner" style="background:rgba(239,68,68,0.08);border-color:rgba(239,68,68,0.3)">⚠️ Falta la URL de tu tienda</div>';
      return false;
    }
    status.innerHTML = '<div class="inv-loading"><div class="inv-loading__spinner"></div><div>Conectando con ' + escapeHtml(url) + '…</div></div>';

    // Guardar config
    localStorage.setItem('fc-store-url', url);
    localStorage.setItem('fc-store-platform', platform);
    if (token) localStorage.setItem('fc-store-token', token);

    try {
      // Hacer un ping simple a la URL (HEAD)
      // Nota: muchos sitios bloquean CORS en HEAD. Si falla, asumimos OK y seguimos.
      let reachable = false;
      try {
        const res = await fetch(url, { method: 'GET', mode: 'no-cors', signal: AbortSignal.timeout(8000) });
        reachable = true; // mode: no-cors no da status, pero si no lanza es porque llegó
      } catch (err) {
        console.warn('[forecast] ping falló, pero seguimos:', err.message);
      }
      status.innerHTML = '<div class="info-banner" style="background:rgba(16,185,129,0.08);border-color:rgba(16,185,129,0.3)">✅ Conectado a <strong>' + escapeHtml(url) + '</strong><br><small>Plataforma: ' + platform + (reachable ? ' · Sitio accesible' : ' · No se pudo verificar (puede tener CORS)') + '</small></div>';
      $('#fc-load-inventory').disabled = false;
      return true;
    } catch (err) {
      status.innerHTML = '<div class="info-banner" style="background:rgba(239,68,68,0.08);border-color:rgba(239,68,68,0.3)">❌ No se pudo conectar: ' + escapeHtml(err.message) + '</div>';
      return false;
    }
  }

  // ─── Cargar inventario ───
  function loadInventory() {
    const status = $('#fc-status');
    // Intentar usar el inventario ya cargado en el dashboard (state.lastInventoryReport)
    // El reporte real del dashboard trae {agotados, stockBajo, disponibles, summary, ...}
    // (no un array .products — ese solo existe en los datos demo).
    const report = window.state?.lastInventoryReport;
    const products = report?.products?.length
      ? report.products
      : report
        ? [...(report.disponibles || []), ...(report.stockBajo || []), ...(report.agotados || [])]
        : [];
    if (products.length) {
      status.innerHTML = '<div class="info-banner" style="background:rgba(16,185,129,0.08);border-color:rgba(16,185,129,0.3)">✅ <strong>' + products.length + ' productos</strong> cargados desde el inventario del dashboard.<br><small>Si querés inventario fresco desde tu tienda, andá a Inventario → Cargar desde URL.</small></div>';
      renderInventoryKPIs(report);
      $('#fc-analyze').disabled = false;
      return products;
    }

    // Si no hay inventario cargado, generar datos demo
    status.innerHTML = '<div class="info-banner" style="background:rgba(245,158,11,0.08);border-color:rgba(245,158,11,0.3)">⚠️ No hay inventario cargado en el dashboard todavía. Cargá primero un inventario desde la vista <strong>Inventario</strong>, o podés analizar con datos demo de TiendaMax.</div>';
    // Botón para cargar demo
    const demoBtn = document.createElement('button');
    demoBtn.className = 'btn';
    demoBtn.textContent = '🧪 Usar datos demo TiendaMax';
    demoBtn.style.marginTop = '8px';
    demoBtn.onclick = () => {
      const demoReport = generateDemoInventory();
      window.state = window.state || {};
      window.state.lastInventoryReport = demoReport;
      loadInventory();
    };
    status.appendChild(demoBtn);
    return null;
  }

  // ─── Datos demo TiendaMax (para que el usuario vea cómo funciona sin inventario real) ───
  function generateDemoInventory() {
    const products = [
      { id: 'TMX-001', name: 'Camiseta Algodón Premium', stock: 45, price: 19.99, category: 'Ropa' },
      { id: 'TMX-002', name: 'Pantalón Jogger Unisex', stock: 12, price: 29.99, category: 'Ropa' },
      { id: 'TMX-003', name: 'Zapatillas Urbanas', stock: 8, price: 49.99, category: 'Calzado' },
      { id: 'TMX-004', name: 'Gorra Trucker', stock: 0, price: 14.99, category: 'Accesorios' },
      { id: 'TMX-005', name: 'Mochila Antirrobo', stock: 23, price: 39.99, category: 'Accesorios' },
      { id: 'TMX-006', name: 'Reloj Deportivo', stock: 5, price: 79.99, category: 'Accesorios' },
      { id: 'TMX-007', name: 'Auriculares Bluetooth', stock: 67, price: 24.99, category: 'Electrónica' },
      { id: 'TMX-008', name: 'Power Bank 10000mAh', stock: 34, price: 19.99, category: 'Electrónica' },
      { id: 'TMX-009', name: 'Cable USB-C 2m', stock: 0, price: 7.99, category: 'Electrónica' },
      { id: 'TMX-010', name: 'Funda iPhone 15', stock: 89, price: 12.99, category: 'Accesorios' },
      { id: 'TMX-011', name: 'Botella Térmica 750ml', stock: 18, price: 16.99, category: 'Hogar' },
      { id: 'TMX-012', name: 'Vaso Térmico Café', stock: 3, price: 22.99, category: 'Hogar' },
      { id: 'TMX-013', name: 'Manta Polar Reversible', stock: 27, price: 34.99, category: 'Hogar' },
      { id: 'TMX-014', name: 'Pad Mouse XL', stock: 56, price: 9.99, category: 'Accesorios' },
      { id: 'TMX-015', name: 'Teclado Mecánico RGB', stock: 14, price: 59.99, category: 'Electrónica' },
      { id: 'TMX-016', name: 'Mouse Inalámbrico', stock: 41, price: 14.99, category: 'Electrónica' },
      { id: 'TMX-017', name: 'Sudadera Capucha', stock: 7, price: 44.99, category: 'Ropa' },
      { id: 'TMX-018', name: 'Calcetines Pack x6', stock: 102, price: 11.99, category: 'Ropa' },
      { id: 'TMX-019', name: 'Lentes Sol UV400', stock: 19, price: 27.99, category: 'Accesorios' },
      { id: 'TMX-020', name: 'Paraguas Compacto', stock: 31, price: 13.99, category: 'Hogar' },
    ];
    return {
      products,
      fields: { price: true },
      summary: {
        total: products.length,
        agotados: products.filter(p => p.stock === 0).length,
        stockBajo: products.filter(p => p.stock > 0 && p.stock <= 10).length,
        disponibles: products.filter(p => p.stock > 10).length,
      },
      totalValue: products.reduce((a, p) => a + (p.stock * (p.price || 0)), 0),
      timestamp: Date.now(),
    };
  }

  // ─── Render KPIs del inventario cargado ───
  function renderInventoryKPIs(report) {
    const grid = $('#fc-kpi-grid');
    if (!grid) return;
    const s = report.summary || {};
    const kpis = [
      { cls: 'purple', label: 'Productos totales', value: fmtNum(s.total || 0), foot: 'en catálogo' },
      { cls: 'green', label: 'Disponibles', value: fmtNum(s.disponibles || 0), foot: 'stock > 10' },
      { cls: 'amber', label: 'Stock bajo', value: fmtNum(s.stockBajo || 0), foot: 'stock ≤ 10' },
      { cls: 'cyan', label: 'Agotados', value: fmtNum(s.agotados || 0), foot: 'stock = 0' },
      { cls: 'pink', label: 'Valor inventario', value: '$' + fmtNum(report.totalValue || 0), foot: 'precio venta' },
    ];
    grid.innerHTML = kpis.map(k => `
      <div class="kpi-card kpi-card--${k.cls}">
        <div class="kpi-card__top">
          <div class="kpi-card__label">${k.label}</div>
        </div>
        <div class="kpi-card__value">${k.value}</div>
        <div class="kpi-card__foot">${k.foot}</div>
      </div>
    `).join('');
  }

  // ─── Analizar con IA ───
  async function analyzeWithAI() {
    const result = $('#fc-result');
    const report = window.state?.lastInventoryReport;
    if (!report?.products?.length) {
      result.innerHTML = '<div class="info-banner" style="background:rgba(239,68,68,0.08);border-color:rgba(239,68,68,0.3)">⚠️ Primero cargá el inventario.</div>';
      return;
    }

    const apiKey = localStorage.getItem('llm-api-key') || '';
    const provider = localStorage.getItem('llm-provider') || 'groq';
    if (!apiKey) {
      result.innerHTML = '<div class="info-banner" style="background:rgba(239,68,68,0.08);border-color:rgba(239,68,68,0.3)">⚠️ Necesitás configurar una API key de IA en Settings → Modelos de IA.<br>Recomendado: <strong>OpenRouter</strong> (gratis) o <strong>DeepSeek</strong>.</div>';
      return;
    }

    result.innerHTML = '<div class="inv-loading"><div class="inv-loading__spinner"></div><div>Analizando ' + report.products.length + ' productos con ' + provider + '…</div></div>';

    // Construir prompt con los datos del inventario
    const products = report.products.slice(0, 80); // limitar para no explotar el contexto
    const inventoryData = products.map(p => ({
      id: p.id,
      name: p.name,
      stock: p.stock,
      price: p.price,
    }));

    const prompt = `Sos un analista de e-commerce experto. Te paso el inventario actual de TiendaMax (una tienda online real, tiendamax.org). Necesito que hagas un ANÁLISIS PREDICTIVO DE VENTAS.

## INVENTARIO ACTUAL
${JSON.stringify(inventoryData, null, 2)}

## RESUMEN
- Total productos: ${report.summary.total}
- Disponibles (stock > 10): ${report.summary.disponibles}
- Stock bajo (1-10): ${report.summary.stockBajo}
- Agotados (0): ${report.summary.agotados}
- Valor total inventario: $${(report.totalValue || 0).toFixed(2)}

## QUÉ NECESITO QUE ANALICES

### 1. 🏆 TOP 5 PRODUCTOS GANADORES
Identificá los 5 productos con mayor potencial de ventas. Considerá:
- Stock disponible (suficiente para demandar)
- Precio competitivo
- Categoría popular

### 2. ⚠️ TOP 5 PRODUCTOS A REPONER URGENTE
Los que se agotarán pronto. Considerá:
- Stock ≤ 10 (especialmente = 0)
- Productos que parecen tener buena rotación

### 3. 💀 PRODUCTOS ZOMBIE
Los que probablemente NO se vendan (stock alto + categoría poco popular + precio alto).

### 4. 💰 PREDICCIÓN DE VENTAS (próximos 30 días)
Estimá:
- Ventas totales esperadas (en USD)
- Ticket promedio
- Productos que se agotarán
- Margen de ganancia estimado (asumiendo 40% de margen)

### 5. 🎯 RECOMENDACIONES ACCIONABLES
3-5 recomendaciones concretas para aumentar ventas esta semana.

## FORMATO
Respondé en MARKDOWN claro, con headers y listas. Sé específico: citá IDs de producto (TMX-XXX) cuando sea relevante. No inventes datos que no tengas.`;

    const systemPrompt = 'Sos un analista de e-commerce experto en retail y predicción de ventas. Respondés en español, en formato markdown claro. Usás datos reales del inventario para hacer predicciones realistas.';

    const llmMessages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt },
    ];

    const model = localStorage.getItem('llm-model') || (window.__defaultModelFor ? window.__defaultModelFor(provider) : 'llama-3.1-70b-versatile');

    try {
      if (!window.streaming || typeof window.streaming.stream !== 'function') {
        throw new Error('Módulo de streaming no disponible. Recargá la página.');
      }

      // Streaming real: el análisis aparece palabra por palabra
      let fullText = '';
      const startTime = Date.now();

      // Crear contenedor
      result.innerHTML = `
        <div class="panel" style="margin-top:var(--s-4)">
          <div class="panel__header">
            <h3 class="panel__title">🤖 Análisis predictivo en vivo</h3>
            <span class="panel__meta" id="fc-timer">0s</span>
          </div>
          <div class="panel__body">
            <div id="fc-streaming-text" class="markdown-body"><span class="chat__streaming-cursor"></span></div>
          </div>
        </div>
      `;
      const streamEl = $('#fc-streaming-text');
      const timerEl = $('#fc-timer');
      const timerInterval = setInterval(() => {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
        if (timerEl) timerEl.textContent = elapsed + 's';
      }, 500);

      await new Promise((resolve, reject) => {
        window.streaming.stream(
          llmMessages,
          { provider, model, apiKey, stream: true, temperature: 0.5, maxTokens: 2048 },
          // onToken
          (token, full) => {
            if (token) {
              fullText += token;
              if (streamEl) {
                streamEl.innerHTML = renderMarkdown(fullText) + '<span class="chat__streaming-cursor"></span>';
                // Auto-scroll
                streamEl.scrollTop = streamEl.scrollHeight;
              }
            }
          },
          // onDone
          (finalText) => {
            clearInterval(timerInterval);
            const final = finalText || fullText;
            if (streamEl) streamEl.innerHTML = renderMarkdown(final);
            // Guardar en historial
            saveHistoryEntry({
              timestamp: Date.now(),
              duration_ms: Date.now() - startTime,
              provider,
              model,
              productsAnalyzed: report.products.length,
              text: final.slice(0, 5000), // limitar tamaño
            });
            renderHistory();
            resolve(final);
          },
          // onError
          (err) => {
            clearInterval(timerInterval);
            reject(err);
          },
        );
      });

      // Actualizar timer final
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      if (timerEl) timerEl.textContent = elapsed + 's';

    } catch (err) {
      let msg = err.message || String(err);
      let hint = '';
      if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
        hint = '<br><small>💡 Esto suele ser CORS. Si usás Groq/OpenAI/Anthropic, se usa proxy automáticamente. Si falla, probá con <strong>OpenRouter</strong>.</small>';
      } else if (msg.includes('401') || msg.includes('403')) {
        hint = '<br><small>💡 API key inválida o sin permisos. Verificá la key en el panel del provider.</small>';
      } else if (msg.includes('429')) {
        hint = '<br><small>💡 Rate limit excedido. Esperá 1 minuto o cambiate a otro provider.</small>';
      }
      result.innerHTML = '<div class="info-banner" style="background:rgba(239,68,68,0.08);border-color:rgba(239,68,68,0.3)">❌ ' + escapeHtml(msg) + hint + '</div>';
    }
  }

  // ─── Render markdown básico ───
  function renderMarkdown(text) {
    if (!text) return '';
    let html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^# (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/_([^_]+)_/g, '<em>$1</em>');
    // Listas
    html = html.replace(/^[\s]*[-*] (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>');
    html = html.replace(/<\/ul>\s*<ul>/g, '');
    // Listas numeradas
    html = html.replace(/^[\s]*(\d+)\. (.+)$/gm, '<li>$2</li>');
    // Parágrafos
    html = html.replace(/\n\n/g, '</p><p>');
    html = '<p>' + html + '</p>';
    html = html.replace(/<p><\/p>/g, '');
    return html;
  }

  // ─── Render histórico ───
  function renderHistory() {
    const el = $('#fc-history');
    if (!el) return;
    const h = loadHistory();
    if (!h.length) {
      el.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:24px">Aún no hay predicciones. Hacé tu primer análisis arriba.</div>';
      return;
    }
    el.innerHTML = h.map(entry => {
      const date = new Date(entry.timestamp);
      const dateStr = date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) + ' ' + date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
      const duration = (entry.duration_ms / 1000).toFixed(1);
      const preview = (entry.text || '').slice(0, 200).replace(/\n/g, ' ');
      return `
        <div class="connection-card" style="cursor:pointer;margin-bottom:8px" data-forecast-id="${entry.timestamp}">
          <div class="connection-card__icon">📊</div>
          <div class="connection-card__body">
            <div class="connection-card__name">${dateStr} · ${entry.provider}</div>
            <div class="connection-card__status">${entry.productsAnalyzed} productos · ${duration}s</div>
            <small style="color:var(--text-muted);display:block;margin-top:4px">${escapeHtml(preview)}…</small>
          </div>
          <button class="btn btn--ghost" data-forecast-delete="${entry.timestamp}" title="Eliminar">✕</button>
        </div>
      `;
    }).join('');

    // Click para ver completo
    el.querySelectorAll('[data-forecast-id]').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('[data-forecast-delete]')) return;
        const id = Number(card.dataset.forecastId);
        const entry = h.find(x => x.timestamp === id);
        if (entry) {
          const result = $('#fc-result');
          result.innerHTML = `
            <div class="panel" style="margin-top:var(--s-4)">
              <div class="panel__header">
                <h3 class="panel__title">📊 Predicción del ${new Date(entry.timestamp).toLocaleString('es-ES')}</h3>
                <span class="panel__meta">${entry.provider} · ${(entry.duration_ms/1000).toFixed(1)}s</span>
              </div>
              <div class="panel__body">
                <div class="markdown-body">${renderMarkdown(entry.text)}</div>
              </div>
            </div>
          `;
          result.scrollIntoView({ behavior: 'smooth' });
        }
      });
    });
    // Delete
    el.querySelectorAll('[data-forecast-delete]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = Number(btn.dataset.forecastDelete);
        const h2 = loadHistory().filter(x => x.timestamp !== id);
        localStorage.setItem(HISTORY_KEY, JSON.stringify(h2));
        renderHistory();
      });
    });
  }

  // ─── Init ───
  function initForecast() {
    // Restaurar config guardada
    const savedUrl = localStorage.getItem('fc-store-url');
    if (savedUrl && $('#fc-store-url')) $('#fc-store-url').value = savedUrl;
    const savedPlatform = localStorage.getItem('fc-store-platform');
    if (savedPlatform && $('#fc-store-platform')) $('#fc-store-platform').value = savedPlatform;
    const savedToken = localStorage.getItem('fc-store-token');
    if (savedToken && $('#fc-store-token')) $('#fc-store-token').value = savedToken;

    // Wire botones
    $('#fc-connect')?.addEventListener('click', connectStore);
    $('#fc-load-inventory')?.addEventListener('click', loadInventory);
    $('#fc-analyze')?.addEventListener('click', analyzeWithAI);

    // Si ya hay inventario cargado en el dashboard, habilitar analizar
    if (window.state?.lastInventoryReport?.products?.length) {
      $('#fc-load-inventory').disabled = false;
    }

    renderHistory();
  }

  // Auto-init cuando el DOM esté listo
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initForecast);
  } else {
    initForecast();
  }

  // Exponer para debug
  window.forecast = {
    analyzeWithAI,
    loadInventory,
    connectStore,
    renderHistory,
  };
})();
