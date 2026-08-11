// ═══════════════════════════════════════════════════════════════
// agent-brain · dashboard app
// Premium: sparklines, command palette, keyboard nav, theme toggle
// ═══════════════════════════════════════════════════════════════

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
const params = new URLSearchParams(location.search);
const DEMO_MODE = params.get('demo') === '1' || params.get('source') === 'preview';

// ─── DEMO DATA (rich, realistic) ───
const DEMO = {
  stats: {
    total: 47, byType: { error: 12, decision: 8, fact: 15, lesson: 6, criteria: 3, episode: 28, budget: 14, diary: 7 },
    stale: 2, lowConfidence: 1, promotedRules: 4,
    generatedAt: new Date().toISOString(),
    activity: [12, 18, 14, 22, 28, 24, 32], // 7d
  },
  tasks: [
    { id: 'TASK-0042', goal: 'Investigar NaN en calculateTotal tras eliminar producto', project: 'tiendamax', status: 'in_progress', assigned: 'code', current_attempt: 2, budget: { max_attempts: 5 }, definition_of_done: [{}, {}, {}, {}, {}], priority: 'high' },
    { id: 'TASK-0043', goal: 'Arreglar redirect a /404 tras login en AXONTECH', project: 'axontech', status: 'handoff', assigned: 'research', current_attempt: 1, budget: { max_attempts: 5 }, definition_of_done: [{}, {}], priority: 'high' },
    { id: 'TASK-0044', goal: 'Auditar secretos en diff de PR #128', project: 'tiendamax', status: 'needs_human', assigned: 'security', current_attempt: 1, budget: { max_attempts: 3 }, definition_of_done: [{}], priority: 'medium' },
    { id: 'TASK-0041', goal: 'Refactorizar calculateTotal para usar reduce puro', project: 'tiendamax', status: 'stuck', assigned: 'code', current_attempt: 5, budget: { max_attempts: 5 }, definition_of_done: [{}, {}, {}], priority: 'medium' },
    { id: 'TASK-0040', goal: 'Actualizar dependencias Firebase a v10', project: 'tiendamax', status: 'in_progress', assigned: 'code', current_attempt: 1, budget: { max_attempts: 3 }, definition_of_done: [{}, {}], priority: 'low' },
    { id: 'TASK-0038', goal: 'Migrar _tmFetch a fetch nativo con interceptor', project: 'tiendamax', status: 'completed', assigned: 'code', current_attempt: 3, budget: { max_attempts: 5 }, definition_of_done: [{}, {}, {}], priority: 'medium' },
  ],
  errors: [
    { id: 'BUG-001', type: 'error', project: 'tiendamax', title: 'calculateTotal devuelve NaN al eliminar producto', tags: ['carrito', 'nan', 'referencia-invalida'], confidence: 95, stale: false, files: ['js/cart.js'], symbols: ['calculateTotal', 'removeItem'], status: 'open', severity: 'high' },
    { id: 'BUG-007', type: 'error', project: 'tiendamax', title: 'Checkout falla con tarjetas internacionales', tags: ['checkout', 'pago', 'tarjeta'], confidence: 70, stale: false, files: ['js/checkout.js'], symbols: ['processPayment'], status: 'investigating', severity: 'high' },
    { id: 'BUG-012', type: 'error', project: 'axontech', title: 'Login redirige a /404 tras auth exitosa', tags: ['login', 'redirect', 'auth'], confidence: 50, stale: false, files: ['src/auth/login.js'], symbols: ['handleCallback'], status: 'open', severity: 'medium' },
    { id: 'BUG-014', type: 'error', project: 'tiendamax', title: 'Carrito pierde items al recargar en Safari', tags: ['safari', 'localStorage', 'carrito'], confidence: 60, stale: true, files: ['js/cart.js'], symbols: ['saveCart'], status: 'regressed', severity: 'medium' },
    { id: 'BUG-019', type: 'error', project: 'axontech', title: 'WebSocket se desconecta cada 30s en producción', tags: ['websocket', 'timeout', 'producción'], confidence: 80, stale: false, files: ['src/realtime/socket.js'], symbols: ['keepAlive'], status: 'investigating', severity: 'high' },
  ],
  lessons: [
    { id: 'LESSON-0014', type: 'lesson', scope: 'general', title: 'NaN en cálculos suele ser integridad referencial', rule: 'Antes de sanear el tipo, verificar integridad referencial del dato.', anti_pattern: 'Number(x) || 0', times_applied: 4, times_prevented_failure: 3, promoted_to_rule: false, confidence: 85 },
    { id: 'LESSON-0021', type: 'lesson', scope: 'project:tiendamax', title: 'Safari no persiste localStorage en modo privado', rule: 'Detectar modo privado y usar fallback en memoria.', anti_pattern: 'Asumir localStorage funciona siempre', times_applied: 2, times_prevented_failure: 2, promoted_to_rule: false, confidence: 80 },
    { id: 'LESSON-0029', type: 'lesson', scope: 'general', title: 'Errores de auth suelen ser del redirect, no del login', rule: 'Revisar la URL de callback antes de tocar el flujo de login.', anti_pattern: 'Empezar debugging por el handler de login', times_applied: 5, times_prevented_failure: 4, promoted_to_rule: true, confidence: 90 },
    { id: 'LESSON-0033', type: 'lesson', scope: 'general', title: 'WebSocket timeout suele ser keepAlive, no conexión', rule: 'Verificar intervalo keepAlive antes de tocar reconexión.', anti_pattern: 'Aumentar timeouts de reconexión', times_applied: 3, times_prevented_failure: 3, promoted_to_rule: false, confidence: 88 },
  ],
  diary: {
    date: new Date().toISOString().slice(0, 10),
    highlight: 'ok',
    headline: 'Arreglado bug del carrito (TASK-0042). 1 lección nueva sobre NaN.',
    bullets: [
      'TASK-0042 cerrada con éxito tras 2 intentos. Devil bloqueó inicialmente por falta de gate G3.',
      'Budget: 38% tokens (45k/120k), 7% minutos (12/180). Estado OK.',
      'Lessons activas: 6. Una promovida a regla (LESSON-0029 → agents/research.md).',
      'Sin tareas STUCK. Sin throttled.',
    ],
    tomorrow_hint: 'Revisar si el mismo bug de NaN existe en checkout.js (mismo patrón).',
  },
  budget: {
    date: new Date().toISOString().slice(0, 10),
    kind: 'OK',
    tokens_used: 45000, tokens_limit: 120000, tokens_percent: 38,
    minutes_estimated: 12, minutes_limit: 180, minutes_percent: 7,
    calls: 23, failures: 1, tasks_throttled: 0,
    history: [25, 38, 42, 28, 55, 48, 38], // 7d
  },
  agents: [
    { name: 'orchestrator', icon: '🎭', role: 'Dispatcher principal', turns: 12, status: 'active' },
    { name: 'analyst', icon: '🔍', role: 'Audita repos externos en busca de bugs y mejoras', turns: 5, status: 'active' },
    { name: 'code', icon: '⚙️', role: 'Arregla bugs en código externo', turns: 28, status: 'active' },
    { name: 'research', icon: '🔬', role: 'Investiga causa raíz', turns: 9, status: 'active' },
    { name: 'test', icon: '✅', role: 'Verificador independiente', turns: 18, status: 'active' },
    { name: 'security', icon: '🛡️', role: 'Audita diffs y secretos', turns: 4, status: 'idle' },
    { name: 'devil', icon: '😈', role: 'Abogado del diablo', turns: 22, status: 'active', blocks: 3 },
    { name: 'learner', icon: '📝', role: 'Post-mortem y lecciones', turns: 8, status: 'idle' },
    { name: 'budget', icon: '💰', role: 'Vigila cuota de tokens', turns: 24, status: 'active' },
    { name: 'diarist', icon: '📅', role: 'Diario nocturno', turns: 7, status: 'idle' },
    { name: 'self_improver', icon: '🤖', role: 'Auto-mejora por PR', turns: 2, status: 'idle' },
    { name: 'inventory', icon: '📦', role: 'Compara inventarios entre repos', turns: 3, status: 'active' },
    { name: 'chat', icon: '💬', role: 'Interfaz conversacional', turns: 15, status: 'active' },
  ],
};

// Build index object from demo data
function buildDemoIndex() {
  const idx = {};
  for (const e of DEMO.errors) idx[e.id] = e;
  for (const l of DEMO.lessons) idx[l.id] = l;
  idx['CRIT-0001'] = { type: 'criteria', title: 'Prefiere archivos completos sobre snippets', confidence: 100 };
  idx['CRIT-0002'] = { type: 'criteria', title: 'Trabaja mobile-only desde la app de GitHub en 3G', confidence: 100 };
  idx['CRIT-0003'] = { type: 'criteria', title: 'Odias el !important acumulado en CSS', confidence: 100 };
  idx['DEC-0001'] = { type: 'decision', title: 'Firebase Realtime DB en lugar de Firestore', confidence: 90, scope: 'project:tiendamax' };
  idx['DEC-0002'] = { type: 'decision', title: 'Vanilla JS sin framework', confidence: 95, scope: 'project:tiendamax' };
  idx['DEC-0003'] = { type: 'decision', title: 'GitHub Actions como runtime de agentes', confidence: 100, scope: 'general' };
  return idx;
}
DEMO.index = buildDemoIndex();

// ─── Data path resolver ───
// En producción (GitHub Pages): los datos están en ./data/memory/ y ./data/tasks/
// En local (file:// o dev server): están en ../memory/ y ../tasks/
function dataPath(relativePath) {
  // Si la URL es github.io o similar (producción), usar ./data/...
  const isProduction = location.hostname.endsWith('github.io') ||
                       location.hostname.includes('githubusercontent.com') ||
                       params.get('prod') === '1';
  if (isProduction) {
    return './data/' + relativePath;
  }
  // Local: relativo al dashboard/
  return '../' + relativePath;
}

// ─── Helpers ───
function escapeHtml(t) {
  if (t == null) return '';
  return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

async function fetchJson(p) {
  try {
    const r = await fetch(p, { cache: 'no-cache' });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

async function fetchText(p) {
  try {
    const r = await fetch(p, { cache: 'no-cache' });
    if (!r.ok) return null;
    return await r.text();
  } catch { return null; }
}

function parseFrontmatter(raw) {
  if (!raw || !raw.startsWith('---')) return { data: {}, body: raw || '' };
  const end = raw.indexOf('\n---', 3);
  if (end === -1) return { data: {}, body: raw };
  const yaml = raw.slice(3, end).trim();
  const body = raw.slice(end + 4).replace(/^[\n\r]+/, '');
  const data = {};
  for (const line of yaml.split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const c = line.indexOf(':');
    if (c === -1) continue;
    const k = line.slice(0, c).trim();
    let v = line.slice(c + 1).trim();
    if (v.startsWith('[') && v.endsWith(']')) v = v.slice(1,-1).split(',').map(s => s.trim().replace(/^["']|["']$/g,'')).filter(Boolean);
    else if (v === 'null' || v === '') v = null;
    else if (/^-?\d+$/.test(v)) v = parseInt(v, 10);
    else if (v === 'true' || v === 'false') v = v === 'true';
    else v = v.replace(/^["']|["']$/g, '');
    data[k] = v;
  }
  return { data, body };
}

// ─── Sparkline generator ───
function sparkline(values, w = 180, h = 56) {
  if (!values?.length) return { line: '', area: '' };
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const step = w / (values.length - 1);
  const points = values.map((v, i) => {
    const x = i * step;
    const y = h - ((v - min) / range) * (h - 8) - 4;
    return [x, y];
  });
  const line = 'M ' + points.map(p => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L ');
  const area = `${line} L ${w} ${h} L 0 ${h} Z`;
  return { line, area };
}

// ─── State ───
const state = {
  currentView: 'overview',
  filters: { tasks: 'all', errors: 'all', lessons: 'all' },
  data: null,
  chatHistory: [],
  activityPollInterval: null,
};

// ─── Toast ───
function toast(text, icon = '', actionLabel = null, onAction = null) {
  const t = $('#toast');
  $('.toast__icon', t).textContent = icon;
  $('.toast__text', t).textContent = text;
  const btn = $('.toast__action', t);
  if (actionLabel) {
    btn.textContent = actionLabel;
    btn.onclick = () => { onAction?.(); t.hidden = true; };
    btn.hidden = false;
  } else { btn.hidden = true; }
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.hidden = true; }, 5000);
}

// ─── Navigation ───
function switchView(name) {
  state.currentView = name;
  $$('.view').forEach(v => v.classList.toggle('is-active', v.id === `view-${name}`));
  $$('.nav__item').forEach(b => b.classList.toggle('is-active', b.dataset.target === name));
  $$('.bottom-nav__item').forEach(b => b.classList.toggle('is-active', b.dataset.target === name));
  const titles = {
    overview: ['Vista general', 'Sistema multi-agente'],
    tasks: ['Tareas', `${state.data?.tasks?.length || 0} en total`],
    errors: ['Errores', 'Memoria de bugs abiertos'],
    lessons: ['Lecciones', 'Aprendizajes activas'],
    diary: ['Diario', 'Resumen nocturno auto-generado'],
    budget: ['Presupuesto', 'Cuota diaria de tokens y minutos'],
    agents: ['Agentes', '12 agentes especializados'],
    memory: ['Memoria', 'Todos los registros'],
    chat: ['Chat', 'Habla con tu sistema'],
    activity: ['Actividad', 'Feed en tiempo real'],
    metrics: ['Métricas', 'Tendencias del sistema'],
    inventory: ['Inventario', 'Compara productos entre repos'],
  };
  const [title, sub] = titles[name] || [name, ''];
  $('#view-title').textContent = title;
  $('#view-sub').textContent = sub;
  // Close mobile sidebar
  $('.app').classList.remove('sidebar-open');
  $('#sidebar-overlay').hidden = true;
  // Scroll to top
  $('#content').scrollTop = 0;
}

// ─── Render: hero + stats ───
function renderHero() {
  const stats = state.data?.stats;
  if (!stats) {
    $('#hero-subtitle').textContent = 'No hay datos todavía. El reindex.yml los generará esta noche.';
    $('#hero-pulse').className = 'pulse-dot pulse-dot--warn';
    $('#hero-eyebrow-text').textContent = 'Esperando datos';
    $('#stats-grid').innerHTML = '<div class="empty" style="grid-column:1/-1"><div class="empty__icon">📭</div><div class="empty__text">stats.json no encontrado</div></div>';
    return;
  }
  $('#brand-status').textContent = `${stats.total} memorias`;
  $('#hero-subtitle').textContent = `${stats.total} memorias · ${stats.byType.lesson || 0} lecciones · ${stats.promotedRules} reglas promovidas`;
  $('#hero-pulse').className = stats.stale > 0 ? 'pulse-dot pulse-dot--warn' : 'pulse-dot';
  $('#hero-eyebrow-text').textContent = stats.stale > 0 ? `${stats.stale} memorias stale` : 'Sistema activo';
  $('.hero__eyebrow').classList.toggle('warn', stats.stale > 0);

  // Sparkline
  const activity = stats.activity || [10, 15, 12, 20, 18, 25, 30];
  const sp = sparkline(activity);
  $('#sparkline-line').setAttribute('d', sp.line);
  $('#sparkline-area').setAttribute('d', sp.area);
  const last = activity[activity.length - 1];
  const prev = activity[0];
  const trend = prev ? ((last - prev) / prev) * 100 : 0;
  const trendEl = $('#hero-trend');
  trendEl.textContent = (trend >= 0 ? '+' : '') + trend.toFixed(0) + '%';
  trendEl.classList.toggle('negative', trend < 0);

  // Stats grid
  const cards = [
    { value: stats.total, label: 'memorias', kind: 'accent' },
    { value: stats.byType.error || 0, label: 'errores', kind: (stats.byType.error || 0) > 5 ? 'danger' : 'warning' },
    { value: stats.byType.lesson || 0, label: 'lecciones', kind: 'purple' },
    { value: stats.byType.criteria || 0, label: 'criterios', kind: 'teal' },
    { value: stats.stale, label: 'stale', kind: stats.stale > 0 ? 'warning' : 'success' },
    { value: stats.lowConfidence, label: 'baja conf', kind: stats.lowConfidence > 0 ? 'warning' : 'success' },
    { value: stats.promotedRules, label: 'reglas', kind: 'success' },
    { value: stats.byType.episode || 0, label: 'intentos', kind: 'accent' },
  ];
  $('#stats-grid').innerHTML = cards.map(c =>
    `<div class="stat-card stat-card--${c.kind}">
       <span class="stat-card__value">${c.value}</span>
       <span class="stat-card__label">${c.label}</span>
       <div class="stat-card__bar"></div>
     </div>`
  ).join('');

  // Update nav badges
  $('#nav-badge-tasks').textContent = state.data.tasks.filter(t => t.status !== 'completed').length;
  $('#nav-badge-errors').textContent = stats.byType.error || 0;
  $('#nav-badge-lessons').textContent = stats.byType.lesson || 0;
  $('#nav-badge-budget').textContent = (state.data.budget?.tokens_percent || 0) + '%';
}

// ─── Render: task card ───
function renderTaskCard(t) {
  const statusLabels = {
    in_progress: 'en progreso', completed: 'completada', stuck: 'stuck',
    needs_human: 'espera humano', handoff: 'handoff', throttled: 'throttled', blocked_by_devil: 'bloqueada',
  };
  const cardClass = t.status === 'stuck' ? 'card--stuck' :
                    t.status === 'needs_human' ? 'card--purple' :
                    t.status === 'completed' ? 'card--success' :
                    t.status === 'handoff' ? 'card--info' : '';
  const max = t.budget?.max_attempts || '?';
  const current = t.current_attempt || 0;
  const total = t.definition_of_done?.length || 0;
  const priorityTag = t.priority ? `<span class="tag tag--${t.priority === 'high' ? 'high' : t.priority === 'medium' ? 'medium' : 'low'}">${t.priority}</span>` : '';

  // Progress segments
  const segs = Array.from({ length: max }, (_, i) => {
    let cls = '';
    if (t.status === 'stuck' && i < current) cls = 'is-failed';
    else if (t.status === 'completed' && i < current) cls = 'is-filled';
    else if (i < current - 1) cls = 'is-filled';
    else if (i === current - 1 && t.status === 'in_progress') cls = 'is-current';
    else if (i < current) cls = 'is-filled';
    return `<div class="progress__seg ${cls}"></div>`;
  }).join('');

  return `
    <article class="card ${cardClass}" data-id="${t.id}">
      <div class="card__header">
        <h3 class="card__title">${escapeHtml(t.goal || '(sin objetivo)')}</h3>
        <span class="card__id">${t.id}</span>
      </div>
      <div class="card__meta">
        ${t.project ? `<span>proyecto <code>${escapeHtml(t.project)}</code></span>·` : ''}
        <span>agente <strong>${escapeHtml(t.assigned || '?')}</strong></span>·
        <span>intento <strong>${current}/${max}</strong></span>·
        <span>${total} gates</span>
        ${priorityTag}
      </div>
      <div class="progress">${segs}</div>
      <div style="margin-top: var(--s-3);">
        <span class="status-badge status-badge--${t.status}">${statusLabels[t.status] || t.status}</span>
      </div>
    </article>`;
}

// ─── Render: tasks list (filtered) ───
function renderTasks() {
  const filter = state.filters.tasks;
  let tasks = state.data?.tasks || [];
  if (filter !== 'all') tasks = tasks.filter(t => t.status === filter);
  const list = $('#tasks-list');
  if (!tasks.length) {
    list.innerHTML = '<div class="empty"><div class="empty__icon">📋</div><div class="empty__text">sin tareas con este filtro</div></div>';
    return;
  }
  list.innerHTML = tasks.map(renderTaskCard).join('');
}

// ─── Render: errors list (filtered) ───
function renderErrors() {
  const filter = state.filters.errors;
  let errors = Object.values(state.data?.index || {}).filter(m => m.type === 'error' && m.status !== 'resolved');
  if (filter === 'high') errors = errors.filter(e => e.severity === 'high' || e.severity === 'critical');
  else if (filter === 'stale') errors = errors.filter(e => e.stale);
  const list = $('#errors-list');
  if (!errors.length) {
    list.innerHTML = '<div class="empty"><div class="empty__icon">🎉</div><div class="empty__text">sin errores con este filtro</div></div>';
    return;
  }
  list.innerHTML = errors.map(e => {
    const sevClass = e.severity === 'high' ? 'tag--high' : e.severity === 'medium' ? 'tag--medium' : 'tag--low';
    return `
      <article class="card ${e.stale ? 'card--warning' : ''}" data-id="${e.id}">
        <div class="card__header">
          <h3 class="card__title">${escapeHtml(e.title)}</h3>
          <span class="card__id">${e.id}</span>
        </div>
        <div class="card__meta">
          ${e.project ? `<span>proyecto <code>${escapeHtml(e.project)}</code></span>·` : ''}
          <span>confidence <strong>${e.confidence}</strong></span>·
          <span>status <strong>${e.status}</strong></span>
          ${e.severity ? `<span class="tag ${sevClass}">${e.severity}</span>` : ''}
          ${e.stale ? '<span class="tag tag--stale">stale</span>' : ''}
        </div>
        ${e.files?.length ? `<div class="card__tags">${e.files.map(f => `<span class="tag">${escapeHtml(f)}</span>`).join('')}</div>` : ''}
      </article>`;
  }).join('');
}

// ─── Render: lessons list (filtered) ───
function renderLessons() {
  const filter = state.filters.lessons;
  let lessons = Object.values(state.data?.index || {}).filter(m => m.type === 'lesson' && !m.promoted_to_rule);
  if (filter === 'promotable') lessons = lessons.filter(l => l.times_prevented_failure >= 3);
  else if (filter === 'general') lessons = lessons.filter(l => l.scope === 'general');
  else if (filter === 'project') lessons = lessons.filter(l => l.scope?.startsWith('project:'));
  const list = $('#lessons-list');
  if (!lessons.length) {
    list.innerHTML = '<div class="empty"><div class="empty__icon">💡</div><div class="empty__text">sin lecciones con este filtro</div></div>';
    return;
  }
  list.innerHTML = lessons.map(l => {
    const promotable = l.times_prevented_failure >= 3;
    return `
      <article class="card ${promotable ? 'card--accent' : ''}" data-id="${l.id}">
        <div class="card__header">
          <h3 class="card__title">${escapeHtml(l.title)}</h3>
          <span class="card__id">${l.id}</span>
        </div>
        <div class="card__meta">
          <span>scope <code>${escapeHtml(l.scope || '?')}</code></span>·
          <span>aplicada <strong>${l.times_applied || 0}</strong></span>·
          <span>previno fallo <strong>${l.times_prevented_failure || 0}</strong></span>·
          <span>confidence <strong>${l.confidence}</strong></span>
          ${promotable ? '<span class="tag tag--accent">lista para promover</span>' : ''}
        </div>
        ${l.rule ? `<div class="card__body" style="margin-top: var(--s-2)"><strong>Regla:</strong> ${escapeHtml(l.rule)}</div>` : ''}
        ${l.anti_pattern ? `<div class="card__body" style="margin-top: var(--s-1)"><strong>Antipatrón:</strong> ${escapeHtml(l.anti_pattern)}</div>` : ''}
      </article>`;
  }).join('');
}

// ─── Render: diary ───
function renderDiary() {
  const diary = state.data?.diary;
  $('#diary-date').textContent = diary?.date || '—';
  const list = $('#diary-list');
  if (!diary) {
    list.innerHTML = '<div class="empty"><div class="empty__icon">📅</div><div class="empty__text">aún no hay entradas de diario</div><div class="empty__hint">El diarist corre a las 3 AM</div></div>';
    return;
  }
  const bullets = (diary.bullets || []).map(b => `<li>${escapeHtml(b)}</li>`).join('');
  list.innerHTML = `
    <article class="card card--diary highlight-${diary.highlight || 'ok'}">
      <h3 class="diary__headline">${escapeHtml(diary.headline)}</h3>
      <div class="diary__meta">
        <span class="pulse-dot ${diary.highlight === 'stuck' ? 'pulse-dot--danger' : diary.highlight === 'warning' ? 'pulse-dot--warn' : ''}"></span>
        <span>${diary.date}</span>·<span>${diary.highlight || 'ok'}</span>
      </div>
      ${bullets ? `<ul class="diary__bullets">${bullets}</ul>` : ''}
      ${diary.tomorrow_hint ? `<div class="diary__tomorrow"><strong>Pendiente:</strong> <span>${escapeHtml(diary.tomorrow_hint)}</span></div>` : ''}
    </article>`;
}

// ─── Render: budget ───
function renderBudget() {
  const b = state.data?.budget;
  $('#budget-status').textContent = b?.kind || '—';
  const list = $('#budget-list');
  if (!b) {
    list.innerHTML = '<div class="empty"><div class="empty__icon">💰</div><div class="empty__text">sin snapshots de presupuesto</div></div>';
    return;
  }
  const kind = (b.kind || 'OK').toLowerCase();
  const fillClass = kind === 'throttle' ? 'throttle' : kind === 'warn' ? 'warn' : '';
  const sp = sparkline(b.history || [10, 20, 30, 25, 40, 35, b.tokens_percent], 240, 60);

  list.innerHTML = `
    <article class="card card--budget ${kind}">
      <div class="card__header">
        <h3 class="card__title">Tokens</h3>
        <span class="status-badge status-badge--${kind === 'throttle' ? 'stuck' : kind === 'warn' ? 'needs_human' : 'completed'}">${b.kind}</span>
      </div>
      <div class="budget__row"><span>Cuota usada hoy</span><strong>${(b.tokens_used || 0).toLocaleString('es')} / ${(b.tokens_limit || 0).toLocaleString('es')} tokens</strong></div>
      <div class="budget__bar"><div class="budget__fill ${fillClass}" style="width: ${Math.min(100, b.tokens_percent)}%"></div></div>
      <div class="budget__row"><span class="budget__percent">${b.tokens_percent}%</span><span>de la cuota diaria</span></div>
      <div style="margin: var(--s-4) 0; text-align: center;">
        <svg width="100%" height="60" viewBox="0 0 240 60" preserveAspectRatio="none" style="max-width: 360px;">
          <defs><linearGradient id="bg-spark" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="var(--accent)" stop-opacity="0.3"/><stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>
          <path d="${sp.area}" fill="url(#bg-spark)"/>
          <path d="${sp.line}" fill="none" stroke="var(--accent)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <div class="card__meta" style="margin-top: var(--s-2)">
        <span>llamadas <strong>${b.calls}</strong></span>·
        <span>fallos <strong>${b.failures}</strong></span>
        ${b.tasks_throttled ? `· <span style="color:var(--danger)">throttled <strong>${b.tasks_throttled}</strong></span>` : ''}
      </div>
    </article>
    <article class="card card--budget ${kind}">
      <div class="card__header">
        <h3 class="card__title">Minutos de Actions</h3>
        <span class="card__id">estimado</span>
      </div>
      <div class="budget__row"><span>Consumido hoy</span><strong>${b.minutes_estimated || 0} / ${b.minutes_limit || 0} min</strong></div>
      <div class="budget__bar"><div class="budget__fill ${fillClass}" style="width: ${Math.min(100, b.minutes_percent)}%"></div></div>
      <div class="budget__row"><span class="budget__percent">${b.minutes_percent}%</span><span>del límite diario</span></div>
    </article>`;
}

// ─── Render: agents ───
function renderAgents() {
  const list = $('#agents-list');
  list.innerHTML = DEMO.agents.map(a => `
    <article class="agent-card">
      <div class="agent-card__icon">${a.icon}</div>
      <div class="agent-card__body">
        <h3 class="agent-card__title">${a.name} ${a.status === 'active' ? '<span class="pulse-dot" style="width:6px;height:6px"></span>' : ''}</h3>
        <div class="agent-card__sub">${escapeHtml(a.role)}</div>
        <div class="agent-card__stats">
          <span>turnos <strong>${a.turns}</strong></span>
          <span>estado <strong>${a.status}</strong></span>
          ${a.blocks ? `<span>blocks <strong>${a.blocks}</strong></span>` : ''}
        </div>
      </div>
    </article>`).join('');
}

// ─── Render: memory distribution ───
function renderMemoryOverview() {
  const stats = state.data?.stats;
  if (!stats) {
    $('#overview-memory').innerHTML = '<div class="empty"><div class="empty__text">sin datos</div></div>';
    return;
  }
  const types = [
    { k: 'error', label: 'errores', color: 'var(--danger)' },
    { k: 'decision', label: 'decisiones', color: 'var(--info)' },
    { k: 'fact', label: 'hechos', color: 'var(--accent)' },
    { k: 'lesson', label: 'lecciones', color: 'var(--purple)' },
    { k: 'criteria', label: 'criterios', color: 'var(--teal)' },
    { k: 'episode', label: 'episodios', color: 'var(--warning)' },
  ];
  const total = types.reduce((s, t) => s + (stats.byType[t.k] || 0), 0) || 1;
  const bars = types.map(t => {
    const n = stats.byType[t.k] || 0;
    const pct = (n / total) * 100;
    return `
      <div style="margin-bottom: var(--s-2)">
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
          <span style="color:var(--text-secondary)">${t.label}</span>
          <strong style="font-variant-numeric:tabular-nums">${n}</strong>
        </div>
        <div style="height:6px;background:var(--bg-elev-3);border-radius:var(--r-full);overflow:hidden">
          <div style="height:100%;width:${pct}%;background:${t.color};border-radius:var(--r-full);transition:width 0.6s var(--ease-out)"></div>
        </div>
      </div>`;
  }).join('');
  $('#overview-memory').innerHTML = bars;
}

// ─── Render: overview tasks (top 3) ───
function renderOverviewTasks() {
  const tasks = (state.data?.tasks || []).filter(t => t.status !== 'completed').slice(0, 3);
  if (!tasks.length) {
    $('#overview-tasks').innerHTML = '<div class="empty"><div class="empty__text">sin tareas activas</div></div>';
    return;
  }
  $('#overview-tasks').innerHTML = tasks.map(renderTaskCard).join('');
}

// ─── Render: overview diary ───
function renderOverviewDiary() {
  const diary = state.data?.diary;
  if (!diary) {
    $('#overview-diary').innerHTML = '<div class="empty"><div class="empty__text">sin diario todavía</div></div>';
    return;
  }
  $('#overview-diary').innerHTML = `
    <div class="card card--diary highlight-${diary.highlight}" style="border:none;padding:0;background:transparent">
      <h3 class="diary__headline" style="font-size:15px">${escapeHtml(diary.headline)}</h3>
      <div class="diary__meta"><span class="pulse-dot"></span><span>${diary.date}</span></div>
      <ul class="diary__bullets">${(diary.bullets || []).slice(0, 2).map(b => `<li>${escapeHtml(b)}</li>`).join('')}</ul>
    </div>`;
}

// ─── Render: overview budget ───
function renderOverviewBudget() {
  const b = state.data?.budget;
  if (!b) {
    $('#overview-budget').innerHTML = '<div class="empty"><div class="empty__text">sin datos</div></div>';
    return;
  }
  const kind = (b.kind || 'OK').toLowerCase();
  const fillClass = kind === 'throttle' ? 'throttle' : kind === 'warn' ? 'warn' : '';
  $('#overview-budget').innerHTML = `
    <div class="budget__row"><span>Tokens</span><strong>${b.tokens_percent}%</strong></div>
    <div class="budget__bar"><div class="budget__fill ${fillClass}" style="width: ${Math.min(100, b.tokens_percent)}%"></div></div>
    <div class="budget__row"><span>Minutos</span><strong>${b.minutes_percent}%</strong></div>
    <div class="budget__bar"><div class="budget__fill ${fillClass}" style="width: ${Math.min(100, b.minutes_percent)}%"></div></div>
    <div class="card__meta" style="margin-top: var(--s-3)">
      <span>${b.calls} llamadas</span>·<span>${b.failures} fallos</span>
    </div>`;
}

// ─── Render: memory view ───
function renderMemory() {
  const idx = state.data?.index || {};
  const all = Object.entries(idx).sort((a, b) => a[0].localeCompare(b[0]));
  $('#memory-count').textContent = all.length + ' registros';
  const list = $('#memory-list');
  if (!all.length) {
    list.innerHTML = '<div class="empty"><div class="empty__icon">🧠</div><div class="empty__text">sin memorias todavía</div></div>';
    return;
  }
  list.innerHTML = all.map(([id, m]) => {
    const cls = m.type === 'error' ? 'card--warning' : m.type === 'lesson' ? 'card--accent' : m.type === 'criteria' ? 'card--success' : m.type === 'decision' ? 'card--info' : '';
    return `
      <article class="card ${cls}" data-id="${id}">
        <div class="card__header">
          <h3 class="card__title">${escapeHtml(m.title || '(sin título)')}</h3>
          <span class="card__id">${id}</span>
        </div>
        <div class="card__meta">
          <span>tipo <strong>${m.type}</strong></span>·
          ${m.project ? `<span>proyecto <code>${escapeHtml(m.project)}</code></span>·` : ''}
          ${typeof m.confidence === 'number' ? `<span>confidence <strong>${m.confidence}</strong></span>` : ''}
          ${m.stale ? '<span class="tag tag--stale">stale</span>' : ''}
          ${m.promoted_to_rule ? '<span class="tag tag--success">regla</span>' : ''}
        </div>
      </article>`;
  }).join('');
}

// ─── Render all ───
function renderAll() {
  renderHero();
  renderOverviewTasks();
  renderOverviewDiary();
  renderOverviewBudget();
  renderMemoryOverview();
  renderTasks();
  renderErrors();
  renderLessons();
  renderDiary();
  renderBudget();
  renderAgents();
  renderMemory();
  renderActivity();
  renderMetrics();
}

// ─── Command palette ───
const cmdkState = { items: [], selected: 0 };

function buildCmdkItems() {
  const items = [];
  // Navigation
  const views = [
    { id: 'overview', label: 'Vista general', icon: '📊', group: 'Navegación' },
    { id: 'tasks', label: 'Tareas', icon: '📋', group: 'Navegación' },
    { id: 'errors', label: 'Errores', icon: '🐞', group: 'Navegación' },
    { id: 'lessons', label: 'Lecciones', icon: '💡', group: 'Navegación' },
    { id: 'diary', label: 'Diario', icon: '📅', group: 'Navegación' },
    { id: 'budget', label: 'Presupuesto', icon: '💰', group: 'Navegación' },
    { id: 'agents', label: 'Agentes', icon: '🤖', group: 'Navegación' },
    { id: 'memory', label: 'Memoria', icon: '🧠', group: 'Navegación' },
  ];
  for (const v of views) items.push({ ...v, action: () => switchView(v.id) });

  // Tasks
  for (const t of state.data?.tasks || []) {
    items.push({ id: t.id, label: t.goal, icon: '📋', sub: t.id, group: 'Tareas', action: () => switchView('tasks') });
  }
  // Errors
  for (const e of Object.values(state.data?.index || {}).filter(m => m.type === 'error')) {
    items.push({ id: e.id, label: e.title, icon: '🐞', sub: e.id, group: 'Errores', action: () => switchView('errors') });
  }
  // Lessons
  for (const l of Object.values(state.data?.index || {}).filter(m => m.type === 'lesson')) {
    items.push({ id: l.id, label: l.title, icon: '💡', sub: l.id, group: 'Lecciones', action: () => switchView('lessons') });
  }

  // Actions
  items.push({ id: 'theme', label: 'Cambiar tema claro/oscuro', icon: '🎨', group: 'Acciones', action: toggleTheme });
  items.push({ id: 'refresh', label: 'Recargar datos', icon: '🔄', group: 'Acciones', action: () => $('#refresh-btn').click() });
  items.push({ id: 'install', label: 'Instalar como app', icon: '⬇️', group: 'Acciones', action: () => $('#install-btn').click() });

  return items;
}

function openCmdk() {
  cmdkState.items = buildCmdkItems();
  cmdkState.selected = 0;
  $('#cmdk').hidden = false;
  $('#cmdk-input').value = '';
  $('#cmdk-input').focus();
  renderCmdk('');
}

function closeCmdk() {
  $('#cmdk').hidden = true;
}

function renderCmdk(query) {
  const q = query.toLowerCase().trim();
  const filtered = q ? cmdkState.items.filter(i => i.label.toLowerCase().includes(q) || i.id?.toLowerCase().includes(q)) : cmdkState.items;
  const groups = {};
  for (const item of filtered) {
    if (!groups[item.group]) groups[item.group] = [];
    groups[item.group].push(item);
  }
  const html = Object.entries(groups).map(([group, items]) => `
    <div class="cmdk__group">${group}</div>
    ${items.map((item, idx) => {
      const globalIdx = cmdkState.items.indexOf(item);
      const isSelected = globalIdx === cmdkState.selected;
      return `
        <div class="cmdk__item ${isSelected ? 'is-selected' : ''}" data-idx="${globalIdx}">
          <div class="cmdk__item-icon">${item.icon}</div>
          <div class="cmdk__item-body">
            <div class="cmdk__item-title">${escapeHtml(item.label)}</div>
            ${item.sub ? `<div class="cmdk__item-sub">${escapeHtml(item.sub)}</div>` : ''}
          </div>
        </div>`;
    }).join('')}
  `).join('');
  $('#cmdk-results').innerHTML = html || '<div class="cmdk__empty">Sin resultados para "' + escapeHtml(query) + '"</div>';

  // Attach click handlers
  $$('.cmdk__item').forEach(el => {
    el.addEventListener('click', () => {
      const idx = parseInt(el.dataset.idx);
      cmdkState.items[idx].action();
      closeCmdk();
    });
  });
}

// ─── Theme toggle ───
function toggleTheme() {
  const current = document.documentElement.dataset.theme;
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('agent-brain-theme', next);
}

function loadTheme() {
  const saved = localStorage.getItem('agent-brain-theme');
  if (saved) {
    document.documentElement.dataset.theme = saved;
  } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
    document.documentElement.dataset.theme = 'light';
  }
}

// ─── Service worker ───
async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('./sw.js', { scope: './' });
  } catch (err) {
    console.warn('[pwa] SW falló:', err.message);
  }
}

// ─── PWA install ───
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  $('#install-btn').hidden = false;
});

window.addEventListener('appinstalled', () => {
  $('#install-btn').hidden = true;
  toast('agent-brain instalado ✓', '✓');
});

// ─── Event handlers ───
function attachEvents() {
  // Nav clicks (sidebar)
  $$('.nav__item').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.target));
  });

  // Bottom nav (mobile)
  $$('.bottom-nav__item').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.target));
  });

  // Panel links
  $$('.panel__link').forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      switchView(a.dataset.target);
    });
  });

  // Sidebar toggle (collapse on desktop)
  $('#sidebar-toggle').addEventListener('click', () => {
    $('.app').classList.toggle('sidebar-collapsed');
  });

  // Mobile menu
  $('#menu-toggle').addEventListener('click', () => {
    $('.app').classList.toggle('sidebar-open');
    $('#sidebar-overlay').hidden = !$('.app').classList.contains('sidebar-open');
  });
  $('#sidebar-overlay').addEventListener('click', () => {
    $('.app').classList.remove('sidebar-open');
    $('#sidebar-overlay').hidden = true;
  });

  // Theme
  $('#theme-toggle').addEventListener('click', toggleTheme);

  // Refresh
  $('#refresh-btn').addEventListener('click', async () => {
    const btn = $('#refresh-btn');
    btn.style.transform = 'rotate(360deg)';
    btn.style.transition = 'transform 0.5s var(--ease)';
    setTimeout(() => { btn.style.transform = ''; btn.style.transition = ''; }, 500);
    await loadAll();
    toast('Datos actualizados', '✓');
  });

  // Install
  $('#install-btn').addEventListener('click', async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      $('#install-btn').hidden = true;
    } else {
      toast('Para instalar: menú ⋮ → "Instalar app"', '⬇️');
    }
  });

  // Search trigger → cmdk
  $('#search-trigger').addEventListener('click', openCmdk);

  // Cmdk backdrop click
  $$('#cmdk [data-close]').forEach(el => el.addEventListener('click', closeCmdk));

  // Cmdk input
  $('#cmdk-input').addEventListener('input', (e) => {
    cmdkState.selected = 0;
    renderCmdk(e.target.value);
  });

  // ─── Analyze repo modal ───
  const analyzeBtn = $('#analyze-btn');
  const fabAnalyze = $('#fab-analyze');
  const analyzeModal = $('#analyze-modal');
  const analyzeUrl = $('#analyze-url');
  const analyzeSubmit = $('#analyze-submit');

  const openAnalyzeModal = () => {
    analyzeModal.hidden = false;
    setTimeout(() => analyzeUrl.focus(), 100);
  };
  const closeAnalyzeModal = () => {
    analyzeModal.hidden = true;
    analyzeUrl.value = '';
    analyzeSubmit.disabled = true;
  };

  analyzeBtn?.addEventListener('click', openAnalyzeModal);
  fabAnalyze?.addEventListener('click', openAnalyzeModal);
  $$('#analyze-modal [data-close]').forEach(el => el.addEventListener('click', closeAnalyzeModal));

  // Validar URL mientras se escribe
  analyzeUrl.addEventListener('input', (e) => {
    const v = e.target.value.trim();
    const valid = /^(https?:\/\/github\.com\/)?[a-z0-9_-]+\/[a-z0-9_.-]+$/i.test(v);
    analyzeSubmit.disabled = !valid;
  });

  // Submit análisis
  analyzeSubmit.addEventListener('click', async () => {
    const url = analyzeUrl.value.trim();
    const focus = $('#analyze-focus').value;
    // Normalizar a owner/repo
    const normalized = url.replace(/^https?:\/\/github\.com\//i, '').replace(/\/$/, '');
    const title = `🔍 Analizar repo: ${normalized}`;
    const body = `analyze: https://github.com/${normalized}${focus ? `\n\nFoco: ${focus}` : ''}`;

    analyzeSubmit.disabled = true;
    analyzeSubmit.querySelector('span').textContent = 'Creando Issue…';

    try {
      // Crear Issue vía GitHub API
      const res = await fetch(`https://api.github.com/repos/${state.repo}/issues`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${state.token || localStorage.getItem('agent-brain-pat') || ''}`,
          'Accept': 'application/vnd.github+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          body,
          labels: ['agent-task'],
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `HTTP ${res.status}`);
      }

      const issue = await res.json();
      closeAnalyzeModal();
      toast(`Issue #${issue.number} creado — el agente analyst está trabajando`, '🔍', 'Ver Issue', () => {
        window.open(issue.html_url, '_blank');
      });
    } catch (err) {
      toast(`Error creando Issue: ${err.message}. Necesitas un PAT configurado.`, '⚠️');
      analyzeSubmit.disabled = false;
      analyzeSubmit.querySelector('span').textContent = 'Lanzar análisis';
    }
  });

  // ─── Task drawer ───
  const taskDrawer = $('#task-drawer');
  $$('#task-drawer [data-close]').forEach(el => el.addEventListener('click', () => {
    taskDrawer.hidden = true;
  }));

  // Click en una card de tarea abre el drawer
  document.addEventListener('click', (e) => {
    const card = e.target.closest('[data-id^="TASK-"]');
    if (!card) return;
    const taskId = card.dataset.id;
    openTaskDrawer(taskId);
  });

  // Filter chips
  $$('.filter-chips').forEach(group => {
    group.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      $$('.chip', group).forEach(c => c.classList.remove('is-active'));
      chip.classList.add('is-active');
      const parent = group.closest('.view');
      const viewName = parent.id.replace('view-', '');
      state.filters[viewName] = chip.dataset.filter;
      if (viewName === 'tasks') renderTasks();
      else if (viewName === 'errors') renderErrors();
      else if (viewName === 'lessons') renderLessons();
    });
  });

  // ─── Chat ───
  const chatForm = $('#chat-form');
  const chatInput = $('#chat-input');
  chatForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = chatInput.value.trim();
    if (q) sendChatMessage(q);
  });
  // Sugerencias
  $$('.chat__suggestion').forEach(btn => {
    btn.addEventListener('click', () => {
      const q = btn.dataset.q;
      chatInput.value = q;
      sendChatMessage(q);
    });
  });

  // ─── Inventory ───
  // Cargar valores guardados
  const savedRepoA = localStorage.getItem('inv-repo-a');
  const savedRepoB = localStorage.getItem('inv-repo-b');
  if (savedRepoA) $('#inv-repo-a').value = savedRepoA;
  if (savedRepoB) $('#inv-repo-b').value = savedRepoB;

  $('#compare-inventory-btn')?.addEventListener('click', () => {
    const repoA = $('#inv-repo-a').value.trim();
    const repoB = $('#inv-repo-b').value.trim();
    const pathA = $('#inv-path-a').value.trim();
    const pathB = $('#inv-path-b').value.trim();
    if (!repoA || !repoB) {
      toast('Especifica los dos repos a comparar', '⚠️');
      return;
    }
    // Guardar para próxima vez
    localStorage.setItem('inv-repo-a', repoA);
    localStorage.setItem('inv-repo-b', repoB);
    compareInventoriesNow(repoA, repoB, pathA, pathB);
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Cmd/Ctrl + K → command palette
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      if ($('#cmdk').hidden) openCmdk();
      else closeCmdk();
      return;
    }
    // Esc → close any overlay
    if (e.key === 'Escape') {
      if (!$('#cmdk').hidden) { closeCmdk(); return; }
      if (!$('#analyze-modal').hidden) { closeAnalyzeModal(); return; }
      if (!$('#task-drawer').hidden) { $('#task-drawer').hidden = true; return; }
    }
    // Arrow keys in cmdk
    if (!$('#cmdk').hidden) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        cmdkState.selected = Math.min(cmdkState.selected + 1, cmdkState.items.length - 1);
        renderCmdk($('#cmdk-input').value);
        scrollSelectedIntoView();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        cmdkState.selected = Math.max(cmdkState.selected - 1, 0);
        renderCmdk($('#cmdk-input').value);
        scrollSelectedIntoView();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (cmdkState.items[cmdkState.selected]) {
          cmdkState.items[cmdkState.selected].action();
          closeCmdk();
        }
      }
      return;
    }
    // Number keys → view switch (only when not in input)
    if (document.activeElement.tagName !== 'INPUT' && !e.metaKey && !e.ctrlKey) {
      const numMap = { '1': 'overview', '2': 'tasks', '3': 'errors', '4': 'lessons', '5': 'diary', '6': 'budget', '7': 'agents', '8': 'memory', '9': 'chat', '0': 'activity' };
      if (numMap[e.key]) {
        e.preventDefault();
        switchView(numMap[e.key]);
      }
    }
  });

  // Online/offline
  const updateOnline = () => {
    const el = $('#system-label');
    if (navigator.onLine) {
      el.textContent = 'en línea';
      $('#system-dot').className = 'system-card__dot';
    } else {
      el.textContent = 'sin conexión';
      $('#system-dot').className = 'system-card__dot';
      $('#system-dot').style.background = 'var(--warning)';
    }
  };
  window.addEventListener('online', () => { updateOnline(); toast('Volviste a estar en línea', '✓'); });
  window.addEventListener('offline', () => { updateOnline(); toast('Sin conexión — modo offline', '⚠️'); });
  updateOnline();
}

// ─── Task drawer ───
function openTaskDrawer(taskId) {
  const task = state.data?.tasks?.find(t => t.id === taskId);
  if (!task) return;
  const drawer = $('#task-drawer');
  $('#drawer-title').textContent = task.id;

  // Buscar episodios de esta tarea en la memoria
  const episodes = Object.entries(state.data?.index || {})
    .filter(([id, m]) => m.type === 'episode' && m.task_id === taskId)
    .map(([id, m]) => ({ id, ...m }))
    .sort((a, b) => (a.attempt || 0) - (b.attempt || 0));

  const statusLabels = {
    in_progress: 'en progreso', completed: 'completada', stuck: 'stuck',
    needs_human: 'espera humano', handoff: 'handoff', throttled: 'throttled', blocked_by_devil: 'bloqueada',
  };

  const gates = task.definition_of_done || [];
  const handoffs = task.handoffs || [];

  $('#drawer-body').innerHTML = `
    <div class="drawer__section">
      <div class="card__title" style="font-size: 15px; margin-bottom: var(--s-2)">${escapeHtml(task.goal)}</div>
      <div class="card__meta">
        ${task.project ? `<span>proyecto <code>${escapeHtml(task.project)}</code></span>·` : ''}
        <span>agente <strong>${escapeHtml(task.assigned || '?')}</strong></span>·
        <span>intento <strong>${task.current_attempt || 0}/${task.budget?.max_attempts || '?'}</strong></span>
      </div>
      <div style="margin-top: var(--s-3)">
        <span class="status-badge status-badge--${task.status}">${statusLabels[task.status] || task.status}</span>
      </div>
    </div>

    ${gates.length ? `
      <div class="drawer__section">
        <div class="drawer__section-title">Definition of Done (${gates.length} gates)</div>
        ${gates.map(g => `
          <div class="drawer__episode">
            <div class="drawer__episode-head">
              <span class="drawer__episode-num">${g.id}</span>
              <span class="drawer__episode-agent">${g.method || ''}</span>
            </div>
            <div class="drawer__episode-strategy">${escapeHtml(g.check)}</div>
            ${g.command ? `<div style="font-family: var(--font-mono); font-size: 11px; color: var(--text-muted); margin-top: 4px">${escapeHtml(g.command)}</div>` : ''}
          </div>
        `).join('')}
      </div>
    ` : ''}

    ${episodes.length ? `
      <div class="drawer__section">
        <div class="drawer__section-title">Historial de intentos (${episodes.length})</div>
        ${episodes.map(ep => `
          <div class="drawer__episode">
            <div class="drawer__episode-head">
              <span class="drawer__episode-num">Intento ${ep.attempt || '?'}</span>
              <span class="drawer__episode-agent">agente: ${escapeHtml(ep.agent || '?')}</span>
            </div>
            <div class="drawer__episode-strategy">${escapeHtml(ep.strategy || '(sin estrategia)')}</div>
            ${ep.gates_failed?.length ? `<div style="color: var(--danger); font-size: 11px; margin-top: 4px">gates fallidos: ${ep.gates_failed.join(', ')}</div>` : ''}
            ${ep.gates_passed?.length ? `<div style="color: var(--success); font-size: 11px; margin-top: 2px">gates verdes: ${ep.gates_passed.join(', ')}</div>` : ''}
          </div>
        `).join('')}
      </div>
    ` : ''}

    ${handoffs.length ? `
      <div class="drawer__section">
        <div class="drawer__section-title">Handoffs (${handoffs.length})</div>
        ${handoffs.map(h => `
          <div class="drawer__episode">
            <div class="drawer__episode-head">
              <span class="drawer__episode-num">${new Date(h.at).toLocaleString('es')}</span>
              <span class="drawer__episode-agent">${escapeHtml(h.agent)}</span>
            </div>
            <div class="drawer__episode-strategy">ruta: ${escapeHtml(h.route || '?')} → ${escapeHtml(h.next_agent || 'fin')}</div>
          </div>
        `).join('')}
      </div>
    ` : ''}

    ${task.issue ? `
      <div class="drawer__section">
        <a class="btn btn--ghost" href="https://github.com/${state.repo || ''}/issues/${task.issue}" target="_blank" style="width: 100%; justify-content: center">
          Ver Issue #${task.issue} en GitHub →
        </a>
      </div>
    ` : ''}
  `;

  drawer.hidden = false;
}

function scrollSelectedIntoView() {
  const sel = $('.cmdk__item.is-selected');
  if (sel) sel.scrollIntoView({ block: 'nearest' });
}

// ─── Clock ───
function startClock() {
  const update = () => {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const el = $('#system-time');
    if (el) el.textContent = `${h}:${m}`;
  };
  update();
  setInterval(update, 30_000);
}

// ─── Load data ───
async function loadAll() {
  if (DEMO_MODE) {
    state.data = DEMO;
    renderAll();
    return;
  }
  const [stats, index] = await Promise.all([
    fetchJson(dataPath('memory/stats.json')),
    fetchJson(dataPath('memory/index.json')),
  ]);
  state.data = {
    stats,
    index: index?.entries || index || {},
    tasks: [],
    diary: null,
    budget: null,
  };
  // Tasks
  const tasksIdx = await fetchJson(dataPath('tasks/index.json'));
  const taskIds = (tasksIdx?.tasks || [{ id: 'TASK-0001' }]).slice(0, 20).map(t => t.id);
  state.data.tasks = (await Promise.all(taskIds.map(id => fetchJson(dataPath(`tasks/${id}.json`))))).filter(Boolean);
  // Diary
  const diaryIdx = await fetchJson(dataPath('memory/diary/index.json'));
  if (diaryIdx?.entries?.length) {
    const last = diaryIdx.entries[diaryIdx.entries.length - 1];
    const raw = await fetchText(dataPath(`memory/diary/${last.file}`));
    if (raw) state.data.diary = parseFrontmatter(raw).data;
  }
  // Budget
  const budgetIdx = await fetchJson(dataPath('memory/budget/index.json'));
  if (budgetIdx?.entries?.length) {
    const last = budgetIdx.entries[budgetIdx.entries.length - 1];
    const raw = await fetchText(dataPath(`memory/budget/${last.file}`));
    if (raw) state.data.budget = parseFrontmatter(raw).data;
  }
  renderAll();
}

// ─── Chat ───
function addChatMessage(role, content) {
  const messages = $('#chat-messages');
  // Quitar empty state si existe
  const empty = messages.querySelector('.chat__empty');
  if (empty) empty.remove();

  const msg = document.createElement('div');
  msg.className = `chat__msg chat__msg--${role}`;
  const avatar = role === 'user' ? '🧑' : '🤖';
  msg.innerHTML = `
    <div class="chat__msg-avatar">${avatar}</div>
    <div class="chat__msg-body">${escapeHtml(content).replace(/\n/g, '<br>')}</div>
  `;
  messages.appendChild(msg);
  messages.scrollTop = messages.scrollHeight;
}

function addTypingIndicator() {
  const messages = $('#chat-messages');
  const empty = messages.querySelector('.chat__empty');
  if (empty) empty.remove();
  const msg = document.createElement('div');
  msg.className = 'chat__msg chat__msg--typing';
  msg.id = 'typing-indicator';
  msg.innerHTML = `
    <div class="chat__msg-avatar">🤖</div>
    <div class="chat__msg-body"></div>
  `;
  messages.appendChild(msg);
  messages.scrollTop = messages.scrollHeight;
}

function removeTypingIndicator() {
  const typing = $('#typing-indicator');
  if (typing) typing.remove();
}

async function sendChatMessage(question) {
  if (!question.trim()) return;
  addChatMessage('user', question);
  state.chatHistory.push({ role: 'user', content: question });
  $('#chat-input').value = '';
  $('#chat-send').disabled = true;
  addTypingIndicator();

  try {
    // En modo demo, simular respuesta
    if (DEMO_MODE) {
      await new Promise(r => setTimeout(r, 1200));
      removeTypingIndicator();
      const demoAnswer = getDemoChatAnswer(question);
      addChatMessage('assistant', demoAnswer);
      state.chatHistory.push({ role: 'assistant', content: demoAnswer });
    } else {
      // En producción, llamar al workflow chat.yml vía repository_dispatch
      const token = localStorage.getItem('agent-brain-pat') || state.token;
      const repo = state.repo || localStorage.getItem('agent-brain-repo');
      if (!token || !repo) {
        removeTypingIndicator();
        addChatMessage('assistant', '⚠️ Para usar el chat necesitas configurar tu PAT de GitHub. Ábrelo desde `setup.html` primero.');
        return;
      }
      const res = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          event_type: 'chat',
          client_payload: { question, history: JSON.stringify(state.chatHistory.slice(-6)) },
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      removeTypingIndicator();
      addChatMessage('assistant', '✓ Tu pregunta fue enviada al agente `chat`. La respuesta aparecerá como comentario en el último Issue abierto del repo (o créalo con label `chat`). Tarda ~30s en llegar.');
    }
  } catch (err) {
    removeTypingIndicator();
    addChatMessage('assistant', `❌ Error: ${err.message}`);
  } finally {
    $('#chat-send').disabled = false;
    $('#chat-input').focus();
  }
}

function getDemoChatAnswer(question) {
  const q = question.toLowerCase();
  if (q.includes('stuck') || q.includes('atascada')) {
    return `Tienes **1 tarea stuck**:\n\n• **TASK-0041** — Refactorizar calculateTotal para usar reduce puro\n  Intento 5/5. Último gate fallido: G3 (total numéricamente incorrecto).\n  Hipótesis viva: el carrito se rehidrata desde localStorage con esquema antiguo.\n\n¿Quieres que cree una tarea para que \`research\` investigue?`;
  }
  if (q.includes('cuota') || q.includes('budget') || q.includes('presupuesto')) {
    return `📊 **Budget de hoy:**\n\n• Tokens: 45,000 / 120,000 (38%)\n• Minutos de Actions: 12 / 180 (7%)\n• Estado: ✅ OK\n\nTe quedan ~75k tokens para hoy. Vas bien.`;
  }
  if (q.includes('diario') || q.includes('resumen')) {
    return `📅 **Último diario (${new Date().toISOString().slice(0,10)}):**\n\n"Arreglado bug del carrito (TASK-0042). 1 lección nueva sobre NaN."\n\n• TASK-0042 cerrada con éxito tras 2 intentos\n• Devil bloqueó inicialmente por falta de gate G3\n• Lessons activas: 6\n• Sin tareas STUCK\n\n**Pendiente para mañana:** revisar si el mismo bug existe en checkout.js`;
  }
  if (q.includes('aprend') || q.includes('lección') || q.includes('leccion')) {
    return `💡 **Lecciones activas (6 total):**\n\n1. **LESSON-0014** — NaN en cálculos suele ser integridad referencial (aplicada 4 veces, previno 3 fallos)\n2. **LESSON-0021** — Safari no persiste localStorage en modo privado (2/2)\n3. **LESSON-0029** — Errores de auth suelen ser del redirect (5/4) ✅ promovida a regla\n4. **LESSON-0033** — WebSocket timeout suele ser keepAlive (3/3)\n\nLESSON-0029 fue promovida a regla en \`agents/research.md\`.`;
  }
  return `No encontré información específica sobre eso. Prueba preguntando:\n\n• "¿Qué tareas están stuck?"\n• "¿Cuánta cuota me queda?"\n• "¿Qué aprendimos?"\n• "Resume el diario"`;
}

// ─── Activity feed ───
function renderActivity() {
  const list = $('#activity-list');
  // Construir feed a partir de episodios + memorias recientes
  const items = [];

  // Episodios (intentos de agentes)
  const episodes = Object.entries(state.data?.index || {})
    .filter(([id, m]) => m.type === 'episode')
    .map(([id, m]) => ({
      id,
      type: 'episode',
      icon: '⚙️',
      title: `Agente <code>${m.agent || '?'}</code> — intento ${m.attempt} de ${m.task_id || '?'}`,
      meta: `ruta: ${m.result || '?'}`,
      time: m.created,
    }));

  // Errores nuevos
  const errors = Object.entries(state.data?.index || {})
    .filter(([id, m]) => m.type === 'error')
    .map(([id, m]) => ({
      id,
      type: 'error',
      icon: '🐞',
      title: `Error registrado: <code>${id}</code> — ${m.title || '(sin título)'}`,
      meta: `confidence: ${m.confidence} · ${m.stale ? '⚠ stale' : 'ok'}`,
      time: m.created || m.updated,
    }));

  // Lecciones
  const lessons = Object.entries(state.data?.index || {})
    .filter(([id, m]) => m.type === 'lesson')
    .map(([id, m]) => ({
      id,
      type: 'lesson',
      icon: '💡',
      title: `Lección propuesta: <code>${id}</code> — ${m.title || ''}`,
      meta: `previno ${m.times_prevented_failure || 0} fallos`,
      time: m.created,
    }));

  // Decisions
  const decisions = Object.entries(state.data?.index || {})
    .filter(([id, m]) => m.type === 'decision')
    .map(([id, m]) => ({
      id,
      type: 'decision',
      icon: '📋',
      title: `Decisión: <code>${id}</code> — ${m.title || ''}`,
      meta: `scope: ${m.scope || '?'}`,
      time: m.created,
    }));

  items.push(...episodes, ...errors, ...lessons, ...decisions);

  // Si no hay datos reales, mostrar demo
  if (!items.length && DEMO_MODE) {
    items.push(
      { id: 'demo1', type: 'episode', icon: '✅', title: 'TASK-0042 cerrada con éxito por <code>code</code>', meta: '2 intentos · 1 lección aplicada', time: new Date(Date.now() - 5 * 60 * 1000).toISOString() },
      { id: 'demo2', type: 'episode', icon: '😈', title: 'Devil bloqueó TASK-0042 — falta gate G3', meta: 'concern: missing_gate · severity: high', time: new Date(Date.now() - 8 * 60 * 1000).toISOString() },
      { id: 'demo3', type: 'lesson', icon: '💡', title: 'Lección propuesta: LESSON-0014', meta: 'NaN en cálculos suele ser integridad referencial', time: new Date(Date.now() - 15 * 60 * 1000).toISOString() },
      { id: 'demo4', type: 'episode', icon: '🔍', title: 'Analyst auditó repo Criptobox/agente-z', meta: '5 hallazgos · 2 high · 3 medium', time: new Date(Date.now() - 32 * 60 * 1000).toISOString() },
      { id: 'demo5', type: 'decision', icon: '📋', title: 'Decisión DEC-0003: GitHub Actions como runtime', meta: 'confidence: 100 · scope: general', time: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() },
      { id: 'demo6', type: 'episode', icon: '💰', title: 'Budget agent: 38% tokens usados', meta: 'kind: OK · 23 llamadas', time: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString() },
    );
  }

  // Ordenar por tiempo desc
  items.sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0));

  if (!items.length) {
    list.innerHTML = '<div class="empty"><div class="empty__icon">📡</div><div class="empty__text">sin actividad todavía</div></div>';
    return;
  }

  list.innerHTML = items.slice(0, 30).map(item => {
    const timeStr = formatRelativeTime(item.time);
    return `
      <div class="activity-item">
        <div class="activity-item__icon">${item.icon}</div>
        <div class="activity-item__body">
          <div class="activity-item__title">${item.title}</div>
          <div class="activity-item__meta">${item.meta}</div>
        </div>
        <div class="activity-item__time">${timeStr}</div>
      </div>`;
  }).join('');
}

function formatRelativeTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  return `${day}d`;
}

// ─── Metrics ───
function renderMetrics() {
  const stats = state.data?.stats;
  if (!stats) {
    $('#metric-attempts').textContent = '—';
    $('#metric-completed').textContent = '—';
    return;
  }

  // Calcular intentos promedio (de episodios)
  const episodes = Object.values(state.data?.index || {}).filter(m => m.type === 'episode');
  const completedTasks = (state.data?.tasks || []).filter(t => t.status === 'completed');

  if (DEMO_MODE || !episodes.length) {
    $('#metric-attempts').textContent = '2.1';
    $('#metric-attempts-trend').textContent = '↓ 35% vs mes anterior';
    $('#metric-attempts-trend').className = 'metric-trend';
  } else {
    const avg = episodes.length / Math.max(completedTasks.length, 1);
    $('#metric-attempts').textContent = avg.toFixed(1);
    $('#metric-attempts-trend').textContent = '— sin histórico aún';
  }

  $('#metric-completed').textContent = completedTasks.length || (DEMO_MODE ? 12 : 0);
  $('#metric-completed-trend').textContent = DEMO_MODE ? '↑ 3 esta semana' : '—';
  $('#metric-completed-trend').className = 'metric-trend';

  // Chart de tokens (7d) — usar canvas simple
  drawTokensChart();
  drawMemoryChart();
}

function drawTokensChart() {
  const canvas = $('#chart-tokens');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const data = state.data?.budget?.history || [25, 38, 42, 28, 55, 48, 38];
  const max = Math.max(...data, 100);
  const barW = (W - 40) / data.length;

  // Grid lines
  ctx.strokeStyle = 'rgba(125, 133, 144, 0.1)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = 20 + (H - 40) * (i / 4);
    ctx.beginPath();
    ctx.moveTo(20, y);
    ctx.lineTo(W - 20, y);
    ctx.stroke();
  }

  // Bars
  data.forEach((v, i) => {
    const x = 20 + i * barW + 4;
    const h = ((H - 40) * v) / max;
    const y = H - 20 - h;
    const gradient = ctx.createLinearGradient(0, y, 0, H - 20);
    gradient.addColorStop(0, '#6366f1');
    gradient.addColorStop(1, '#a855f7');
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, barW - 8, h);
  });
}

function drawMemoryChart() {
  const canvas = $('#chart-memory');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const stats = state.data?.stats || DEMO.stats;
  const types = [
    { label: 'error', count: stats.byType?.error || 0, color: '#ef4444' },
    { label: 'decision', count: stats.byType?.decision || 0, color: '#3b82f6' },
    { label: 'fact', count: stats.byType?.fact || 0, color: '#6366f1' },
    { label: 'lesson', count: stats.byType?.lesson || 0, color: '#a855f7' },
    { label: 'criteria', count: stats.byType?.criteria || 0, color: '#14b8a6' },
    { label: 'episode', count: stats.byType?.episode || 0, color: '#f59e0b' },
  ];

  const total = types.reduce((s, t) => s + t.count, 0) || 1;
  const cx = W / 2, cy = H / 2;
  const r = Math.min(W, H) / 2 - 20;
  let startAngle = -Math.PI / 2;

  types.forEach(t => {
    if (t.count === 0) return;
    const angle = (t.count / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, startAngle, startAngle + angle);
    ctx.closePath();
    ctx.fillStyle = t.color;
    ctx.fill();
    startAngle += angle;
  });

  // Hole in middle (donut)
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.6, 0, Math.PI * 2);
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg-elev-1').trim() || '#11141b';
  ctx.fill();

  // Total in center
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text').trim() || '#e8ebf0';
  ctx.font = 'bold 24px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(total, cx, cy);
}

// ─── Auto-polling (cada 30s cuando hay actividad) ───
function startAutoPoll() {
  if (state.activityPollInterval) clearInterval(state.activityPollInterval);
  state.activityPollInterval = setInterval(async () => {
    // Solo pollear si no estamos en chat y la pestaña está activa
    if (document.hidden || state.currentView === 'chat') return;
    try {
      const oldCount = Object.keys(state.data?.index || {}).length;
      await loadAll();
      const newCount = Object.keys(state.data?.index || {}).length;
      if (newCount > oldCount) {
        toast(`Nuevos eventos en el sistema (+${newCount - oldCount})`, '📡');
      }
    } catch (err) {
      // Silencioso — no romper la UX por un fallo de poll
    }
  }, 30000); // 30s
}

// ─── Inventory comparison (runs client-side via GitHub API) ───
const INVENTORY_PATTERNS = [
  'products.json', 'inventory.json', 'data/products.json', 'data/inventory.json',
  'src/data/products.json', 'src/data/inventory.json', 'public/products.json',
  'api/products.json', 'catalog.json', 'items.json', 'stock.json',
];

function detectIdField(p) {
  if (!p) return 'id';
  for (const k of ['id', 'sku', '_id', 'productId', 'product_id', 'slug', 'name']) {
    if (p[k] != null) return k;
  }
  return 'id';
}
function detectStockField(p) {
  if (!p) return null;
  for (const k of ['stock', 'quantity', 'qty', 'available', 'inventory', 'count', 'units']) {
    if (p[k] != null) return k;
  }
  return null;
}
function detectNameField(p) {
  if (!p) return 'name';
  for (const k of ['name', 'nombre', 'title', 'titulo', 'label']) {
    if (p[k] != null) return k;
  }
  return 'name';
}
function detectPriceField(p) {
  if (!p) return null;
  for (const k of ['price', 'precio', 'cost', 'amount', 'value']) {
    if (p[k] != null) return k;
  }
  return null;
}

function parseInventory(raw, filename) {
  if (!raw) return [];
  try {
    const d = JSON.parse(raw);
    if (Array.isArray(d)) return d;
    if (Array.isArray(d.products)) return d.products;
    if (Array.isArray(d.items)) return d.items;
    if (Array.isArray(d.data)) return d.data;
    if (d && typeof d === 'object') return Object.values(d).filter(v => typeof v === 'object');
  } catch {}
  // JS export
  const m = raw.match(/(?:export\s+default|module\.exports\s*=|export\s+const\s+\w+\s*=)\s*(\[[\s\S]*\])/);
  if (m) {
    try {
      const arr = m[1].replace(/'/g, '"').replace(/,(\s*[}\]])/g, '$1').replace(/(\w+):/g, '"$1":');
      return JSON.parse(arr);
    } catch {}
  }
  return [];
}

async function fetchRepoFileClient(repo, path, token) {
  const headers = { 'Accept': 'application/vnd.github+json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, { headers });
  if (!res.ok) return null;
  const data = await res.json();
  if (data.type !== 'file' || !data.content) return null;
  return {
    content: atob(data.content.replace(/\n/g, '')),
    path: data.path,
    sha: data.sha,
  };
}

async function findInventoryFileClient(repo, token) {
  for (const pattern of INVENTORY_PATTERNS) {
    const f = await fetchRepoFileClient(repo, pattern, token);
    if (f) return f;
  }
  // Listar raíz
  const headers = { 'Accept': 'application/vnd.github+json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/contents/`, { headers });
    if (res.ok) {
      const items = await res.json();
      for (const item of items) {
        if (item.type === 'file' && /product|inventory|catalog|items?|stock/i.test(item.name)) {
          const f = await fetchRepoFileClient(repo, item.path, token);
          if (f) return f;
        }
      }
    }
  } catch {}
  return null;
}

function diffInventoriesClient(productsA, productsB, labelA, labelB) {
  const sampleA = productsA[0] || {};
  const sampleB = productsB[0] || {};
  const idField = detectIdField(sampleA) || detectIdField(sampleB);
  const stockField = detectStockField(sampleA) || detectStockField(sampleB);
  const nameField = detectNameField(sampleA) || detectNameField(sampleB);
  const priceField = detectPriceField(sampleA) || detectPriceField(sampleB);

  const indexA = new Map();
  for (const p of productsA) {
    const id = p[idField];
    if (id != null) indexA.set(String(id), p);
  }
  const indexB = new Map();
  for (const p of productsB) {
    const id = p[idField];
    if (id != null) indexB.set(String(id), p);
  }

  const idsA = new Set(indexA.keys());
  const idsB = new Set(indexB.keys());

  const agotados = [];
  const nuevos = [];
  const desaparecidos = [];
  const disponibles = [];
  const stockBajo = [];

  for (const id of idsB) {
    const pB = indexB.get(id);
    const stockB = stockField ? Number(pB[stockField]) || 0 : null;
    if (!idsA.has(id)) {
      nuevos.push({ id, name: pB[nameField] || id, stock: stockB, price: priceField ? pB[priceField] : null });
    } else {
      const pA = indexA.get(id);
      const stockA = stockField ? Number(pA[stockField]) || 0 : null;
      if (stockB === 0 && stockA > 0) {
        agotados.push({ id, name: pB[nameField] || id, stockAgo: stockA, stockNow: 0, price: priceField ? pB[priceField] : null });
      } else if (stockB > 0 && stockB < 5) {
        stockBajo.push({ id, name: pB[nameField] || id, stock: stockB, price: priceField ? pB[priceField] : null });
      } else if (stockB > 0) {
        disponibles.push({ id, name: pB[nameField] || id, stock: stockB, price: priceField ? pB[priceField] : null });
      }
    }
  }
  for (const id of idsA) {
    if (!idsB.has(id)) {
      const pA = indexA.get(id);
      desaparecidos.push({ id, name: pA[nameField] || id, stockAgo: stockField ? Number(pA[stockField]) || 0 : null });
    }
  }

  return {
    labelA, labelB,
    fields: { id: idField, stock: stockField, name: nameField, price: priceField },
    totalA: productsA.length,
    totalB: productsB.length,
    agotados, nuevos, desaparecidos, disponibles, stockBajo,
    summary: {
      total: productsB.length,
      agotados: agotados.length,
      nuevos: nuevos.length,
      desaparecidos: desaparecidos.length,
      disponibles: disponibles.length,
      stockBajo: stockBajo.length,
    },
  };
}

async function compareInventoriesNow(repoA, repoB, pathA, pathB) {
  const token = localStorage.getItem('agent-brain-pat') || state.token || '';
  const el = $('#inventory-result');
  el.innerHTML = '<div class="inv-loading">Comparando inventarios…</div>';

  try {
    let fileA, fileB;
    if (pathA) {
      fileA = await fetchRepoFileClient(repoA, pathA, token);
    } else {
      fileA = await findInventoryFileClient(repoA, token);
    }
    if (pathB) {
      fileB = await fetchRepoFileClient(repoB, pathB, token);
    } else {
      fileB = await findInventoryFileClient(repoB, token);
    }

    if (!fileA) {
      el.innerHTML = `<div class="inv-empty"><div class="inv-empty__icon">❌</div><div class="inv-empty__text">No se encontró archivo de productos en <code>${escapeHtml(repoA)}</code>.<br>Especifica el path manualmente arriba.</div></div>`;
      return;
    }
    if (!fileB) {
      el.innerHTML = `<div class="inv-empty"><div class="inv-empty__icon">❌</div><div class="inv-empty__text">No se encontró archivo de productos en <code>${escapeHtml(repoB)}</code>.<br>Especifica el path manualmente arriba.</div></div>`;
      return;
    }

    const productsA = parseInventory(fileA.content, fileA.path);
    const productsB = parseInventory(fileB.content, fileB.path);

    if (!productsA.length || !productsB.length) {
      el.innerHTML = `<div class="inv-empty"><div class="inv-empty__icon">⚠️</div><div class="inv-empty__text">No se pudieron parsear productos.<br><code>${escapeHtml(fileA.path)}</code>: ${productsA.length} items<br><code>${escapeHtml(fileB.path)}</code>: ${productsB.length} items</div></div>`;
      return;
    }

    const report = diffInventoriesClient(productsA, productsB, repoA, repoB);
    report.fileA = fileA.path;
    report.fileB = fileB.path;
    renderInventoryReport(report);
  } catch (err) {
    el.innerHTML = `<div class="inv-empty"><div class="inv-empty__icon">❌</div><div class="inv-empty__text">Error: ${escapeHtml(err.message)}</div></div>`;
  }
}

function renderInventoryReport(report) {
  const el = $('#inventory-result');
  const s = report.summary;
  const fmtPrice = (p) => p != null ? `$${Number(p).toFixed(2)}` : '';

  const kpis = [
    { value: s.total, label: 'total productos', cls: '' },
    { value: s.agotados, label: 'agotados', cls: s.agotados > 0 ? 'inv-kpi--danger' : 'inv-kpi--success' },
    { value: s.nuevos, label: 'nuevos', cls: s.nuevos > 0 ? 'inv-kpi--success' : '' },
    { value: s.stockBajo, label: 'stock bajo', cls: s.stockBajo > 0 ? 'inv-kpi--warning' : '' },
    { value: s.desaparecidos, label: 'desaparecidos', cls: s.desaparecidos > 0 ? 'inv-kpi--warning' : '' },
    { value: s.disponibles, label: 'disponibles', cls: 'inv-kpi--success' },
  ];

  const agotadosTable = report.agotados.length ? `
    <div class="inv-section inv-section--danger">
      <div class="inv-section__header">
        <h3 class="inv-section__title">🔴 Agotados (stock = 0)</h3>
        <span class="inv-section__count">${report.agotados.length}</span>
      </div>
      <table class="inv-table">
        <thead><tr><th>ID</th><th>Nombre</th><th>Stock antes</th><th>Stock ahora</th><th>Precio</th></tr></thead>
        <tbody>
          ${report.agotados.slice(0, 50).map(p => `
            <tr>
              <td>${escapeHtml(p.id)}</td>
              <td>${escapeHtml(p.name)}</td>
              <td class="inv-diff inv-diff--down">${p.stockAgo}</td>
              <td class="inv-stock inv-stock--zero">0</td>
              <td class="inv-price">${fmtPrice(p.price)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>` : '';

  const nuevosTable = report.nuevos.length ? `
    <div class="inv-section inv-section--success">
      <div class="inv-section__header">
        <h3 class="inv-section__title">✨ Nuevos en ${escapeHtml(report.labelB)}</h3>
        <span class="inv-section__count">${report.nuevos.length}</span>
      </div>
      <table class="inv-table">
        <thead><tr><th>ID</th><th>Nombre</th><th>Stock</th><th>Precio</th></tr></thead>
        <tbody>
          ${report.nuevos.slice(0, 50).map(p => `
            <tr>
              <td>${escapeHtml(p.id)}</td>
              <td>${escapeHtml(p.name)}</td>
              <td class="inv-stock inv-stock--ok">${p.stock ?? '—'}</td>
              <td class="inv-price">${fmtPrice(p.price)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>` : '';

  const stockBajoTable = report.stockBajo.length ? `
    <div class="inv-section inv-section--warning">
      <div class="inv-section__header">
        <h3 class="inv-section__title">⚠️ Stock bajo (&lt; 5 unidades)</h3>
        <span class="inv-section__count">${report.stockBajo.length}</span>
      </div>
      <table class="inv-table">
        <thead><tr><th>ID</th><th>Nombre</th><th>Stock</th><th>Precio</th></tr></thead>
        <tbody>
          ${report.stockBajo.slice(0, 30).map(p => `
            <tr>
              <td>${escapeHtml(p.id)}</td>
              <td>${escapeHtml(p.name)}</td>
              <td class="inv-stock inv-stock--low">${p.stock}</td>
              <td class="inv-price">${fmtPrice(p.price)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>` : '';

  const desaparecidosTable = report.desaparecidos.length ? `
    <div class="inv-section">
      <div class="inv-section__header">
        <h3 class="inv-section__title">❌ Desaparecidos (estaban en A, no en B)</h3>
        <span class="inv-section__count">${report.desaparecidos.length}</span>
      </div>
      <table class="inv-table">
        <thead><tr><th>ID</th><th>Nombre</th><th>Stock antes</th></tr></thead>
        <tbody>
          ${report.desaparecidos.slice(0, 30).map(p => `
            <tr>
              <td>${escapeHtml(p.id)}</td>
              <td>${escapeHtml(p.name)}</td>
              <td class="inv-diff">${p.stockAgo ?? '—'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>` : '';

  const noChanges = (!report.agotados.length && !report.nuevos.length && !report.stockBajo.length && !report.desaparecidos.length) ? `
    <div class="inv-section">
      <div class="inv-section__header">
        <h3 class="inv-section__title">✅ Sin cambios</h3>
      </div>
      <div class="inv-empty">
        <div class="inv-empty__icon">✅</div>
        <div class="inv-empty__text">Todo el inventario está disponible y sin novedades.</div>
      </div>
    </div>` : '';

  el.innerHTML = `
    <div class="info-banner" style="margin-bottom: var(--s-4)">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
      <span><strong>${escapeHtml(report.labelA)}</strong> (${report.totalA} productos) vs <strong>${escapeHtml(report.labelB)}</strong> (${report.totalB} productos) · Archivos: <code>${escapeHtml(report.fileA)}</code> / <code>${escapeHtml(report.fileB)}</code> · Campos: id=<code>${escapeHtml(report.fields.id)}</code>, stock=<code>${escapeHtml(report.fields.stock || '?')}</code></span>
    </div>
    <div class="inv-kpi-grid">
      ${kpis.map(k => `<div class="inv-kpi ${k.cls}"><div class="inv-kpi__value">${k.value}</div><div class="inv-kpi__label">${k.label}</div></div>`).join('')}
    </div>
    ${agotadosTable}${nuevosTable}${stockBajoTable}${desaparecidosTable}${noChanges}
  `;
}

// ─── Init ───
async function init() {
  loadTheme();
  attachEvents();
  startClock();
  registerSW();
  await loadAll();
  startAutoPoll();
}

init().catch(err => {
  console.error('init failed:', err);
  $('#hero-subtitle').textContent = 'Error al cargar.';
});

window.__agentBrain = { DEMO, state, loadAll };
