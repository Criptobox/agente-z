// dashboard/graph.js
// Vista de grafo de memorias — canvas nativo, force-directed sin dependencias.
// Nodos = memorias, aristas = relaciones (supersedes, invalidated_by, verified_by, born_from).

(function() {
  'use strict';

  let canvas, ctx, nodes = [], edges = [], animId = null;
  let hoveredNode = null;
  let dragNode = null;
  let mouseX = 0, mouseY = 0;
  let offsetX = 0, offsetY = 0;
  let scale = 1;

  function renderGraphView() {
    let view = document.getElementById('view-graph');
    if (!view) {
      const content = document.getElementById('content');
      view = document.createElement('section');
      view.className = 'view';
      view.id = 'view-graph';
      view.innerHTML = `
        <div class="view__header">
          <h2 class="view__title">🕸️ Grafo de memoria</h2>
          <div class="filter-chips">
            <button class="chip is-active" data-graph-filter="all">Todo</button>
            <button class="chip" data-graph-filter="error">Errores</button>
            <button class="chip" data-graph-filter="lesson">Lecciones</button>
            <button class="chip" data-graph-filter="decision">Decisiones</button>
            <button class="chip" data-graph-filter="criteria">Criterios</button>
          </div>
        </div>
        <div class="graph-container">
          <canvas id="graph-canvas" width="900" height="500"></canvas>
          <div class="graph-legend" id="graph-legend"></div>
          <div class="graph-tooltip" id="graph-tooltip" hidden></div>
        </div>
      `;
      content.appendChild(view);

      // Añadir al sidebar
      const nav = document.querySelector('.sidebar .nav');
      if (nav && !document.querySelector('[data-target=graph]')) {
        const btn = document.createElement('button');
        btn.className = 'nav__item';
        btn.dataset.target = 'graph';
        btn.innerHTML = `<span class="nav__icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2"/><circle cx="5" cy="5" r="2"/><circle cx="19" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/><line x1="12" y1="12" x2="5" y2="5"/><line x1="12" y1="12" x2="19" y2="5"/><line x1="12" y1="12" x2="5" y2="19"/><line x1="12" y1="12" x2="19" y2="19"/></svg></span><span class="nav__label">Grafo</span>`;
        nav.appendChild(btn);
        btn.addEventListener('click', () => window.switchView && window.switchView('graph'));
      }

      // Filter chips
      view.querySelectorAll('[data-graph-filter]').forEach(chip => {
        chip.addEventListener('click', () => {
          view.querySelectorAll('[data-graph-filter]').forEach(c => c.classList.remove('is-active'));
          chip.classList.add('is-active');
          buildGraph(chip.dataset.graphFilter);
        });
      });
    }
    initCanvas();
    buildGraph('all');
  }

  function initCanvas() {
    canvas = document.getElementById('graph-canvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');

    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      mouseX = (e.clientX - rect.left - offsetX) / scale;
      mouseY = (e.clientY - rect.top - offsetY) / scale;
      if (dragNode) {
        dragNode.x = mouseX;
        dragNode.y = mouseY;
        dragNode.vx = 0;
        dragNode.vy = 0;
      } else {
        hoveredNode = nodes.find(n => Math.hypot(n.x - mouseX, n.y - mouseY) < n.r + 4);
        canvas.style.cursor = hoveredNode ? 'pointer' : 'default';
        const tooltip = document.getElementById('graph-tooltip');
        if (hoveredNode) {
          tooltip.hidden = false;
          tooltip.style.left = (e.clientX - rect.left + 10) + 'px';
          tooltip.style.top = (e.clientY - rect.top + 10) + 'px';
          tooltip.innerHTML = `<strong>${hoveredNode.id}</strong><br>${hoveredNode.title}<br><span style="color:var(--text-muted)">${hoveredNode.type} · conf=${hoveredNode.confidence || '?'}</span>`;
        } else {
          tooltip.hidden = true;
        }
      }
    });

    canvas.addEventListener('mousedown', (e) => {
      if (hoveredNode) { dragNode = hoveredNode; canvas.style.cursor = 'grabbing'; }
    });
    canvas.addEventListener('mouseup', () => { dragNode = null; canvas.style.cursor = 'default'; });
    canvas.addEventListener('mouseleave', () => { dragNode = null; document.getElementById('graph-tooltip').hidden = true; });

    // Zoom con rueda
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      scale *= e.deltaY < 0 ? 1.1 : 0.9;
      scale = Math.max(0.3, Math.min(3, scale));
    });
  }

  function buildGraph(filter) {
    const idx = (window.state && window.state.data && window.state.data.index) || {};
    const DEMO_IDX = window.DEMO ? window.DEMO.index : {};
    const index = Object.keys(idx).length ? idx : DEMO_IDX;

    nodes = [];
    edges = [];

    const typeColors = {
      error: '#ef4444', decision: '#3b82f6', fact: '#6366f1',
      lesson: '#a855f7', criteria: '#14b8a6', episode: '#f59e0b',
      diary: '#ec4899', budget: '#10b981', project: '#6b7280',
    };

    // Crear nodos
    for (const [id, m] of Object.entries(index)) {
      if (filter !== 'all' && m.type !== filter) continue;
      const angle = Math.random() * Math.PI * 2;
      const dist = 100 + Math.random() * 150;
      nodes.push({
        id, type: m.type, title: m.title || '(sin título)',
        confidence: m.confidence, tags: m.tags,
        x: canvas.width / 2 + Math.cos(angle) * dist,
        y: canvas.height / 2 + Math.sin(angle) * dist,
        vx: 0, vy: 0, r: m.type === 'error' ? 8 : 6,
        color: typeColors[m.type] || '#7d8590',
      });
    }

    // Crear aristas (relaciones)
    for (const [id, m] of Object.entries(index)) {
      if (filter !== 'all' && m.type !== filter) continue;
      // born_from
      if (m.born_from) {
        for (const ref of (Array.isArray(m.born_from) ? m.born_from : [m.born_from])) {
          const target = nodes.find(n => n.id === ref);
          if (target) edges.push({ from: nodes.find(n => n.id === id), to: target, type: 'born' });
        }
      }
      // supersedes
      if (m.supersedes) {
        const target = nodes.find(n => n.id === m.supersedes);
        if (target) edges.push({ from: nodes.find(n => n.id === id), to: target, type: 'supersedes' });
      }
      // files compartidos (conecta memorias que tocan los mismos archivos)
      if (m.files && m.files.length) {
        for (const other of nodes) {
          if (other.id === id) continue;
          const otherMem = index[other.id];
          if (otherMem && otherMem.files) {
            const shared = m.files.filter(f => (otherMem.files || []).includes(f));
            if (shared.length) {
              edges.push({ from: nodes.find(n => n.id === id), to: other, type: 'shared', shared });
            }
          }
        }
      }
    }

    // Limitar aristas para rendimiento
    if (edges.length > 200) edges = edges.slice(0, 200);

    // Renderizar leyenda
    const legend = document.getElementById('graph-legend');
    if (legend) {
      const types = new Set(nodes.map(n => n.type));
      legend.innerHTML = Array.from(types).map(t => `<div class="graph-legend__item"><span class="graph-legend__dot" style="background:${typeColors[t] || '#7d8590'}"></span>${t}</div>`).join('');
    }

    // Iniciar animación
    if (animId) cancelAnimationFrame(animId);
    animate();
  }

  function animate() {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    // Física: repulsión entre nodos
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[j].x - nodes[i].x;
        const dy = nodes[j].y - nodes[i].y;
        const dist = Math.hypot(dx, dy) || 1;
        const force = 800 / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        nodes[i].vx -= fx; nodes[i].vy -= fy;
        nodes[j].vx += fx; nodes[j].vy += fy;
      }
    }

    // Atracción por aristas
    for (const e of edges) {
      if (!e.from || !e.to) continue;
      const dx = e.to.x - e.from.x;
      const dy = e.to.y - e.from.y;
      const dist = Math.hypot(dx, dy) || 1;
      const force = (dist - 120) * 0.01;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      e.from.vx += fx; e.from.vy += fy;
      e.to.vx -= fx; e.to.vy -= fy;
    }

    // Centro de gravedad
    for (const n of nodes) {
      n.vx += (canvas.width / 2 - n.x) * 0.001;
      n.vy += (canvas.height / 2 - n.y) * 0.001;
      // Amortiguación
      n.vx *= 0.85;
      n.vy *= 0.85;
      // Actualizar posición
      if (n !== dragNode) { n.x += n.vx; n.y += n.vy; }
    }

    // Dibujar aristas
    for (const e of edges) {
      if (!e.from || !e.to) continue;
      ctx.strokeStyle = e.type === 'shared' ? 'rgba(125,133,144,0.1)' : 'rgba(99,102,241,0.3)';
      ctx.lineWidth = e.type === 'shared' ? 0.5 : 1.5;
      ctx.beginPath();
      ctx.moveTo(e.from.x, e.from.y);
      ctx.lineTo(e.to.x, e.to.y);
      ctx.stroke();
    }

    // Dibujar nodos
    for (const n of nodes) {
      const isHover = n === hoveredNode;
      ctx.fillStyle = n.color;
      ctx.globalAlpha = isHover ? 1 : 0.8;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r + (isHover ? 3 : 0), 0, Math.PI * 2);
      ctx.fill();
      // Glow si stale
      if (n.stale) {
        ctx.strokeStyle = 'rgba(168,85,247,0.4)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r + 5, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      // Label si está hover o es grande
      if (isHover || n.r > 7) {
        ctx.fillStyle = '#e8ebf0';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(n.id, n.x, n.y - n.r - 5);
      }
    }

    ctx.restore();
    animId = requestAnimationFrame(animate);
  }

  window.renderGraphView = renderGraphView;
})();
