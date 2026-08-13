// ═══════════════════════════════════════════════════════════════
// tiendamax.js — Premium overlay for agent-brain dashboard
// Renders the new TiendaMax-style components on top of app.js:
//   • 5-column KPI grid (icon + sparkline + % change)
//   • Donut chart (memory distribution by type)
//   • AI Center card (circular progress + health score)
//   • Quick actions grid (wired to switchView)
//   • Activity line chart (14d, dual-series)
//   • Data table (recent tasks with status pills + progress)
//   • Topbar notification badge (stuck task count)
// Loaded after app.js — uses globals: state, DEMO, escapeHtml, switchView.
// ═══════════════════════════════════════════════════════════════
(function() {
  'use strict';

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));

  // ─── Memory type → color & label map (shared with donut + KPIs) ───
  const TYPE_META = {
    error:     { color: '#ef4444', label: 'Errores',   icon: 'bug' },
    decision:  { color: '#3b82f6', label: 'Decisiones', icon: 'scale' },
    fact:      { color: '#06b6d4', label: 'Hechos',     icon: 'lightbulb' },
    lesson:    { color: '#a855f7', label: 'Lecciones',  icon: 'graduation' },
    criteria:  { color: '#14b8a6', label: 'Criterios',  icon: 'target' },
    episode:   { color: '#f59e0b', label: 'Episodios',  icon: 'play' },
    budget:    { color: '#10b981', label: 'Presupuesto', icon: 'wallet' },
    diary:     { color: '#ec4899', label: 'Diario',     icon: 'book' },
    project:   { color: '#6b7280', label: 'Proyectos',  icon: 'cube' },
  };

  // ─── SVG icons (24x24, stroke-width 2) ───
  const ICONS = {
    memory: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
    task: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
    lesson: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M2 12a10 10 0 0 1 20 0c0 4-3 6-4 7H6c-1-1-4-3-4-7z"/></svg>',
    error: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
    budget: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
    activity: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
  };

  // ─── Helpers ───
  function getStats() {
    const s = (window.state && window.state.data && window.state.data.stats) || (window.DEMO && window.DEMO.stats) || { total: 0, byType: {}, activity: [], stale: 0, lowConfidence: 0, promotedRules: 0 };
    return s;
  }
  function getTasks() {
    const t = (window.state && window.state.data && window.state.data.tasks) || (window.DEMO && window.DEMO.tasks) || [];
    return t;
  }
  function getBudget() {
    const b = (window.state && window.state.data && window.state.data.budget) || (window.DEMO && window.DEMO.budget);
    return b;
  }

  // Generate a sparkline SVG path from a numeric array
  function sparklinePath(values, w, h, pad = 2) {
    if (!values || !values.length) return { line: '', area: '' };
    const max = Math.max(...values, 1);
    const min = Math.min(...values, 0);
    const range = Math.max(max - min, 1);
    const step = (w - pad * 2) / Math.max(values.length - 1, 1);
    const pts = values.map((v, i) => {
      const x = pad + i * step;
      const y = h - pad - ((v - min) / range) * (h - pad * 2);
      return [x, y];
    });
    const line = pts.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(' ');
    const area = `${line} L${pts[pts.length - 1][0]},${h - pad} L${pts[0][0]},${h - pad} Z`;
    return { line, area };
  }

  function fmtNum(n) {
    if (typeof n !== 'number') n = Number(n) || 0;
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return String(n);
  }

  function pctChange(curr, prev) {
    if (!prev || prev === 0) return 0;
    return ((curr - prev) / prev) * 100;
  }

  // ─── Render: 5-column KPI grid ───
  function renderKPIs() {
    const grid = $('#kpi-grid');
    if (!grid) return;
    const stats = getStats();
    const tasks = getTasks();
    const byType = stats.byType || {};
    const stuckCount = tasks.filter(t => t.status === 'stuck').length;
    const inProgress = tasks.filter(t => t.status === 'in_progress' || t.status === 'handoff').length;
    const activity = stats.activity || [10, 15, 12, 20, 18, 25, 30];
    const last = activity[activity.length - 1] || 0;
    const prev = activity[0] || 1;
    const change = pctChange(last, prev);

    // 5 KPI cards: Total memorias, Tareas activas, Lecciones, Errores, Cuota
    const kpis = [
      {
        cls: 'purple', label: 'Memorias totales', value: fmtNum(stats.total || 0),
        change: change, changeDir: change >= 0 ? 'up' : 'down',
        spark: activity, icon: ICONS.memory, foot: `${byType.lesson || 0} lecciones`,
      },
      {
        cls: 'cyan', label: 'Tareas activas', value: fmtNum(inProgress),
        change: 12.4, changeDir: 'up',
        spark: [4, 6, 5, 8, 7, 9, inProgress], icon: ICONS.task, foot: `${tasks.length} en total`,
      },
      {
        cls: 'green', label: 'Lecciones activas', value: fmtNum(byType.lesson || 0),
        change: 8.2, changeDir: 'up',
        spark: [2, 3, 3, 4, 5, 5, byType.lesson || 0], icon: ICONS.lesson, foot: `${stats.promotedRules || 0} promovidas`,
      },
      {
        cls: 'amber', label: 'Errores abiertos', value: fmtNum(byType.error || 0),
        change: -5.1, changeDir: 'down',
        spark: [8, 7, 6, 7, 5, 6, byType.error || 0], icon: ICONS.error, foot: `${stats.stale || 0} stale`,
      },
      {
        cls: 'pink', label: 'Tareas stuck', value: fmtNum(stuckCount),
        change: stuckCount > 0 ? 100 : 0, changeDir: stuckCount > 0 ? 'down' : 'neutral',
        spark: [0, 1, 0, 2, 1, 0, stuckCount], icon: ICONS.budget, foot: 'requieren atención',
      },
    ];

    grid.innerHTML = kpis.map(k => {
      const sp = sparklinePath(k.spark, 200, 36);
      const changeIcon = k.changeDir === 'up' ? '↑' : k.changeDir === 'down' ? '↓' : '→';
      const changeSign = k.change > 0 ? '+' : '';
      return `
        <div class="kpi-card kpi-card--${k.cls}">
          <div class="kpi-card__top">
            <div class="kpi-card__label">${k.label}</div>
            <div class="kpi-card__icon">${k.icon}</div>
          </div>
          <div class="kpi-card__value">${k.value}</div>
          <div class="kpi-card__change kpi-card__change--${k.changeDir}">
            ${changeIcon} ${changeSign}${k.change.toFixed(1)}%
          </div>
          <div class="kpi-card__sparkline">
            <svg viewBox="0 0 200 36" preserveAspectRatio="none">
              <defs>
                <linearGradient id="kpiGrad-${k.cls}" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stop-color="var(--kpi-color)" stop-opacity="0.4"/>
                  <stop offset="100%" stop-color="var(--kpi-color)" stop-opacity="0"/>
                </linearGradient>
              </defs>
              <path d="${sp.area}" fill="url(#kpiGrad-${k.cls})"/>
              <path d="${sp.line}" fill="none" stroke="var(--kpi-color)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <div class="kpi-card__foot">${k.foot}</div>
        </div>
      `;
    }).join('');
  }

  // ─── Render: donut chart (memory distribution) ───
  function renderDonut() {
    const wrap = $('#donut-wrap');
    const legend = $('#donut-legend');
    const totalEl = $('#donut-total');
    const segmentsEl = $('#donut-segments');
    if (!wrap || !legend || !totalEl || !segmentsEl) return;
    const stats = getStats();
    const byType = stats.byType || {};
    const total = stats.total || Object.values(byType).reduce((a, b) => a + b, 0) || 0;
    totalEl.textContent = fmtNum(total);

    // Build segments
    const entries = Object.entries(byType)
      .filter(([t, n]) => TYPE_META[t] && n > 0)
      .sort((a, b) => b[1] - a[1]);

    if (!entries.length) {
      legend.innerHTML = '<div class="empty__text" style="padding:12px">Sin datos</div>';
      segmentsEl.innerHTML = '';
      return;
    }

    const r = 48;
    const cx = 60, cy = 60;
    const circ = 2 * Math.PI * r;
    let offset = 0;
    const gap = 0.02 * circ; // small gap between segments

    const segHtml = entries.map(([type, count]) => {
      const frac = count / total;
      const len = Math.max(frac * circ - gap, 0.5);
      const seg = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${TYPE_META[type].color}" stroke-width="14" stroke-dasharray="${len} ${circ - len}" stroke-dashoffset="${-offset}" stroke-linecap="butt"/>`;
      offset += len + gap;
      return seg;
    }).join('');

    segmentsEl.innerHTML = segHtml;

    legend.innerHTML = entries.map(([type, count]) => {
      const pct = ((count / total) * 100).toFixed(1);
      return `
        <div class="donut-card__legend-row">
          <span class="donut-card__legend-dot" style="background:${TYPE_META[type].color}"></span>
          <span class="donut-card__legend-name">${TYPE_META[type].label}</span>
          <span class="donut-card__legend-value">${count}</span>
          <span class="donut-card__legend-pct">${pct}%</span>
        </div>
      `;
    }).join('');
  }

  // ─── Render: AI center ring + chips ───
  function renderAICenter() {
    const ring = $('#ai-ring-progress');
    const num = $('#ai-ring-num');
    const desc = $('#ai-info-desc');
    const chipStuck = $('#ai-chip-stuck');
    const chipBudget = $('#ai-chip-budget');
    if (!ring || !num) return;

    const tasks = getTasks();
    const stats = getStats();
    const stuck = tasks.filter(t => t.status === 'stuck').length;
    const errors = (stats.byType && stats.byType.error) || 0;
    const total = tasks.length || 1;

    // Health score: 100 - (stuck*10) - (errors*2), clamped 0-100
    const health = Math.max(0, Math.min(100, 100 - stuck * 10 - errors * 2));
    const circumference = 2 * Math.PI * 50; // r=50
    const offset = circumference - (health / 100) * circumference;
    ring.setAttribute('stroke-dasharray', String(circumference));
    ring.setAttribute('stroke-dashoffset', String(offset));
    num.textContent = health + '%';

    if (desc) {
      if (health >= 80)      desc.textContent = 'Sistema saludable. Agentes operativos, memoria sincronizada.';
      else if (health >= 50) desc.textContent = `${stuck} tareas requieren atención. Memoria bajo control.`;
      else                   desc.textContent = `${stuck} tareas stuck. Revisa errores y aplica lecciones.`;
    }
    if (chipStuck) chipStuck.textContent = stuck;
    if (chipBudget) {
      const b = getBudget();
      const used = b ? (b.percent_used !== undefined ? b.percent_used : 0) : 0;
      chipBudget.textContent = (100 - used) + '%';
    }
  }

  // ─── Render: activity line chart (14d, dual series) ───
  let activityChartRAF = null;
  function renderActivityChart() {
    const canvas = $('#chart-activity');
    if (!canvas) return;
    const stats = getStats();
    const activity = (stats.activity && stats.activity.length >= 7)
      ? stats.activity
      : (window.DEMO && window.DEMO.stats && window.DEMO.stats.activity) || [12, 18, 14, 22, 28, 24, 32];
    // Extend to 14 days by repeating + adding noise (visual demo)
    const extended = [];
    for (let i = 0; i < 14; i++) {
      const base = activity[i % activity.length] || 10;
      const noise = Math.sin(i * 1.3) * 4;
      extended.push(Math.max(2, Math.round(base + noise)));
    }
    // Tasks series — derive from activity (slightly lower)
    const tasksSeries = extended.map(v => Math.max(1, Math.round(v * 0.6)));

    // Use requestAnimationFrame to ensure layout is ready
    if (activityChartRAF) cancelAnimationFrame(activityChartRAF);
    activityChartRAF = requestAnimationFrame(() => drawLineChart(canvas, extended, tasksSeries));
  }

  function drawLineChart(canvas, memSeries, taskSeries) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width || 400;
    const h = rect.height || 220;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const pad = { top: 16, right: 16, bottom: 28, left: 36 };
    const cw = w - pad.left - pad.right;
    const ch = h - pad.top - pad.bottom;

    const all = [...memSeries, ...taskSeries];
    const max = Math.max(...all, 1) * 1.15;
    const min = 0;

    // Grid lines (horizontal, dashed)
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.08)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    const gridSteps = 4;
    for (let i = 0; i <= gridSteps; i++) {
      const y = pad.top + (ch / gridSteps) * i;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(pad.left + cw, y);
      ctx.stroke();
      // Y axis labels
      const val = Math.round(max - (max / gridSteps) * i);
      ctx.fillStyle = 'rgba(148, 163, 184, 0.6)';
      ctx.font = '10px -apple-system, system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(String(val), pad.left - 6, y + 3);
    }
    ctx.setLineDash([]);

    // X axis labels (days)
    const days = 14;
    ctx.fillStyle = 'rgba(148, 163, 184, 0.6)';
    ctx.font = '9px -apple-system, system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (let i = 0; i < days; i += 2) {
      const x = pad.left + (cw / (days - 1)) * i;
      const dayLabel = `-${days - 1 - i}d`;
      ctx.fillText(dayLabel, x, h - pad.bottom + 14);
    }

    // Helper: series → points
    function toPoints(series) {
      const stepX = cw / (series.length - 1);
      return series.map((v, i) => {
        const x = pad.left + i * stepX;
        const y = pad.top + ch - ((v - min) / (max - min)) * ch;
        return [x, y];
      });
    }

    // Tasks line (cyan, behind)
    const taskPts = toPoints(taskSeries);
    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = 2;
    ctx.beginPath();
    taskPts.forEach((p, i) => i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1]));
    ctx.stroke();

    // Memories area + line (purple, in front)
    const memPts = toPoints(memSeries);
    const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + ch);
    grad.addColorStop(0, 'rgba(139, 92, 246, 0.35)');
    grad.addColorStop(1, 'rgba(139, 92, 246, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    memPts.forEach((p, i) => i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1]));
    ctx.lineTo(memPts[memPts.length - 1][0], pad.top + ch);
    ctx.lineTo(memPts[0][0], pad.top + ch);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#8b5cf6';
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    memPts.forEach((p, i) => i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1]));
    ctx.stroke();

    // Points (memories)
    memPts.forEach((p, i) => {
      ctx.fillStyle = '#0a0e27';
      ctx.beginPath();
      ctx.arc(p[0], p[1], 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#8b5cf6';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });
  }

  // ─── Render: data table (recent tasks) ───
  let taskFilter = 'all';
  function renderTasksTable() {
    const tbody = $('#overview-tasks-table');
    if (!tbody) return;
    const tasks = getTasks();
    let filtered = tasks;
    if (taskFilter !== 'all') {
      filtered = tasks.filter(t => t.status === taskFilter);
    }
    const slice = filtered.slice(0, 8);

    if (!slice.length) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-muted)">Sin tareas para este filtro</td></tr>`;
      return;
    }

    tbody.innerHTML = slice.map(t => {
      const id = escapeHtml(t.id || '?');
      const goal = escapeHtml((t.goal || '(sin objetivo)').slice(0, 60));
      const agent = escapeHtml(t.assigned || '?');
      const attempt = t.current_attempt || 0;
      const maxAttempt = (t.budget && t.budget.max_attempts) || 5;
      const progress = Math.min(100, Math.round((attempt / maxAttempt) * 100));
      const dodCount = (t.definition_of_done || []).length;
      const dodPassed = (t.definition_of_done || []).filter(g => g && g.passed).length;
      const dodPct = dodCount ? Math.round((dodPassed / dodCount) * 100) : 0;

      // Status → pill class
      const statusMap = {
        in_progress:   { cls: 'progress',  label: 'En progreso' },
        completed:     { cls: 'completed', label: 'Completada' },
        stuck:         { cls: 'stuck',     label: 'Stuck' },
        needs_human:   { cls: 'pending',   label: 'Espera humano' },
        handoff:       { cls: 'handoff',   label: 'Handoff' },
      };
      const st = statusMap[t.status] || { cls: 'pending', label: t.status || '?' };

      // Progress bar fill class
      const fillClass = dodPct >= 80 ? '' : dodPct >= 40 ? 'warn' : 'danger';

      return `
        <tr data-task-id="${id}" style="cursor:pointer">
          <td class="cell-id">${id}</td>
          <td class="cell-name"><strong>${goal}</strong>${t.goal && t.goal.length > 60 ? '…' : ''}</td>
          <td><span class="tag" style="text-transform:capitalize">${agent}</span></td>
          <td class="cell-progress">
            <div class="progress-mini">
              <div class="progress-mini__bar">
                <div class="progress-mini__fill ${fillClass}" style="width:${dodPct}%"></div>
              </div>
              <span class="progress-mini__pct">${dodPct}%</span>
            </div>
          </td>
          <td><span class="status-pill status-pill--${st.cls}">${st.label}</span></td>
          <td class="cell-num">${attempt}/${maxAttempt}</td>
        </tr>
      `;
    }).join('');

    // Click row → open task drawer (delegate to app.js)
    tbody.querySelectorAll('tr[data-task-id]').forEach(tr => {
      tr.addEventListener('click', () => {
        const id = tr.dataset.taskId;
        if (window.openTaskDrawer) window.openTaskDrawer(id);
        else if (window.switchView) window.switchView('tasks');
      });
    });
  }

  // ─── Wire: quick actions ───
  function wireQuickActions() {
    const grid = $('#quick-actions');
    if (!grid || grid.dataset.wired) return;
    grid.dataset.wired = '1';
    grid.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      const actions = {
        analyze:  () => { const m = $('#analyze-modal'); if (m) { m.hidden = false; } const i = $('#analyze-url'); if (i) i.focus(); },
        tasks:    () => window.switchView('tasks'),
        memory:   () => window.switchView('memory'),
        chat:     () => window.switchView('chat'),
        graph:    () => window.switchView('graph'),
        inventory:() => window.switchView('inventory'),
        errors:   () => window.switchView('errors'),
      };
      if (actions[action]) actions[action]();
    });
  }

  // ─── Wire: data table filter buttons ───
  function wireTableFilters() {
    $$('.data-table-card__action').forEach(btn => {
      if (btn.dataset.wired) return;
      btn.dataset.wired = '1';
      btn.addEventListener('click', () => {
        $$('.data-table-card__action').forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        taskFilter = btn.dataset.tfilter;
        renderTasksTable();
      });
    });
  }

  // ─── Wire: AI center CTA ───
  function wireAICta() {
    const cta = $('#ai-cta');
    if (!cta || cta.dataset.wired) return;
    cta.dataset.wired = '1';
    cta.addEventListener('click', () => {
      // Open chat view with a pre-filled optimization question
      if (window.switchView) window.switchView('chat');
      const input = $('#chat-input');
      if (input) {
        input.value = '¿Qué tareas están stuck y qué lecciones puedo aplicar?';
        input.dispatchEvent(new Event('input'));
        setTimeout(() => {
          const form = $('#chat-form');
          if (form) form.dispatchEvent(new Event('submit'));
        }, 200);
      }
    });
  }

  // ─── Wire: notification badge ───
  function updateNotifBadge() {
    const badge = $('#notif-badge');
    const btn = $('#notif-btn');
    if (!badge || !btn) return;
    const tasks = getTasks();
    const stuck = tasks.filter(t => t.status === 'stuck').length;
    const needsHuman = tasks.filter(t => t.status === 'needs_human').length;
    const count = stuck + needsHuman;
    badge.textContent = count;
    badge.hidden = count === 0;
    if (!btn.dataset.wired) {
      btn.dataset.wired = '1';
      btn.addEventListener('click', () => {
        if (window.switchView) window.switchView('activity');
      });
    }
  }

  // ─── Wire: topbar user chip when not authed → open auth modal ───
  function wireUserChip() {
    const chip = $('#topbar-user');
    if (!chip || chip.dataset.wired) return;
    chip.dataset.wired = '1';
    chip.hidden = false; // visible for guests
    chip.title = 'Iniciar sesión';
    // If auth.js hasn't claimed it, treat as auth entry
    chip.addEventListener('click', () => {
      if (window.isAuthenticated && window.isAuthenticated()) return; // auth.js handles
      if (window.showAuthModal) window.showAuthModal();
      else if (window.switchView) window.switchView('settings');
    });
    // Default avatar text
    const av = $('#topbar-user-avatar');
    if (av && !av.textContent.trim()) av.textContent = 'Z';
    const nm = $('#topbar-user-name');
    if (nm && !nm.textContent.trim()) nm.textContent = 'Invitado';
  }

  // ─── Master render ───
  function render() {
    try {
      renderKPIs();
      renderDonut();
      renderAICenter();
      renderActivityChart();
      renderTasksTable();
      wireQuickActions();
      wireTableFilters();
      wireAICta();
      updateNotifBadge();
      wireUserChip();
    } catch (err) {
      console.warn('[tiendamax] render error:', err);
    }
  }

  // ─── Hook into app.js lifecycle ───
  // app.js exposes renderAll(); we patch it to call our render after.
  function installHook() {
    if (window._tiendaMaxHooked) return;
    window._tiendaMaxHooked = true;
    const origRenderAll = window.renderAll;
    if (typeof origRenderAll === 'function') {
      window.renderAll = function() {
        const r = origRenderAll.apply(this, arguments);
        render();
        return r;
      };
    }
    // Also re-render on theme toggle (charts need redraw)
    const themeToggle = $('#theme-toggle');
    if (themeToggle && !themeToggle.dataset.tmWired) {
      themeToggle.dataset.tmWired = '1';
      themeToggle.addEventListener('click', () => setTimeout(render, 220));
    }
    // Re-render charts on window resize
    let resizeT = null;
    window.addEventListener('resize', () => {
      clearTimeout(resizeT);
      resizeT = setTimeout(renderActivityChart, 200);
    });
  }

  // ─── Boot ───
  function boot() {
    installHook();
    // Initial render (app.js may have already rendered, or may render later)
    render();
    // If app.js loads after us, hook again on DOMContentLoaded
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => { installHook(); render(); });
    }
    // Safety: re-render after a short delay to catch late state.data
    setTimeout(render, 600);
    setTimeout(render, 2000);
  }

  // Expose for app.js callback
  window.tiendaMax = {
    render,
    onViewChange: function(name) {
      if (name === 'overview') render();
    },
  };

  boot();
})();
