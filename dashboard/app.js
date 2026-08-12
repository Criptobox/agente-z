// ═══════════════════════════════════════════════════════════════
// agent-brain · dashboard app
// Premium: sparklines, command palette, keyboard nav, theme toggle
// ═══════════════════════════════════════════════════════════════

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
const params = new URLSearchParams(location.search);
const DEMO_MODE = params.get('demo') === '1' || params.get('source') === 'preview';

// Voice module — cargado globalmente desde voice.js antes que app.js
var voice = (typeof window.voice !== 'undefined') ? window.voice : { isSupported: false, listening: false, speaking: false, speak: function(){}, stopSpeaking: function(){}, startListening: function(){}, stopListening: function(){} };

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
    { name: 'analyst', icon: '🔍', role: 'Audita repos externos', turns: 5, status: 'active' },
    { name: 'code', icon: '⚙️', role: 'Arregla bugs en código', turns: 28, status: 'active' },
    { name: 'research', icon: '🔬', role: 'Investiga causa raíz', turns: 9, status: 'active' },
    { name: 'test', icon: '✅', role: 'Verificador independiente', turns: 18, status: 'active' },
    { name: 'security', icon: '🛡️', role: 'Audita diffs y secretos', turns: 4, status: 'idle' },
    { name: 'devil', icon: '😈', role: 'Abogado del diablo', turns: 22, status: 'active', blocks: 3 },
    { name: 'learner', icon: '📝', role: 'Post-mortem y lecciones', turns: 8, status: 'idle' },
    { name: 'budget', icon: '💰', role: 'Vigila cuota de tokens', turns: 24, status: 'active' },
    { name: 'diarist', icon: '📅', role: 'Diario nocturno', turns: 7, status: 'idle' },
    { name: 'self_improver', icon: '🤖', role: 'Auto-mejora por PR', turns: 2, status: 'idle' },
    { name: 'inventory', icon: '📦', role: 'Compara inventarios', turns: 3, status: 'active' },
    { name: 'chat', icon: '💬', role: 'Interfaz conversacional', turns: 15, status: 'active' },
    { name: 'curator', icon: '🧹', role: 'Limpia y mantiene memoria', turns: 1, status: 'idle' },
    { name: 'qa', icon: '🧪', role: 'Quality Assurance continuo', turns: 6, status: 'idle' },
    { name: 'refactor', icon: '🔧', role: 'Deuda técnica proactiva', turns: 2, status: 'idle' },
    { name: 'translator', icon: '🌐', role: 'Internacionalización', turns: 3, status: 'idle' },
    { name: 'onboarding', icon: '👋', role: 'Tutor interactivo', turns: 1, status: 'idle' },
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
// Expose on window for tiendamax.js overlay (which reads window.DEMO / window.state)
window.DEMO = DEMO;

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
// Expose on window for tiendamax.js overlay (which reads window.state)
window.state = state;

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
  // BUGFIX (audit #1.1): Render dynamic views BEFORE toggling is-active,
  // otherwise the newly created #view-settings / #view-graph never receive is-active
  // and stay display:none.
  if (name === 'settings' && window.renderSettings) window.renderSettings();
  if (name === 'graph' && window.renderGraphView) window.renderGraphView();
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
    agents: ['Agentes', '18 agentes especializados'],
    memory: ['Memoria', 'Todos los registros'],
    chat: ['Chat', 'Habla con tu sistema'],
    activity: ['Actividad', 'Feed en tiempo real'],
    metrics: ['Métricas', 'Tendencias del sistema'],
    inventory: ['Inventario', 'Compara productos entre repos'],
    settings: ['Settings', 'Configuración del sistema'],
    graph: ['Grafo', 'Red de memorias'],
  };
  const [title, sub] = titles[name] || [name, ''];
  $('#view-title').textContent = title;
  $('#view-sub').textContent = sub;
  // Close mobile sidebar
  $('.app').classList.remove('sidebar-open');
  $('#sidebar-overlay').hidden = true;
  // Scroll to top
  $('#content').scrollTop = 0;
  // Notify TiendaMax overlay (if loaded)
  if (window.tiendaMax && typeof window.tiendaMax.onViewChange === 'function') {
    window.tiendaMax.onViewChange(name);
  }
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
      // BUGFIX (audit #1.2): state.repo was never assigned — use localStorage fallback.
      const repo = state.repo || localStorage.getItem('agent-brain-repo') || localStorage.getItem('agent-brain-target-repos');
      if (!repo) {
        throw new Error('Configura tu repo en Settings (agent-brain-repo) antes de lanzar análisis.');
      }
      const token = state.token || localStorage.getItem('agent-brain-pat') || '';
      // Crear Issue vía GitHub API
      const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
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

  // ─── Voice (Web Speech API) ───
  state.autoSpeak = false;
  const micBtn = $('#chat-mic');
  const speakBtn = $('#chat-speak');

  if (micBtn) {
    if (!voice.isSupported) {
      micBtn.style.opacity = '0.4';
      micBtn.title = 'Voz no soportada en este navegador. Usa Chrome o Edge.';
    }
    micBtn.addEventListener('click', () => {
      if (!voice.isSupported) {
        toast('Voz no soportada. Usa Chrome o Edge.', '🎤');
        return;
      }
      if (voice.listening) {
        voice.stopListening();
        micBtn.classList.remove('is-listening');
      } else {
        micBtn.classList.add('is-listening');
        voice.startListening(
          (transcript, isFinal) => {
            chatInput.value = transcript;
            if (isFinal) {
              micBtn.classList.remove('is-listening');
              chatInput.focus();
            }
          },
          (err) => {
            micBtn.classList.remove('is-listening');
            toast(`Error de voz: ${err.message}`, '🎤');
          },
          () => {
            micBtn.classList.remove('is-listening');
            // Auto-enviar si hay texto
            const text = chatInput.value.trim();
            if (text) sendChatMessage(text);
          }
        );
      }
    });
  }

  if (speakBtn) {
    speakBtn.addEventListener('click', () => {
      if (voice.speaking) {
        voice.stopSpeaking();
        speakBtn.classList.remove('is-speaking');
      } else {
        // Leer el último mensaje del asistente
        const messages = document.querySelectorAll('.chat__msg--assistant .chat__msg-body');
        const lastMsg = messages[messages.length - 1];
        if (lastMsg) {
          const text = lastMsg.textContent.trim();
          speakBtn.classList.add('is-speaking');
          voice.speak(text, () => {
            speakBtn.classList.remove('is-speaking');
          });
        } else {
          toast('No hay mensaje para leer', '🔊');
        }
      }
    });
    // Toggle auto-speak con doble click
    speakBtn.addEventListener('dblclick', () => {
      state.autoSpeak = !state.autoSpeak;
      toast(state.autoSpeak ? 'Auto-voz activada' : 'Auto-voz desactivada', '🔊');
    });
  }

  // ─── Inventory ───
  // Estado del modo (single vs compare)
  state.inventoryMode = 'single';

  // Cargar valores guardados
  const savedRepo = localStorage.getItem('inv-repo-a');
  if (savedRepo) $('#inv-repo-url').value = savedRepo;
  const savedRepoB = localStorage.getItem('inv-repo-b');
  if (savedRepoB) $('#inv-repo-b').value = savedRepoB;

  const invInput = $('#inv-repo-url');
  const invInputB = $('#inv-repo-b');
  const invBtn = $('#compare-inventory-btn');

  const isValidRepo = (v) => /^(https?:\/\/github\.com\/)?[a-z0-9_-]+\/[a-z0-9_.-]+$/i.test(v);

  const updateInvBtn = () => {
    if (state.inventoryMode === 'single') {
      invBtn.disabled = !isValidRepo(invInput.value.trim());
    } else {
      const a = invInput.value.trim();
      const b = invInputB.value.trim();
      invBtn.disabled = !isValidRepo(a) || !isValidRepo(b);
    }
  };

  invInput.addEventListener('input', updateInvBtn);
  invInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !invBtn.disabled) { e.preventDefault(); invBtn.click(); }
  });
  invInputB.addEventListener('input', updateInvBtn);
  invInputB.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !invBtn.disabled) { e.preventDefault(); invBtn.click(); }
  });

  // Mode toggle
  $$('.mode-toggle__btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      state.inventoryMode = mode;
      $$('.mode-toggle__btn').forEach(b => b.classList.toggle('is-active', b.dataset.mode === mode));
      if (mode === 'single') {
        $('#inv-single-wrap').hidden = false;
        $('#inv-compare-wrap').hidden = true;
        $('#inv-hero-title').textContent = 'Pega el link del repo a analizar';
        $('#inv-hero-desc').textContent = 'El sistema detecta automáticamente el archivo de productos, los campos (id, stock, precio) y genera un reporte completo con agotados, stock bajo y más.';
      } else {
        $('#inv-single-wrap').hidden = true;
        $('#inv-compare-wrap').hidden = false;
        $('#inv-hero-title').textContent = 'Compara dos repos entre sí';
        $('#inv-hero-desc').textContent = 'Detecta productos agotados, nuevos, desaparecidos y stock bajo entre dos repos. Útil para ver qué falta agregar de A a B.';
      }
      updateInvBtn();
    });
  });

  // Chips de ejemplo (en modo single llenan el input principal, en compare llenan el A)
  $$('.inv-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const ex = chip.dataset.example;
      if (state.inventoryMode === 'single') {
        invInput.value = ex;
      } else {
        invInput.value = ex;
      }
      updateInvBtn();
      invBtn.click();
    });
  });

  invBtn?.addEventListener('click', () => {
    if (state.inventoryMode === 'single') {
      const url = invInput.value.trim();
      const normalized = url.replace(/^https?:\/\/github\.com\//i, '').replace(/\/$/, '');
      localStorage.setItem('inv-repo-a', normalized);
      // Ejecutar en background
      const el = $('#inventory-result');
      el.innerHTML = `
        <div class="inv-loading">
          <div class="inv-loading__spinner"></div>
          <div class="inv-loading__text" id="inv-bg-text">Iniciando análisis...</div>
          <div class="chat__progress-bar" style="width:300px;margin-top:8px"><div class="chat__progress-fill" id="inv-bg-progress" style="width:0%"></div></div>
        </div>`;
      const taskId = window.bgRunner.run('inventory', 'Analizando repo: ' + normalized, { repo: normalized });
      window.bgRunner.on(taskId, (task) => {
        const textEl = document.getElementById('inv-bg-text');
        const progEl = document.getElementById('inv-bg-progress');
        if (textEl && task.status === 'running') {
          textEl.textContent = task.description;
          if (progEl) progEl.style.width = task.progress + '%';
        } else if (task.status === 'completed') {
          // Usar el resultado del background runner para renderizar
          if (task.result && task.result.report) {
            renderInventoryReport(task.result.report);
          } else if (task.result) {
            // BUGFIX (audit #1.3): analyzeSingleRepoInventoryDirect was undefined.
            // Use the existing analyzeSingleRepoInventory() which does the same job.
            analyzeSingleRepoInventory(normalized);
          }
        } else if (task.status === 'error') {
          el.innerHTML = `<div class="inv-empty"><div class="inv-empty__icon">❌</div><div class="inv-empty__text">Error: ${task.error}</div></div>`;
        }
      });
    } else {
      const urlA = invInput.value.trim();
      const urlB = invInputB.value.trim();
      const normalizedA = urlA.replace(/^https?:\/\/github\.com\//i, '').replace(/\/$/, '');
      const normalizedB = urlB.replace(/^https?:\/\/github\.com\//i, '').replace(/\/$/, '');
      localStorage.setItem('inv-repo-a', normalizedA);
      localStorage.setItem('inv-repo-b', normalizedB);
      compareInventoriesNow(normalizedA, normalizedB, null, null);
    }
  });

  // Notificaciones PWA: pedir permiso al entrar a inventario
  // (mejor momento contextual que pedirlo al cargar todo el dashboard)
  // Se pide bajo demanda cuando el usuario hace una acción relevante
  // implementado en requestNotificationPermission() y notifyProductChange()

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
function addChatMessage(role, content, agent = null, actionCards = []) {
  const messages = $('#chat-messages');
  const empty = messages.querySelector('.chat__empty');
  if (empty) empty.remove();

  const msg = document.createElement('div');
  const agentClass = agent ? ` chat__msg--agent-${agent}` : '';
  msg.className = `chat__msg chat__msg--${role}${agentClass}`;
  const avatar = role === 'user' ? '🧑' : (agent ? getAgentIcon(agent) : '🤖');
  const agentLabel = agent ? `<div style="font-size:10px;color:var(--text-muted);margin-bottom:4px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">${agent}</div>` : '';
  const actionsHtml = actionCards?.length
    ? `<div class="chat__action-cards">${actionCards.map(a => `<button class="chat__action-card chat__action-card--${a.style}" data-action="${a.action}">${a.label}</button>`).join('')}</div>`
    : '';
  msg.innerHTML = `
    <div class="chat__msg-avatar">${avatar}</div>
    <div class="chat__msg-body">
      ${agentLabel}
      ${escapeHtml(content).replace(/\n/g, '<br>')}
      ${actionsHtml}
    </div>
  `;
  messages.appendChild(msg);
  messages.scrollTop = messages.scrollHeight;

  // Attach action card listeners
  if (actionCards?.length) {
    msg.querySelectorAll('.chat__action-card').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        if (action === 'approve') {
          toast('✓ Acción aprobada', '✓');
        } else if (action === 'cancel') {
          toast('✗ Acción cancelada', '✗');
        } else {
          toast('Modifica y reenvía', '✏️');
        }
      });
    });
  }
}

function getAgentIcon(agent) {
  const icons = {
    orchestrator: '🎭', chat: '💬', code: '⚙️', research: '🔬', test: '✅',
    security: '🛡️', devil: '😈', learner: '📝', budget: '💰', diarist: '📅',
    self_improver: '🤖', inventory: '📦', analyst: '🔍', curator: '🧹',
    qa: '🧪', refactor: '🔧', translator: '🌐', onboarding: '👋',
  };
  return icons[agent] || '🤖';
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

  // Parsear comando (command center)
  const cmd = window.streaming ? window.streaming.parseCommand(question) : { type: 'chat', payload: { message: question } };

  // Si es help, responder inmediatamente
  if (cmd.type === 'help') {
    addChatMessage('assistant', window.streaming.getHelpText(), 'chat', []);
    $('#chat-send').disabled = false;
    $('#chat-input').focus();
    return;
  }

  // Si es settings o inventory, navegar
  if (cmd.type === 'settings') { switchView('settings'); $('#chat-send').disabled = false; return; }
  if (cmd.type === 'inventory') { switchView('inventory'); $('#chat-send').disabled = false; return; }

  // Si es analyze-repo, ejecutar en background
  if (cmd.type === 'analyze-repo') {
    switchView('inventory');
    $('#inv-repo-url').value = cmd.payload.repo;
    setTimeout(() => $('#compare-inventory-btn')?.click(), 300);
    $('#chat-send').disabled = false;
    return;
  }

  // Si es compare-repos, ejecutar comparación
  if (cmd.type === 'compare-repos') {
    switchView('inventory');
    setTimeout(() => {
      document.querySelector('[data-mode=compare]')?.click();
      $('#inv-repo-a').value = cmd.payload.repoA;
      $('#inv-repo-b').value = cmd.payload.repoB;
      setTimeout(() => $('#compare-inventory-btn')?.click(), 200);
    }, 200);
    $('#chat-send').disabled = false;
    return;
  }

  // Si es create-task, crear Issue vía background runner
  if (cmd.type === 'create-task') {
    const taskId = window.bgRunner.run('create-task', 'Creando tarea: ' + cmd.payload.goal, cmd.payload);
    const progressMsgId = 'prog-' + Date.now();
    addProgressMessage(progressMsgId, 'Creando tarea...');
    window.bgRunner.on(taskId, (task) => {
      if (task.status === 'running') {
        updateProgressMessage(progressMsgId, task.description, task.progress);
      } else if (task.status === 'completed') {
        removeProgressMessage(progressMsgId);
        addChatMessage('assistant', '✅ Tarea creada: **' + cmd.payload.goal + '**\n\nEl agente `orchestrator` la ha recibido y está trabajando.', 'orchestrator', []);
      } else if (task.status === 'error') {
        removeProgressMessage(progressMsgId);
        addChatMessage('assistant', '❌ Error: ' + task.error, 'chat', []);
      }
      $('#chat-send').disabled = false;
      $('#chat-input').focus();
    });
    return;
  }

  // ─── Chat normal con IA real (streaming token por token en vivo) ───
  // Si hay API key configurada, llamamos directo a window.streaming.stream()
  // para que el texto aparezca palabra por palabra EN TIEMPO REAL.
  // Si no hay API key, caemos al bgRunner (mock o backend).
  const apiKey = localStorage.getItem('llm-api-key') || '';
  const provider = localStorage.getItem('llm-provider') || 'groq';

  if (apiKey && window.streaming && typeof window.streaming.stream === 'function') {
    // === Streaming REAL — el texto aparece a medida que la IA lo genera ===
    const messages = $('#chat-messages');
    const empty = messages.querySelector('.chat__empty');
    if (empty) empty.remove();

    const assistantMsg = document.createElement('div');
    assistantMsg.className = 'chat__msg chat__msg--assistant chat__msg--streaming';
    assistantMsg.innerHTML = `
      <div class="chat__msg-avatar">🤖</div>
      <div class="chat__msg-body"><span class="chat__streaming-cursor"></span></div>
    `;
    messages.appendChild(assistantMsg);
    messages.scrollTop = messages.scrollHeight;

    const msgBody = assistantMsg.querySelector('.chat__msg-body');
    let fullText = '';
    let firstTokenReceived = false;

    // System prompt para el asistente
    const systemPrompt = `Eres el asistente conversacional de agent-brain, un sistema multi-agente en GitHub. Respondes preguntas del usuario sobre su sistema en lenguaje natural.

## REGLAS
- Responde en texto markdown natural, NO JSON.
- Sé honesto: si no sabes algo, dilo.
- Sé conciso: máx 3 párrafos. El usuario lee desde móvil.
- Si la pregunta requiere crear una tarea, sugiérelo pero NO la crees.
- Cita IDs concretos (TASK-XXXX, BUG-XXXX, LESSON-XXXX) cuando sea relevante.`;

    const llmMessages = [
      { role: 'system', content: systemPrompt },
      ...state.chatHistory.slice(-6).map(h => ({ role: h.role || 'user', content: h.content })),
      { role: 'user', content: question },
    ];

    const model = localStorage.getItem('llm-model') || (window.__defaultModelFor ? window.__defaultModelFor(provider) : 'llama-3.1-70b-versatile');
    const fallbackProvider = localStorage.getItem('llm-fallback-provider') || '';

    // Botón cancelar
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'chat__cancel-btn';
    cancelBtn.textContent = '✕';
    cancelBtn.title = 'Cancelar';
    cancelBtn.onclick = () => {
      if (window.__currentChatController) {
        window.__currentChatController.abort();
        window.__currentChatController = null;
      }
    };
    assistantMsg.querySelector('.chat__msg-avatar').appendChild(cancelBtn);

    try {
      await new Promise((resolve, reject) => {
        window.streaming.stream(
          llmMessages,
          { provider, model, apiKey, stream: true, temperature: 0.4, maxTokens: 1024 },
          // onToken — aparece EN VIVO
          (token) => {
            if (!firstTokenReceived) {
              firstTokenReceived = true;
              msgBody.innerHTML = '';
            }
            fullText += token;
            // Render markdown básico en vivo
            msgBody.innerHTML = renderMarkdownLive(fullText) + '<span class="chat__streaming-cursor"></span>';
            messages.scrollTop = messages.scrollHeight;
          },
          // onDone
          (full) => {
            const finalText = full || fullText;
            msgBody.innerHTML = renderMarkdownLive(finalText);
            assistantMsg.classList.remove('chat__msg--streaming');
            if (cancelBtn.parentNode) cancelBtn.remove();
            state.chatHistory.push({ role: 'assistant', content: finalText });
            if (window.chatHistory) window.chatHistory.save(state.chatHistory);
            if (state.autoSpeak && window.voice) window.voice.speak(finalText);
            resolve(finalText);
          },
          // onError
          (err) => {
            if (err.name === 'AbortError') {
              // El usuario canceló — guardar lo que se generó hasta el momento
              if (fullText) {
                msgBody.innerHTML = renderMarkdownLive(fullText) + '\n\n_⚠ Respuesta cancelada_';
                state.chatHistory.push({ role: 'assistant', content: fullText });
                if (window.chatHistory) window.chatHistory.save(state.chatHistory);
              } else {
                if (assistantMsg.parentNode) assistantMsg.remove();
              }
              assistantMsg.classList.remove('chat__msg--streaming');
              if (cancelBtn.parentNode) cancelBtn.remove();
              resolve(fullText || '');
            } else {
              reject(err);
            }
          },
        );
      });
      $('#chat-send').disabled = false;
      $('#chat-input').focus();
    } catch (err) {
      // Error fatal (CORS, API key inválida, etc.)
      if (assistantMsg.parentNode) assistantMsg.remove();
      let errMsg = err.message || String(err);
      // Mensajes de error más claros
      if (errMsg.includes('Failed to fetch') || errMsg.includes('NetworkError')) {
        errMsg = `No se pudo conectar con ${provider}. Esto suele ser por:\n` +
                 `• CORS: ${provider} bloquea llamadas desde el navegador. Usá OpenRouter, DeepSeek o Gemini (funcionan desde browser).\n` +
                 `• API key inválida o sin permisos.\n` +
                 `• Sin internet.`;
      }
      addChatMessage('assistant', '❌ **Error:** ' + errMsg + '\n\n_Ve a Settings → Modelos de IA para configurar otra provider._', 'chat', []);
      $('#chat-send').disabled = false;
      $('#chat-input').focus();
    }
    return;
  }

  // === Sin API key — caer al bgRunner (mock o backend) ===
  const progressMsgId = 'prog-' + Date.now();
  addProgressMessage(progressMsgId, 'Conectando...');

  const messages = $('#chat-messages');
  const empty = messages.querySelector('.chat__empty');
  if (empty) empty.remove();

  const assistantMsg = document.createElement('div');
  assistantMsg.className = 'chat__msg chat__msg--assistant chat__msg--streaming';
  assistantMsg.innerHTML = `
    <div class="chat__msg-avatar">🤖</div>
    <div class="chat__msg-body"><span class="chat__streaming-cursor"></span></div>
  `;
  messages.appendChild(assistantMsg);
  messages.scrollTop = messages.scrollHeight;

  const taskId = window.bgRunner.run('chat', 'Procesando: "' + question.slice(0, 40) + (question.length > 40 ? '...' : '') + '"', {
    message: question, history: state.chatHistory.slice(-6),
  });

  window.bgRunner.on(taskId, (task) => {
    if (task.status === 'running') {
      updateProgressMessage(progressMsgId, task.description, task.progress);
    } else if (task.status === 'completed') {
      removeProgressMessage(progressMsgId);
      const result = task.result;
      const agent = result?.agent || 'chat';
      const text = result?.text || result?.response || '(sin respuesta)';

      streamTextIntoMessage(assistantMsg, text, agent, result?.actionCards);
      state.chatHistory.push({ role: 'assistant', content: text });

      if (window.chatHistory) window.chatHistory.save(state.chatHistory);

      if (state.autoSpeak && window.voice) window.voice.speak(text);
    } else if (task.status === 'error') {
      removeProgressMessage(progressMsgId);
      if (assistantMsg.parentNode) assistantMsg.remove();
      addChatMessage('assistant', '❌ Error: ' + task.error + '\n\n_Configura tu API key en Settings → Modelos de IA para usar el chat real._', 'chat', []);
    }
    $('#chat-send').disabled = false;
    $('#chat-input').focus();
  });
}

// ─── Render markdown básico en vivo (sin librerías) ───
function renderMarkdownLive(text) {
  if (!text) return '';
  // Escapar HTML primero
  let html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // Code blocks
  html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Bold
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // Italic
  html = html.replace(/_([^_]+)_/g, '<em>$1</em>');
  // Headings
  html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^# (.+)$/gm, '<h2>$1</h2>');
  // Listas
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>');
  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  // Saltos de línea
  html = html.replace(/\n/g, '<br>');
  return html;
}

function streamTextIntoMessage(msgEl, text, agent, actionCards) {
  const body = msgEl.querySelector('.chat__msg-body');
  if (!body) return;

  // Actualizar avatar y clase con el agente correcto
  const avatar = msgEl.querySelector('.chat__msg-avatar');
  if (avatar) avatar.textContent = getAgentIcon(agent);
  msgEl.className = `chat__msg chat__msg--assistant chat__msg--agent-${agent}`;

  // Limpiar cursor
  body.innerHTML = '';

  // Stream palabra por palabra
  const words = text.split(/(\s+)/);
  let full = '';
  let i = 0;

  const interval = setInterval(() => {
    if (i >= words.length) {
      clearInterval(interval);
      // Añadir action cards al final
      if (actionCards?.length) {
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'chat__action-cards';
        actionsDiv.innerHTML = actionCards.map(a => `<button class="chat__action-card chat__action-card--${a.style}" data-action="${a.action}">${a.label}</button>`).join('');
        body.appendChild(actionsDiv);
        actionsDiv.querySelectorAll('.chat__action-card').forEach(btn => {
          btn.addEventListener('click', () => {
            const action = btn.dataset.action;
            toast(action === 'approve' ? '✓ Aprobado' : action === 'cancel' ? '✗ Cancelado' : 'Modifica y reenvía', action === 'approve' ? '✓' : '⚙️');
          });
        });
      }
      msgEl.classList.remove('chat__msg--streaming');
      const messages = $('#chat-messages');
      if (messages) messages.scrollTop = messages.scrollHeight;
      return;
    }
    full += words[i];
    body.innerHTML = escapeHtml(full).replace(/\n/g, '<br>') + '<span class="chat__streaming-cursor"></span>';
    i++;
    const messages = $('#chat-messages');
    if (messages) messages.scrollTop = messages.scrollHeight;
  }, 25);
}

function addProgressMessage(id, text) {
  const messages = $('#chat-messages');
  const empty = messages.querySelector('.chat__empty');
  if (empty) empty.remove();
  const msg = document.createElement('div');
  msg.id = id;
  msg.className = 'chat__msg chat__msg--progress';
  msg.innerHTML = `
    <div class="chat__msg-avatar">⏳</div>
    <div class="chat__msg-body">
      <div class="chat__progress-text">${text}</div>
      <div class="chat__progress-bar"><div class="chat__progress-fill" style="width:0%"></div></div>
    </div>
  `;
  messages.appendChild(msg);
  messages.scrollTop = messages.scrollHeight;
}

function updateProgressMessage(id, text, progress) {
  const msg = document.getElementById(id);
  if (!msg) return;
  const textEl = msg.querySelector('.chat__progress-text');
  const fillEl = msg.querySelector('.chat__progress-fill');
  if (textEl) textEl.textContent = text;
  if (fillEl) fillEl.style.width = progress + '%';
  const messages = $('#chat-messages');
  if (messages) messages.scrollTop = messages.scrollHeight;
}

function removeProgressMessage(id) {
  const msg = document.getElementById(id);
  if (msg) msg.remove();
}

function detectAgentFromQuestion(question) {
  const q = question.toLowerCase();
  if (q.match(/\b(crear|nueva?|abrir)\b.*\b(tarea|bug|issue)\b/) || q.match(/\b(investigar|arreglar|fix)\b/)) return 'orchestrator';
  if (q.match(/\b(stuck|atascad|bloque)\b/)) return 'research';
  if (q.match(/\b(audit|seguridad|secreto|token)\b/)) return 'security';
  if (q.match(/\b(inventar|producto|stock|agotad)\b/)) return 'inventory';
  return 'chat';
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
  // SECURITY FIX (audit #4): escape all interpolated memory fields to prevent XSS
  const episodes = Object.entries(state.data?.index || {})
    .filter(([id, m]) => m.type === 'episode')
    .map(([id, m]) => ({
      id,
      type: 'episode',
      icon: '⚙️',
      title: `Agente <code>${escapeHtml(m.agent || '?')}</code> — intento ${escapeHtml(String(m.attempt || '?'))} de ${escapeHtml(String(m.task_id || '?'))}`,
      meta: `ruta: ${escapeHtml(String(m.result || '?'))}`,
      time: m.created,
    }));

  // Errores nuevos
  const errors = Object.entries(state.data?.index || {})
    .filter(([id, m]) => m.type === 'error')
    .map(([id, m]) => ({
      id,
      type: 'error',
      icon: '🐞',
      title: `Error registrado: <code>${escapeHtml(id)}</code> — ${escapeHtml(m.title || '(sin título)')}`,
      meta: `confidence: ${escapeHtml(String(m.confidence ?? '?'))} · ${m.stale ? '⚠ stale' : 'ok'}`,
      time: m.created || m.updated,
    }));

  // Lecciones
  const lessons = Object.entries(state.data?.index || {})
    .filter(([id, m]) => m.type === 'lesson')
    .map(([id, m]) => ({
      id,
      type: 'lesson',
      icon: '💡',
      title: `Lección propuesta: <code>${escapeHtml(id)}</code> — ${escapeHtml(m.title || '')}`,
      meta: `previno ${escapeHtml(String(m.times_prevented_failure || 0))} fallos`,
      time: m.created,
    }));

  // Decisions
  const decisions = Object.entries(state.data?.index || {})
    .filter(([id, m]) => m.type === 'decision')
    .map(([id, m]) => ({
      id,
      type: 'decision',
      icon: '📋',
      title: `Decisión: <code>${escapeHtml(id)}</code> — ${escapeHtml(m.title || '')}`,
      meta: `scope: ${escapeHtml(String(m.scope || '?'))}`,
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

  // Timeline horizontal (últimas 24h)
  const now = Date.now();
  const dayAgo = now - 24 * 60 * 60 * 1000;
  const recentItems = items.filter(i => new Date(i.time || 0).getTime() > dayAgo);
  const timelineHtml = renderActivityTimeline(recentItems, now);

  // Heatmap de actividad por hora
  const heatmapHtml = renderActivityHeatmap(items);

  list.innerHTML = timelineHtml + heatmapHtml + items.slice(0, 30).map(item => {
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

// ─── Timeline horizontal de actividad ───
function renderActivityTimeline(items, now) {
  if (!items.length) return '';
  const hours = 24;
  const slots = Array.from({ length: hours }, () => []);
  for (const item of items) {
    const ts = new Date(item.time || 0).getTime();
    const hoursAgo = Math.floor((now - ts) / (60 * 60 * 1000));
    if (hoursAgo >= 0 && hoursAgo < hours) {
      slots[hours - 1 - hoursAgo].push(item);
    }
  }
  const maxCount = Math.max(...slots.map(s => s.length), 1);
  const colors = { episode: '#6366f1', error: '#ef4444', lesson: '#a855f7', decision: '#3b82f6' };

  return `
    <div class="panel" style="margin-bottom: var(--s-4)">
      <div class="panel__header"><h3 class="panel__title">📅 Timeline (24h)</h3></div>
      <div class="panel__body">
        <div class="timeline-bar">
          ${slots.map((s, i) => {
            const h = (s.length / maxCount) * 100;
            const color = s.length ? colors[s[0].type] || '#7d8590' : 'var(--bg-elev-3)';
            return `<div class="timeline-slot" title="${s.length} eventos · hace ${hours - 1 - i}h">
              <div class="timeline-slot__bar" style="height:${Math.max(h, 2)}%;background:${color};opacity:${s.length ? 0.8 : 0.3}"></div>
              <div class="timeline-slot__label">${hours - 1 - i}h</div>
            </div>`;
          }).join('')}
        </div>
      </div>
    </div>`;
}

// ─── Heatmap de actividad por hora del día ───
function renderActivityHeatmap(items) {
  // Contar actividad por hora del día (0-23) para los últimos 7 días
  const days = 7;
  const grid = Array.from({ length: days }, () => Array(24).fill(0));
  const now = new Date();
  for (const item of items) {
    const d = new Date(item.time || 0);
    const dayDiff = Math.floor((now.setHours(0,0,0,0) - new Date(d).setHours(0,0,0,0)) / (24 * 60 * 60 * 1000));
    if (dayDiff >= 0 && dayDiff < days) {
      grid[dayDiff][d.getHours()]++;
    }
  }
  const max = Math.max(...grid.flat(), 1);
  const dayLabels = ['Hoy', 'Ayer', '-2d', '-3d', '-4d', '-5d', '-6d'];

  return `
    <div class="panel" style="margin-bottom: var(--s-4)">
      <div class="panel__header"><h3 class="panel__title">🔥 Mapa de calor de actividad</h3></div>
      <div class="panel__body" style="overflow-x:auto">
        <div class="heatmap-grid-activity">
          <div class="heatmap-row heatmap-row--header">
            <div class="heatmap-cell-label"></div>
            ${Array.from({length:24}, (_,h) => `<div class="heatmap-hour">${h%6===0?h:''}</div>`).join('')}
          </div>
          ${grid.map((day, di) => `
            <div class="heatmap-row">
              <div class="heatmap-cell-label">${dayLabels[di]}</div>
              ${day.map((count, h) => {
                const intensity = count / max;
                const r = 99, g = Math.round(102 + (1-intensity)*100), b = 241;
                const bg = count > 0 ? `rgba(${r},${g},${b},${0.2+intensity*0.8})` : 'var(--bg-elev-2)';
                return `<div class="heatmap-cell-act" style="background:${bg}" title="${dayLabels[di]} ${h}:00 — ${count} eventos"></div>`;
              }).join('')}
            </div>
          `).join('')}
        </div>
      </div>
    </div>`;
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
  el.innerHTML = '<div class="inv-loading"><div class="inv-loading__spinner"></div><div>Comparando inventarios…</div></div>';

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

// ─── Análisis de inventario de UN solo repo ───
// El usuario pega un link y el sistema detecta todo: archivo, campos, productos.
async function analyzeSingleRepoInventory(repo) {
  const token = localStorage.getItem('agent-brain-pat') || state.token || '';
  const el = $('#inventory-result');
  el.innerHTML = '<div class="inv-loading"><div class="inv-loading__spinner"></div><div>Analizando repo…</div></div>';

  try {
    // 1. Buscar archivo de productos automáticamente
    const file = await findInventoryFileClient(repo, token);
    if (!file) {
      el.innerHTML = `
        <div class="inv-empty">
          <div class="inv-empty__icon">🔍</div>
          <div class="inv-empty__text">
            No se encontró archivo de productos en <code>${escapeHtml(repo)}</code>.<br>
            Patrones buscados: products.json, inventory.json, data/products.json, etc.<br><br>
            <strong>Soluciones:</strong><br>
            • Verifica que el repo tenga un archivo de productos<br>
            • O configura un segundo repo para comparar (próximamente)
          </div>
        </div>`;
      return;
    }

    // 2. Parsear productos
    const products = parseInventory(file.content, file.path);
    if (!products.length) {
      el.innerHTML = `<div class="inv-empty"><div class="inv-empty__icon">⚠️</div><div class="inv-empty__text">Se encontró <code>${escapeHtml(file.path)}</code> pero no se pudieron parsear productos.</div></div>`;
      return;
    }

    // 3. Detectar campos automáticamente
    const sample = products[0];
    const idField = detectIdField(sample);
    const stockField = detectStockField(sample);
    const nameField = detectNameField(sample);
    const priceField = detectPriceField(sample);

    // 4. Clasificar productos
    const agotados = [];
    const stockBajo = [];
    const disponibles = [];
    let totalValue = 0;

    for (const p of products) {
      const id = p[idField];
      if (id == null) continue;
      const stock = stockField ? Number(p[stockField]) || 0 : null;
      const price = priceField ? Number(p[priceField]) || 0 : null;
      const name = p[nameField] || id;

      if (stock === 0) {
        agotados.push({ id: String(id), name, stock: 0, price });
      } else if (stock !== null && stock < 5) {
        stockBajo.push({ id: String(id), name, stock, price });
      } else if (stock !== null && stock > 0) {
        disponibles.push({ id: String(id), name, stock, price });
        if (price) totalValue += price * stock;
      }
    }

    // 5. Render reporte
    renderSingleRepoReport({
      repo,
      file: file.path,
      totalProducts: products.length,
      fields: { id: idField, stock: stockField, name: nameField, price: priceField },
      agotados,
      stockBajo,
      disponibles,
      totalValue,
      summary: {
        total: products.length,
        agotados: agotados.length,
        stockBajo: stockBajo.length,
        disponibles: disponibles.length,
      },
    });
  } catch (err) {
    el.innerHTML = `<div class="inv-empty"><div class="inv-empty__icon">❌</div><div class="inv-empty__text">Error: ${escapeHtml(err.message)}</div></div>`;
  }
}

function renderSingleRepoReport(report) {
  const el = $('#inventory-result');
  const s = report.summary;
  const fmtPrice = (p) => p != null ? `$${Number(p).toFixed(2)}` : '';

  const kpis = [
    { value: s.total, label: 'total productos', cls: '', icon: '📦' },
    { value: s.disponibles, label: 'disponibles', cls: 'inv-kpi--success', icon: '✅' },
    { value: s.agotados, label: 'agotados', cls: s.agotados > 0 ? 'inv-kpi--danger' : 'inv-kpi--success', icon: '🔴' },
    { value: s.stockBajo, label: 'stock bajo', cls: s.stockBajo > 0 ? 'inv-kpi--warning' : '', icon: '⚠️' },
  ];
  if (report.totalValue > 0) {
    kpis.push({ value: '$' + (report.totalValue < 1000 ? report.totalValue.toFixed(0) : (report.totalValue / 1000).toFixed(1) + 'k'), label: 'valor inventario', cls: 'inv-kpi--info', icon: '💰' });
  }

  // Guardar reporte para exportar CSV
  state.lastInventoryReport = report;
  // Guardar entrada en histórico + snapshot (silencioso)
  saveInventoryHistoryEntry(report);
  saveInventorySnapshot(report);
  // Verificar alertas custom
  checkCustomAlerts(report);

  // Detectar moneda y preparar selector
  const detectedCurrency = detectCurrency(report);
  const currentCurrency = state.inventoryCurrency || detectedCurrency;
  const currencies = ['USD', 'EUR', 'MXN', 'CUP', 'ARS', 'COP', 'CLP', 'PEN'];

  const fmtPriceConverted = (p) => {
    if (p == null) return '';
    const converted = convertPrice(Number(p), detectedCurrency, currentCurrency);
    return formatPriceCurrency(converted, currentCurrency);
  };

  const headers = ['ID', 'Nombre', 'Stock'];
  if (report.fields.price) headers.push('Precio');

  const makeSection = (id, title, icon, cls, items, delays) => {
    if (!items.length) return '';
    return `
      <div class="inv-section inv-section--${cls}" style="animation-delay: ${delays}s" data-section-id="${id}">
        <div class="inv-section__header">
          <h3 class="inv-section__title">${icon} ${title}</h3>
          <span class="inv-section__count">${items.length}</span>
          <div class="inv-section__search">
            <span class="inv-section__search-icon">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </span>
            <input type="text" data-search-section="${id}" placeholder="Filtrar…" autocomplete="off">
          </div>
          <button class="inv-section__export" data-export="${id}">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            CSV
          </button>
        </div>
        <table class="inv-table">
          <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
          <tbody data-tbody="${id}">
            ${items.slice(0, 50).map(p => `
              <tr data-id="${escapeHtml(p.id)}" data-name="${escapeHtml(p.name)}">
                <td>${escapeHtml(p.id)}</td>
                <td>${escapeHtml(p.name)}</td>
                <td class="inv-stock inv-stock--${cls === 'danger' ? 'zero' : cls === 'warning' ? 'low' : 'ok'}">${p.stock}</td>
                ${report.fields.price ? `<td class="inv-price">${fmtPriceConverted(p.price)}</td>` : ''}
              </tr>
            `).join('')}
          </tbody>
        </table>
        ${items.length > 50 ? `<div class="inv-section__more" data-more="${id}" style="padding: var(--s-3); text-align: center; color: var(--text-muted); font-size: 12px">y ${items.length - 50} más (usa el filtro para encontrar)</div>` : ''}
      </div>`;
  };

  el.innerHTML = `
    <div class="info-banner" style="margin-bottom: var(--s-4)">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
      <span>Repo: <strong>${escapeHtml(report.repo)}</strong> · Archivo: <code>${escapeHtml(report.file)}</code> · Campos: id=<code>${escapeHtml(report.fields.id)}</code>, stock=<code>${escapeHtml(report.fields.stock || '?')}</code>, name=<code>${escapeHtml(report.fields.name)}</code>${report.fields.price ? `, price=<code>${escapeHtml(report.fields.price)}</code>` : ''}</span>
    </div>
    <div class="inv-toolbar">
      <div class="info-banner" style="margin: 0; padding: 6px 12px; font-size: 11px">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
        <span>Reporte generado en ${new Date().toLocaleTimeString('es')}</span>
      </div>
      <div class="inv-toolbar__actions">
        ${report.fields.price ? `
          <select class="inv-toolbar__btn" id="inv-currency-sel" style="padding: 7px 8px;">
            ${currencies.map(c => `<option value="${c}" ${c === currentCurrency ? 'selected' : ''}>${c}</option>`).join('')}
          </select>
        ` : ''}
        <button class="inv-toolbar__btn" id="inv-history-btn" title="Ver histórico">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          <span>Histórico</span>
        </button>
        <button class="inv-toolbar__btn" id="inv-alerts-btn" title="Alertas custom">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          <span>Alertas</span>
        </button>
        <button class="inv-toolbar__btn" id="inv-heatmap-btn" title="Mapa de calor">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4 4 0 1 0 5 0z"/></svg>
          <span>Heatmap</span>
        </button>
        <button class="inv-toolbar__btn" id="inv-prediction-btn" title="Predicción de demanda">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2"/><path d="M16 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0z"/></svg>
          <span>Predicción</span>
        </button>
        <button class="inv-toolbar__btn" id="inv-suppliers-btn" title="Proveedores">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
          <span>Proveedores</span>
        </button>
        <button class="inv-toolbar__btn" id="inv-shopify-btn" title="Conectar tienda Shopify/WooCommerce">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
          <span>Tienda</span>
        </button>
        <button class="inv-toolbar__btn" data-export="all">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          <span>CSV</span>
        </button>
      </div>
    </div>
    <div class="inv-kpi-grid">
      ${kpis.map(k => `<div class="inv-kpi ${k.cls}"><div class="inv-kpi__icon">${k.icon}</div><div class="inv-kpi__value">${k.value}</div><div class="inv-kpi__label">${k.label}</div></div>`).join('')}
    </div>
    ${makeSection('agotados', 'Agotados (stock = 0)', '🔴', 'danger', report.agotados, 0.1)}
    ${makeSection('stockBajo', 'Stock bajo (< 5 unidades)', '⚠️', 'warning', report.stockBajo, 0.2)}
    ${makeSection('disponibles', 'Disponibles', '✅', 'success', report.disponibles, 0.3)}
  `;

  // Attach search + export listeners
  attachInventorySectionListeners(report);
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

  // Cargar historial de chat persistente
  if (window.chatHistory) {
    const saved = window.chatHistory.load();
    if (saved.length > 0) {
      state.chatHistory = saved;
      // Renderizar mensajes guardados
      for (const msg of saved) {
        if (msg.role === 'user') addChatMessage('user', msg.content);
        else if (msg.role === 'assistant') addChatMessage('assistant', msg.content, 'chat', []);
      }
    }
  }

  // Inicializar realtime si Supabase está configurado
  if (window.streaming && window.streaming.initRealtime) window.streaming.initRealtime();

  // Cargar modo compacto
  if (localStorage.getItem('agent-brain-compact') === '1') document.body.classList.add('compact-mode');

  // Cargar tema automático del sistema
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', (e) => {
      if (localStorage.getItem('agent-brain-theme') === null) {
        document.documentElement.dataset.theme = e.matches ? 'light' : 'dark';
      }
    });
  }

  // Inicializar pull-to-refresh en móvil
  initPullToRefresh();

  // Inicializar swipe gestures
  initSwipeGestures();

  // Inicializar haptic feedback
  initHaptics();

  // Inicializar background sidebar
  initBgSidebar();

  // Auth UI update
  if (window.updateAuthUI) window.updateAuthUI();
}

// ─── Pull-to-refresh ───
function initPullToRefresh() {
  let pullStart = 0;
  let pulling = false;
  const indicator = document.createElement('div');
  indicator.className = 'pull-refresh';
  indicator.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>';
  document.body.appendChild(indicator);

  document.getElementById('content')?.addEventListener('touchstart', (e) => {
    if (document.getElementById('content').scrollTop === 0) {
      pullStart = e.touches[0].clientY;
      pulling = true;
    }
  });

  document.getElementById('content')?.addEventListener('touchmove', (e) => {
    if (!pulling) return;
    const diff = e.touches[0].clientY - pullStart;
    if (diff > 60 && diff < 120) {
      indicator.classList.add('visible');
    }
  });

  document.getElementById('content')?.addEventListener('touchend', async (e) => {
    if (!pulling) return;
    pulling = false;
    const diff = (e.changedTouches[0]?.clientY || 0) - pullStart;
    if (diff > 80) {
      indicator.classList.add('refreshing');
      haptic('medium');
      await loadAll();
      toast('Datos actualizados', '✓');
      setTimeout(() => { indicator.classList.remove('refreshing', 'visible'); }, 600);
    } else {
      indicator.classList.remove('visible');
    }
  });
}

// ─── Swipe gestures entre vistas ───
function initSwipeGestures() {
  let touchStartX = 0;
  let touchStartY = 0;
  const views = ['overview','tasks','errors','lessons','diary','budget','agents','memory','chat','activity','metrics','inventory','graph','settings'];
  const content = document.getElementById('content');
  if (!content) return;

  content.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });

  content.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx)) return; // no es swipe horizontal
    const currentIdx = views.indexOf(state.currentView);
    if (dx > 0 && currentIdx > 0) {
      switchView(views[currentIdx - 1]);
      haptic('light');
    } else if (dx < 0 && currentIdx < views.length - 1) {
      switchView(views[currentIdx + 1]);
      haptic('light');
    }
  }, { passive: true });
}

// ─── Haptic feedback ───
function haptic(intensity = 'light') {
  if (!navigator.vibrate) return;
  const patterns = { light: 10, medium: 30, heavy: 50, success: [10, 30, 10], error: [50, 30, 50] };
  navigator.vibrate(patterns[intensity] || 10);
}

function initHaptics() {
  // Haptic en clicks de nav
  document.querySelectorAll('.nav__item, .bottom-nav__item').forEach(btn => {
    btn.addEventListener('click', () => haptic('light'));
  });
  // Haptic en botones primarios
  document.addEventListener('click', (e) => {
    if (e.target.closest('.btn--primary')) haptic('medium');
  });
  // Haptic en FAB
  document.getElementById('fab-analyze')?.addEventListener('click', () => haptic('medium'));
}

// ─── Background tasks sidebar ───
function initBgSidebar() {
  const sidebar = document.createElement('div');
  sidebar.className = 'bg-sidebar';
  sidebar.id = 'bg-sidebar';
  sidebar.innerHTML = `
    <div class="bg-sidebar__header">
      <h3 class="bg-sidebar__title">⏳ Tareas en background</h3>
      <button class="icon-btn icon-btn--ghost" id="bg-sidebar-close">×</button>
    </div>
    <div id="bg-sidebar-list"></div>
  `;
  document.body.appendChild(sidebar);
  document.getElementById('bg-sidebar-close')?.addEventListener('click', () => sidebar.classList.remove('open'));

  // Actualizar lista periódicamente
  // BUGFIX (audit #1.5): track user-closed flag so the sidebar doesn't auto-reopen
  // every second when the user dismissed it.
  let bgSidebarUserClosed = false;
  document.getElementById('bg-sidebar-close')?.addEventListener('click', () => {
    bgSidebarUserClosed = true;
    sidebar.classList.remove('open');
  });
  let lastActiveCount = 0;
  setInterval(() => {
    const list = document.getElementById('bg-sidebar-list');
    if (!list || !window.bgRunner) return;
    const active = window.bgRunner.getActive();
    if (!active.length) {
      list.innerHTML = '<div class="notif-empty">Sin tareas activas</div>';
      sidebar.classList.remove('open');
      bgSidebarUserClosed = false;
      lastActiveCount = 0;
      return;
    }
    // Only auto-open on the rising edge (0 → >0); respect user-closed state.
    if (lastActiveCount === 0 && active.length > 0) {
      bgSidebarUserClosed = false;
    }
    lastActiveCount = active.length;
    if (!bgSidebarUserClosed && !sidebar.classList.contains('open')) {
      sidebar.classList.add('open');
    }
    list.innerHTML = active.map(t => `
      <div class="bg-task-item">
        <div class="bg-task-item__desc">${escapeHtml(t.description || '')}</div>
        <div class="bg-task-item__bar"><div class="bg-task-item__fill" style="width:${t.progress || 0}%"></div></div>
      </div>
    `).join('');
  }, 1000);
}

// ─── Inventory: search filter + CSV export ───
function attachInventorySectionListeners(report) {
  // Search filter por sección
  $$('[data-search-section]').forEach(input => {
    input.addEventListener('input', (e) => {
      const sectionId = e.target.dataset.searchSection;
      const q = e.target.value.toLowerCase().trim();
      const tbody = $(`[data-tbody="${sectionId}"]`);
      if (!tbody) return;
      const rows = tbody.querySelectorAll('tr');
      let visible = 0;
      rows.forEach(row => {
        const id = (row.dataset.id || '').toLowerCase();
        const name = (row.dataset.name || '').toLowerCase();
        const match = !q || id.includes(q) || name.includes(q);
        row.style.display = match ? '' : 'none';
        if (match) visible++;
      });
      const moreEl = $(`[data-more="${sectionId}"]`);
      if (moreEl) {
        moreEl.textContent = q
          ? `${visible} de ${rows.length} coinciden`
          : `y ${report[sectionId].length - 50} más (usa el filtro para encontrar)`;
      }
    });
  });

  // Export CSV por sección
  $$('[data-export]').forEach(btn => {
    btn.addEventListener('click', () => {
      const sectionId = btn.dataset.export;
      if (sectionId === 'all') {
        exportInventoryCSV(report);
      } else {
        exportInventoryCSV(report, sectionId);
      }
    });
  });

  // Botón "ver histórico"
  $('#inv-history-btn')?.addEventListener('click', () => {
    showHistoryModal(report.repo);
  });

  // Botón "alertas custom"
  $('#inv-alerts-btn')?.addEventListener('click', () => {
    showAlertsModal(report);
  });

  // Botón "mapa de calor"
  $('#inv-heatmap-btn')?.addEventListener('click', () => {
    showHeatmapModal(report.repo);
  });

  // Botón "predicción"
  $('#inv-prediction-btn')?.addEventListener('click', () => {
    showPredictionModal(report.repo);
  });

  // Botón "proveedores"
  $('#inv-suppliers-btn')?.addEventListener('click', () => {
    showSuppliersModal(report);
  });

  // Botón "webhook Shopify"
  $('#inv-shopify-btn')?.addEventListener('click', () => {
    showShopifyModal(report.repo);
  });

  // Selector de moneda
  $('#inv-currency-sel')?.addEventListener('change', (e) => {
    state.inventoryCurrency = e.target.value;
    renderSingleRepoReport(state.lastInventoryReport);
  });
}

// ─── Proveedores (auto-reabastecimiento) ───
const SUPPLIERS_KEY = 'agent-brain-inv-suppliers';

function loadSuppliers() {
  try { return JSON.parse(localStorage.getItem(SUPPLIERS_KEY) || '[]'); }
  catch { return []; }
}

function saveSuppliers(list) {
  localStorage.setItem(SUPPLIERS_KEY, JSON.stringify(list));
}

function showSuppliersModal(report) {
  let modal = $('#suppliers-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'suppliers-modal';
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal__backdrop" data-close></div>
      <div class="modal__panel">
        <div class="modal__header">
          <h2 class="modal__title">🚚 Proveedores</h2>
          <button class="icon-btn icon-btn--ghost" data-close>×</button>
        </div>
        <div class="modal__body" id="suppliers-modal-body"></div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => {
      if (e.target.matches('[data-close]') || e.target.closest('[data-close]')) {
        modal.hidden = true;
      }
    });
  }
  const body = $('#suppliers-modal-body');
  const allProducts = [
    ...(report.agotados || []).map(p => ({ ...p, status: 'agotado' })),
    ...(report.stockBajo || []).map(p => ({ ...p, status: 'bajo' })),
    ...(report.disponibles || []).map(p => ({ ...p, status: 'ok' })),
  ];
  body.innerHTML = `
    <p style="color:var(--text-secondary);font-size:13px;margin:0 0 var(--s-3);line-height:1.6">
      Asigna un proveedor a cada producto. Cuando un producto está agotado o con stock bajo, muestra su contacto y crea una orden de reabastecimiento sugerida.
    </p>
    <div class="field">
      <label class="field__label">Producto</label>
      <select class="field__input" id="sup-product">
        ${allProducts.slice(0, 200).map(p => `<option value="${escapeHtml(p.id)}|${escapeHtml(p.name)}|${p.stock}">${escapeHtml(p.id)} — ${escapeHtml(p.name)} (stock: ${p.stock})</option>`).join('')}
      </select>
    </div>
    <div class="form-grid">
      <div class="field">
        <label class="field__label">Proveedor</label>
        <input class="field__input" type="text" id="sup-name" placeholder="ACME Distribuciones">
      </div>
      <div class="field">
        <label class="field__label">Contacto (email/tel)</label>
        <input class="field__input" type="text" id="sup-contact" placeholder="ventas@acme.com">
      </div>
      <div class="field">
        <label class="field__label">Cantidad a pedir</label>
        <input class="field__input" type="number" id="sup-qty" value="20" min="1">
      </div>
      <div class="field">
        <label class="field__label">Lead time (días)</label>
        <input class="field__input" type="number" id="sup-lead" value="7" min="1">
      </div>
    </div>
    <button class="btn btn--primary" id="add-supplier-btn" style="margin-bottom: var(--s-4)">
      <span>+ Asignar proveedor</span>
    </button>
    <div id="suppliers-list"></div>
    <div id="reorder-suggestions"></div>
  `;
  renderSuppliersList(report.repo, report);
  $('#add-supplier-btn').addEventListener('click', () => {
    const sel = $('#sup-product').value.split('|');
    const suppliers = loadSuppliers();
    suppliers.push({
      repo: report.repo,
      productId: sel[0],
      productName: sel[1] || sel[0],
      currentStock: parseInt(sel[2], 10) || 0,
      supplier: $('#sup-name').value.trim(),
      contact: $('#sup-contact').value.trim(),
      reorderQty: parseInt($('#sup-qty').value, 10) || 20,
      leadTime: parseInt($('#sup-lead').value, 10) || 7,
      created: Date.now(),
    });
    saveSuppliers(suppliers);
    renderSuppliersList(report.repo, report);
    toast('Proveedor asignado', '🚚');
  });
  modal.hidden = false;
}

function renderSuppliersList(repo, report) {
  const el = $('#suppliers-list');
  if (!el) return;
  const list = loadSuppliers().filter(s => s.repo === repo);
  if (!list.length) {
    el.innerHTML = `<div class="inv-empty" style="padding: var(--s-5)"><div class="inv-empty__text">Sin proveedores asignados. Asigna uno arriba.</div></div>`;
    $('#reorder-suggestions').innerHTML = '';
    return;
  }
  el.innerHTML = `
    <div class="inv-section">
      <div class="inv-section__header"><h3 class="inv-section__title">🚚 ${list.length} proveedor${list.length > 1 ? 'es' : ''} asignado${list.length > 1 ? 's' : ''}</h3></div>
      <table class="inv-table">
        <thead><tr><th>Producto</th><th>Proveedor</th><th>Contacto</th><th>Qty pedido</th><th>Lead</th><th></th></tr></thead>
        <tbody>
          ${list.map((s, i) => `
            <tr>
              <td>${escapeHtml(s.productId)}<br><small style="color:var(--text-muted)">${escapeHtml(s.productName)}</small></td>
              <td>${escapeHtml(s.supplier)}</td>
              <td style="font-family:var(--font-mono);font-size:11px">${escapeHtml(s.contact || '—')}</td>
              <td class="inv-stock">${s.reorderQty}</td>
              <td class="inv-stock">${s.leadTime}d</td>
              <td><button class="inv-section__export" data-del-sup="${i}" style="color:var(--danger);border-color:rgba(239,68,68,0.3)">🗑</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
  $$('[data-del-sup]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.delSup, 10);
      const all = loadSuppliers().filter(s => s.repo === repo);
      const target = all[idx];
      if (!target) return;
      const remaining = loadSuppliers().filter(s => !(s.repo === target.repo && s.productId === target.productId && s.created === target.created));
      saveSuppliers(remaining);
      renderSuppliersList(repo, report);
      toast('Proveedor eliminado', '🗑');
    });
  });

  // Sugerencias de reabastecimiento automático
  const agotados = report.agotados || [];
  const stockBajo = report.stockBajo || [];
  const urgent = list.filter(s => {
    const isAgotado = agotados.some(p => String(p.id) === String(s.productId));
    const isBajo = stockBajo.some(p => String(p.id) === String(s.productId));
    return isAgotado || isBajo;
  });
  if (urgent.length) {
    $('#reorder-suggestions').innerHTML = `
      <div class="inv-section inv-section--warning" style="margin-top: var(--s-4)">
        <div class="inv-section__header">
          <h3 class="inv-section__title">⚠️ ${urgent.length} pedido${urgent.length > 1 ? 's' : ''} de reabastecimiento sugerido${urgent.length > 1 ? 's' : ''}</h3>
        </div>
        <table class="inv-table">
          <thead><tr><th>Producto</th><th>Proveedor</th><th>Contacto</th><th>Cantidad</th><th>Llega en</th><th></th></tr></thead>
          <tbody>
            ${urgent.map(s => {
              const isAgotado = agotados.some(p => String(p.id) === String(s.productId));
              return `
                <tr>
                  <td>${escapeHtml(s.productId)}<br><small style="color:var(--text-muted)">${escapeHtml(s.productName)}</small></td>
                  <td>${escapeHtml(s.supplier)}</td>
                  <td style="font-family:var(--font-mono);font-size:11px">${escapeHtml(s.contact || '—')}</td>
                  <td class="inv-stock">${s.reorderQty}</td>
                  <td class="inv-stock inv-stock--${isAgotado ? 'zero' : 'low'}">${s.leadTime}d</td>
                  <td>
                    ${s.contact ? `<a class="inv-section__export" href="mailto:${escapeHtml(s.contact)}?subject=Pedido%20${escapeHtml(s.productName)}&body=Hola,%20necesito%20reabastecer%20${s.reorderQty}%20unidades%20de%20${escapeHtml(s.productName)}%20(ID:%20${escapeHtml(s.productId)})." target="_blank" style="color:var(--accent)">📧</a>` : ''}
                  </td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  } else {
    $('#reorder-suggestions').innerHTML = '';
  }
}

// ─── Webhook Shopify/WooCommerce (config + UI) ───
const WEBHOOKS_KEY = 'agent-brain-inv-webhooks';

function loadWebhooks() {
  try { return JSON.parse(localStorage.getItem(WEBHOOKS_KEY) || '[]'); }
  catch { return []; }
}

function saveWebhooks(list) {
  localStorage.setItem(WEBHOOKS_KEY, JSON.stringify(list));
}

function showShopifyModal(repo) {
  let modal = $('#shopify-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'shopify-modal';
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal__backdrop" data-close></div>
      <div class="modal__panel">
        <div class="modal__header">
          <h2 class="modal__title">🛒 Webhook de tienda (Shopify/WooCommerce)</h2>
          <button class="icon-btn icon-btn--ghost" data-close>×</button>
        </div>
        <div class="modal__body" id="shopify-modal-body"></div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => {
      if (e.target.matches('[data-close]') || e.target.closest('[data-close]')) {
        modal.hidden = true;
      }
    });
  }
  const body = $('#shopify-modal-body');
  const existing = loadWebhooks().find(w => w.repo === repo);
  body.innerHTML = `
    <p style="color:var(--text-secondary);font-size:13px;margin:0 0 var(--s-3);line-height:1.6">
      Conecta tu tienda Shopify o WooCommerce. El webhook enviará eventos de inventario (producto agotado, nuevo producto, stock bajo) a este dashboard en tiempo real.
    </p>
    <div class="field">
      <label class="field__label">Tipo de plataforma</label>
      <select class="field__input" id="wh-platform">
        <option value="shopify" ${existing?.platform === 'shopify' ? 'selected' : ''}>Shopify</option>
        <option value="woocommerce" ${existing?.platform === 'woocommerce' ? 'selected' : ''}>WooCommerce</option>
        <option value="manual" ${existing?.platform === 'manual' || !existing ? 'selected' : ''}>Manual (subir CSV/JSON)</option>
      </select>
    </div>
    <div class="field">
      <label class="field__label">URL de la tienda</label>
      <input class="field__input" type="text" id="wh-url" placeholder="https://mitienda.com" value="${escapeHtml(existing?.url || '')}">
    </div>
    <div class="field">
      <label class="field__label">API Key / Token de acceso</label>
      <input class="field__input" type="password" id="wh-token" placeholder="shpat_xxx... o woo_key" value="${escapeHtml(existing?.token || '')}">
    </div>
    <div class="info-banner" style="margin-top: var(--s-3)">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
      <span>Para Shopify: usa un <strong>Admin API access token</strong> (permisos <code>read_products, read_inventory</code>).<br>Para WooCommerce: usa <strong>Consumer Key + Secret</strong> en formato <code>key:secret</code>.</span>
    </div>
    <div style="margin-top: var(--s-4); display:flex; gap: var(--s-2); flex-wrap: wrap">
      <button class="btn btn--primary" id="wh-save-btn">💾 Guardar configuración</button>
      <button class="btn btn--analyze" id="wh-test-btn">🔍 Test conexión</button>
      <button class="btn btn--ghost" id="wh-sync-btn">🔄 Sync ahora</button>
    </div>
    <div id="wh-result" style="margin-top: var(--s-3)"></div>
  `;
  $('#wh-save-btn').addEventListener('click', () => {
    const webhooks = loadWebhooks().filter(w => w.repo !== repo);
    webhooks.push({
      repo,
      platform: $('#wh-platform').value,
      url: $('#wh-url').value.trim(),
      token: $('#wh-token').value.trim(),
      created: existing?.created || Date.now(),
      updated: Date.now(),
    });
    saveWebhooks(webhooks);
    toast('Configuración guardada', '💾');
  });
  $('#wh-test-btn').addEventListener('click', async () => {
    const platform = $('#wh-platform').value;
    const url = $('#wh-url').value.trim();
    const token = $('#wh-token').value.trim();
    const resultEl = $('#wh-result');
    if (!url || !token) {
      resultEl.innerHTML = '<div class="info-banner" style="background:rgba(239,68,68,0.08);border-color:rgba(239,68,68,0.3)">⚠️ Falta URL o token</div>';
      return;
    }
    resultEl.innerHTML = '<div class="inv-loading"><div class="inv-loading__spinner"></div><div>Probando conexión…</div></div>';
    try {
      let endpoint, headers;
      if (platform === 'shopify') {
        endpoint = `${url.replace(/\/$/, '')}/admin/api/2024-01/products.json?limit=1`;
        headers = { 'X-Shopify-Access-Token': token };
      } else if (platform === 'woocommerce') {
        const [key, secret] = token.split(':');
        endpoint = `${url.replace(/\/$/, '')}/wp-json/wc/v3/products?per_page=1`;
        headers = { 'Authorization': `Basic ${btoa(`${key}:${secret}`)}` };
      } else {
        throw new Error('Manual no requiere test');
      }
      const res = await fetch(endpoint, { headers });
      if (res.ok) {
        const data = await res.json();
        const count = data.products?.length || 0;
        resultEl.innerHTML = `<div class="info-banner" style="background:rgba(16,185,129,0.08);border-color:rgba(16,185,129,0.3)">✅ Conexión exitosa. ${count} producto(s) detectado(s).</div>`;
      } else {
        resultEl.innerHTML = `<div class="info-banner" style="background:rgba(239,68,68,0.08);border-color:rgba(239,68,68,0.3)">❌ Error ${res.status}: ${res.statusText}</div>`;
      }
    } catch (err) {
      resultEl.innerHTML = `<div class="info-banner" style="background:rgba(239,68,68,0.08);border-color:rgba(239,68,68,0.3)">❌ ${escapeHtml(err.message)}.<br>Si es CORS, configura tu servidor para permitir el origen del dashboard.</div>`;
    }
  });
  $('#wh-sync-btn').addEventListener('click', async () => {
    const platform = $('#wh-platform').value;
    const url = $('#wh-url').value.trim();
    const token = $('#wh-token').value.trim();
    if (!url || !token) {
      toast('Falta URL o token', '⚠️');
      return;
    }
    const resultEl = $('#wh-result');
    resultEl.innerHTML = '<div class="inv-loading"><div class="inv-loading__spinner"></div><div>Sincronizando productos…</div></div>';
    try {
      let endpoint, headers;
      if (platform === 'shopify') {
        endpoint = `${url.replace(/\/$/, '')}/admin/api/2024-01/products.json?limit=250`;
        headers = { 'X-Shopify-Access-Token': token };
      } else {
        const [key, secret] = token.split(':');
        endpoint = `${url.replace(/\/$/, '')}/wp-json/wc/v3/products?per_page=100`;
        headers = { 'Authorization': `Basic ${btoa(`${key}:${secret}`)}` };
      }
      const res = await fetch(endpoint, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const products = (data.products || []).map(p => ({
        id: String(p.id),
        name: p.title || p.name,
        stock: platform === 'shopify'
          ? p.variants?.reduce((s, v) => s + (v.inventory_quantity || 0), 0)
          : p.stock_quantity || 0,
        price: platform === 'shopify' ? parseFloat(p.variants?.[0]?.price || 0) : parseFloat(p.price || 0),
      }));
      if (!products.length) throw new Error('No se encontraron productos');
      const report = {
        repo: `${repo} (sync ${platform})`,
        file: `${platform} API`,
        fields: { id: 'id', stock: 'stock', name: 'name', price: 'price' },
        agotados: products.filter(p => p.stock === 0),
        stockBajo: products.filter(p => p.stock > 0 && p.stock < 5),
        disponibles: products.filter(p => p.stock > 0),
        totalValue: products.reduce((s, p) => s + (p.price || 0) * (p.stock || 0), 0),
        summary: {
          total: products.length,
          agotados: products.filter(p => p.stock === 0).length,
          stockBajo: products.filter(p => p.stock > 0 && p.stock < 5).length,
          disponibles: products.filter(p => p.stock > 0).length,
        },
      };
      renderSingleRepoReport(report);
      modal.hidden = true;
      toast(`Sync exitoso: ${products.length} productos`, '🔄');
    } catch (err) {
      resultEl.innerHTML = `<div class="info-banner" style="background:rgba(239,68,68,0.08);border-color:rgba(239,68,68,0.3)">❌ ${escapeHtml(err.message)}</div>`;
    }
  });
  modal.hidden = false;
}

// ─── Multi-repo support ───
function showMultiRepoModal() {
  let modal = $('#multirepo-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'multirepo-modal';
    modal.innerHTML = `
      <div class="modal__backdrop" data-close></div>
      <div class="modal__panel">
        <div class="modal__header">
          <h2 class="modal__title">📚 Multi-repo</h2>
          <button class="icon-btn icon-btn--ghost" data-close>×</button>
        </div>
        <div class="modal__body" id="multirepo-modal-body"></div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => {
      if (e.target.matches('[data-close]') || e.target.closest('[data-close]')) {
        modal.hidden = true;
      }
    });
  }
  const repos = state.multiRepos || [];
  const body = $('#multirepo-modal-body');
  body.innerHTML = `
    <p style="color:var(--text-secondary);font-size:13px;margin:0 0 var(--s-3);line-height:1.6">
      Gestiona varios repos a la vez. Cada uno se analiza por separado, pero puedes compararlos entre sí.
    </p>
    <div class="field">
      <label class="field__label">Añadir repo (owner/name)</label>
      <input class="field__input" type="text" id="mr-add-input" placeholder="axontech/axon-store">
    </div>
    <button class="btn btn--primary" id="mr-add-btn">+ Añadir</button>
    <div id="mr-list" style="margin-top: var(--s-3)"></div>
  `;
  const renderList = () => {
    const list = $('#mr-list');
    if (!repos.length) {
      list.innerHTML = '<div class="inv-empty" style="padding:var(--s-4)"><div class="inv-empty__text">Sin repos. Añade uno arriba.</div></div>';
      return;
    }
    list.innerHTML = `
      <table class="inv-table">
        <thead><tr><th>Repo</th><th></th></tr></thead>
        <tbody>
          ${repos.map((r, i) => `<tr><td>${escapeHtml(r)}</td><td><button class="inv-section__export" data-mr-del="${i}" style="color:var(--danger)">🗑</button></td></tr>`).join('')}
        </tbody>
      </table>
    `;
    $$('[data-mr-del]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.mrDel, 10);
        repos.splice(idx, 1);
        state.multiRepos = repos;
        localStorage.setItem('agent-brain-multirepos', JSON.stringify(repos));
        renderList();
      });
    });
  };
  renderList();
  $('#mr-add-btn').addEventListener('click', () => {
    const v = $('#mr-add-input').value.trim();
    if (!v) return;
    if (!repos.includes(v)) {
      repos.push(v);
      state.multiRepos = repos;
      localStorage.setItem('agent-brain-multirepos', JSON.stringify(repos));
      $('#mr-add-input').value = '';
      renderList();
      toast('Repo añadido', '📚');
    }
  });
  modal.hidden = false;
}

// ─── Búsqueda full-text en toda la memoria ───
function fullTextMemorySearch(query) {
  const idx = state.data?.index || {};
  const q = query.toLowerCase().trim();
  if (!q) return [];
  const results = [];
  for (const [id, m] of Object.entries(idx)) {
    const title = (m.title || '').toLowerCase();
    const tags = (m.tags || []).join(' ').toLowerCase();
    const project = (m.project || '').toLowerCase();
    if (title.includes(q) || id.toLowerCase().includes(q) || tags.includes(q) || project.includes(q)) {
      results.push({ id, ...m, score: title.includes(q) ? 3 : tags.includes(q) ? 2 : 1 });
    }
  }
  return results.sort((a, b) => b.score - a.score).slice(0, 20);
}

// ─── Modo compacto ───
function toggleCompactMode() {
  document.body.classList.toggle('compact-mode');
  const isCompact = document.body.classList.contains('compact-mode');
  localStorage.setItem('agent-brain-compact', isCompact ? '1' : '0');
  toast(isCompact ? 'Modo compacto activado' : 'Modo normal', '⚙️');
}

// ─── Exportar memoria a JSON ───
function exportMemoryJSON() {
  const data = {
    exportedAt: new Date().toISOString(),
    index: state.data?.index || {},
    stats: state.data?.stats || {},
    tasks: state.data?.tasks || [],
    diary: state.data?.diary || null,
    budget: state.data?.budget || null,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `agent-brain-memory-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('Memoria exportada', '📤');
}

// ─── Histórico de inventario (localStorage) ───
const HISTORY_KEY = 'agent-brain-inv-history';
const MAX_HISTORY = 90;

function loadInventoryHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); }
  catch { return []; }
}

function saveInventoryHistoryEntry(report) {
  const history = loadInventoryHistory();
  const entry = {
    ts: Date.now(),
    date: new Date().toISOString().slice(0, 10),
    repo: report.repo,
    total: report.summary.total,
    agotados: report.summary.agotados,
    stockBajo: report.summary.stockBajo,
    disponibles: report.summary.disponibles,
    totalValue: report.totalValue || 0,
  };
  history.push(entry);
  if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); }
  catch (err) { console.warn('[history] no se pudo guardar:', err.message); }
}

function getRepoHistory(repo) {
  return loadInventoryHistory().filter(e => e.repo === repo);
}

function showHistoryModal(repo) {
  const history = getRepoHistory(repo);
  let modal = $('#history-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'history-modal';
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal__backdrop" data-close></div>
      <div class="modal__panel">
        <div class="modal__header">
          <h2 class="modal__title">📈 Histórico de ${escapeHtml(repo)}</h2>
          <button class="icon-btn icon-btn--ghost" data-close>×</button>
        </div>
        <div class="modal__body" id="history-modal-body"></div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => {
      if (e.target.matches('[data-close]') || e.target.closest('[data-close]')) {
        modal.hidden = true;
      }
    });
  }
  const body = $('#history-modal-body');
  if (history.length < 2) {
    body.innerHTML = `
      <div class="inv-empty">
        <div class="inv-empty__icon">📈</div>
        <div class="inv-empty__text">
          Necesitas al menos 2 análisis para ver histórico.<br>
          Ahora tienes ${history.length}. Cada análisis se guarda automáticamente.
        </div>
      </div>`;
    modal.hidden = false;
    return;
  }
  body.innerHTML = `
    <canvas id="history-chart" width="500" height="220"></canvas>
    <div class="inv-section" style="margin-top: var(--s-4)">
      <div class="inv-section__header"><h3 class="inv-section__title">📊 Últimos ${history.length} análisis</h3></div>
      <table class="inv-table">
        <thead><tr><th>Fecha</th><th>Total</th><th>Agotados</th><th>Stock bajo</th><th>Disponibles</th><th>Valor</th></tr></thead>
        <tbody>
          ${history.slice().reverse().slice(0, 20).map(h => `
            <tr>
              <td>${h.date}</td>
              <td class="inv-stock">${h.total}</td>
              <td class="inv-stock inv-stock--${h.agotados > 0 ? 'zero' : 'ok'}">${h.agotados}</td>
              <td class="inv-stock inv-stock--${h.stockBajo > 0 ? 'low' : 'ok'}">${h.stockBajo}</td>
              <td class="inv-stock inv-stock--ok">${h.disponibles}</td>
              <td class="inv-price">${h.totalValue > 0 ? '$' + h.totalValue.toFixed(0) : '—'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
  modal.hidden = false;
  drawHistoryChart(history);
}

function drawHistoryChart(history) {
  const canvas = $('#history-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  const data = history.slice(-30);
  if (data.length < 2) return;
  const series = [
    { key: 'agotados', color: '#ef4444', label: 'Agotados' },
    { key: 'stockBajo', color: '#f59e0b', label: 'Stock bajo' },
    { key: 'disponibles', color: '#10b981', label: 'Disponibles' },
  ];
  const maxVal = Math.max(...data.flatMap(d => [d.agotados, d.stockBajo, d.disponibles]), 1);
  const padL = 40, padR = 20, padT = 20, padB = 40;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  ctx.strokeStyle = 'rgba(125,133,144,0.1)';
  ctx.lineWidth = 1;
  ctx.fillStyle = '#7d8590';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'right';
  for (let i = 0; i <= 4; i++) {
    const y = padT + (plotH * i) / 4;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(W - padR, y);
    ctx.stroke();
    ctx.fillText(String(Math.round(maxVal * (1 - i / 4))), padL - 4, y + 3);
  }
  const step = plotW / Math.max(data.length - 1, 1);
  for (const s of series) {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    data.forEach((d, i) => {
      const x = padL + i * step;
      const y = padT + plotH - (d[s.key] / maxVal) * plotH;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.fillStyle = s.color;
    data.forEach((d, i) => {
      const x = padL + i * step;
      const y = padT + plotH - (d[s.key] / maxVal) * plotH;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  ctx.fillStyle = '#7d8590';
  ctx.textAlign = 'center';
  const xStep = Math.ceil(data.length / 6);
  data.forEach((d, i) => {
    if (i % xStep === 0 || i === data.length - 1) {
      ctx.fillText(d.date.slice(5), padL + i * step, H - padB + 14);
    }
  });
  ctx.textAlign = 'left';
  let lx = padL;
  for (const s of series) {
    ctx.fillStyle = s.color;
    ctx.fillRect(lx, 4, 10, 10);
    ctx.fillStyle = '#7d8590';
    ctx.fillText(s.label, lx + 14, 12);
    lx += 90;
  }
}

// ─── Alertas custom (umbrales por producto) ───
const ALERTS_KEY = 'agent-brain-inv-alerts';

function loadCustomAlerts() {
  try { return JSON.parse(localStorage.getItem(ALERTS_KEY) || '[]'); }
  catch { return []; }
}

function saveCustomAlerts(alerts) {
  localStorage.setItem(ALERTS_KEY, JSON.stringify(alerts));
}

function showAlertsModal(report) {
  let modal = $('#alerts-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'alerts-modal';
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal__backdrop" data-close></div>
      <div class="modal__panel">
        <div class="modal__header">
          <h2 class="modal__title">⚙️ Alertas personalizadas</h2>
          <button class="icon-btn icon-btn--ghost" data-close>×</button>
        </div>
        <div class="modal__body" id="alerts-modal-body"></div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => {
      if (e.target.matches('[data-close]') || e.target.closest('[data-close]')) {
        modal.hidden = true;
      }
    });
  }
  const body = $('#alerts-modal-body');
  const allProducts = [
    ...report.disponibles.map(p => ({ ...p, status: 'disponible' })),
    ...report.stockBajo.map(p => ({ ...p, status: 'stock bajo' })),
    ...report.agotados.map(p => ({ ...p, status: 'agotado' })),
  ];
  body.innerHTML = `
    <p style="color:var(--text-secondary);font-size:13px;margin:0 0 var(--s-3);line-height:1.6">
      Define umbrales de stock por producto. Cuando un análisis detecta que el stock baja del umbral, recibes notificación push.
    </p>
    <div class="field">
      <label class="field__label">Producto</label>
      <select class="field__input" id="alert-product">
        ${allProducts.map(p => `<option value="${escapeHtml(p.id)}|${escapeHtml(p.name)}">${escapeHtml(p.id)} — ${escapeHtml(p.name)} (stock actual: ${p.stock})</option>`).join('')}
      </select>
    </div>
    <div class="field">
      <label class="field__label">Umbral (notificar cuando stock &lt;=)</label>
      <input class="field__input" type="number" id="alert-threshold" value="5" min="0">
    </div>
    <button class="btn btn--primary" id="add-alert-btn" style="margin-bottom: var(--s-4)">
      <span>+ Añadir alerta</span>
    </button>
    <div id="alerts-list"></div>
  `;
  renderAlertsList(report.repo);
  $('#add-alert-btn').addEventListener('click', () => {
    const sel = $('#alert-product').value.split('|');
    const productId = sel[0];
    const productName = sel[1] || productId;
    const threshold = parseInt($('#alert-threshold').value, 10);
    if (!productId || isNaN(threshold)) return;
    const alerts = loadCustomAlerts();
    if (alerts.some(a => a.repo === report.repo && a.productId === productId)) {
      toast('Ya tienes una alerta para ese producto', '⚠️');
      return;
    }
    alerts.push({ repo: report.repo, productId, productName, threshold, created: Date.now() });
    saveCustomAlerts(alerts);
    renderAlertsList(report.repo);
    toast('Alerta añadida', '🔔');
  });
  modal.hidden = false;
}

function renderAlertsList(repo) {
  const el = $('#alerts-list');
  if (!el) return;
  const alerts = loadCustomAlerts().filter(a => a.repo === repo);
  if (!alerts.length) {
    el.innerHTML = `<div class="inv-empty" style="padding: var(--s-5)"><div class="inv-empty__text">Sin alertas. Añade una arriba.</div></div>`;
    return;
  }
  el.innerHTML = `
    <div class="inv-section__header" style="background:transparent;border:none;padding:0 0 var(--s-2)">
      <h3 class="inv-section__title">🔔 ${alerts.length} alerta${alerts.length > 1 ? 's' : ''} activa${alerts.length > 1 ? 's' : ''}</h3>
    </div>
    <table class="inv-table">
      <thead><tr><th>Producto</th><th>Umbral</th><th></th></tr></thead>
      <tbody>
        ${alerts.map((a, i) => `
          <tr>
            <td>${escapeHtml(a.productId)} — ${escapeHtml(a.productName)}</td>
            <td class="inv-stock inv-stock--low">${a.threshold}</td>
            <td><button class="inv-section__export" data-del-alert="${i}" style="color:var(--danger);border-color:rgba(239,68,68,0.3)">🗑</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
  $$('[data-del-alert]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.delAlert, 10);
      const all = loadCustomAlerts().filter(a => a.repo === repo);
      const target = all[idx];
      if (!target) return;
      const remaining = loadCustomAlerts().filter(a => !(a.repo === target.repo && a.productId === target.productId));
      saveCustomAlerts(remaining);
      renderAlertsList(repo);
      toast('Alerta eliminada', '🗑');
    });
  });
}

function checkCustomAlerts(report) {
  const alerts = loadCustomAlerts().filter(a => a.repo === report.repo);
  if (!alerts.length) return;
  const allProducts = [...report.disponibles, ...report.stockBajo, ...report.agotados];
  for (const alert of alerts) {
    const product = allProducts.find(p => String(p.id) === String(alert.productId));
    if (!product) continue;
    if (product.stock <= alert.threshold) {
      showNotification(
        `🔔 ${alert.productName} cruzó tu umbral`,
        `Stock actual: ${product.stock} (umbral: ${alert.threshold})`,
        { icon: '🔔', tag: `alert-${alert.productId}`, renotify: true }
      );
    }
  }
}

// ─── Multi-moneda ───
const STATIC_RATES = {
  USD: { USD: 1, EUR: 0.92, MXN: 17.5, CUP: 240, ARS: 850, COP: 4100, CLP: 950, PEN: 3.8 },
  EUR: { USD: 1.09, EUR: 1, MXN: 19, CUP: 260, ARS: 920, COP: 4450, CLP: 1030, PEN: 4.1 },
  MXN: { USD: 0.057, EUR: 0.053, MXN: 1, CUP: 13.7, ARS: 48.5, COP: 234, CLP: 54, PEN: 0.22 },
  CUP: { USD: 0.0042, EUR: 0.0038, MXN: 0.073, CUP: 1, ARS: 3.5, COP: 17, CLP: 4, PEN: 0.016 },
};

function detectCurrency(report) {
  if (/\.cu$|cuban/i.test(report.repo)) return 'CUP';
  if (/\.mx$|mexic/i.test(report.repo)) return 'MXN';
  if (/\.ar$|argent/i.test(report.repo)) return 'ARS';
  return 'USD';
}

function convertPrice(price, fromCurrency, toCurrency) {
  if (!price || fromCurrency === toCurrency) return price;
  const rates = STATIC_RATES[fromCurrency] || STATIC_RATES.USD;
  const rate = rates[toCurrency] || 1;
  return price * rate;
}

function formatPriceCurrency(price, currency) {
  if (price == null) return '';
  const symbols = { USD: '$', EUR: '€', MXN: '$', CUP: '$', ARS: '$', COP: '$', CLP: '$', PEN: 'S/' };
  const symbol = symbols[currency] || '$';
  const formatted = price < 100 ? price.toFixed(2) : price < 10000 ? price.toFixed(0) : (price / 1000).toFixed(1) + 'k';
  return `${symbol}${formatted}`;
}

// ─── Mapa de calor ───
function loadInventorySnapshots(repo) {
  try { return JSON.parse(localStorage.getItem(`inv-snapshots-${repo}`) || '[]'); }
  catch { return []; }
}

function saveInventorySnapshot(report) {
  if (!report?.repo) return;
  const key = `inv-snapshots-${report.repo}`;
  let snapshots = [];
  try { snapshots = JSON.parse(localStorage.getItem(key) || '[]'); } catch {}
  snapshots.push({
    ts: Date.now(),
    date: new Date().toISOString().slice(0, 10),
    agotados: report.agotados || [],
    stockBajo: report.stockBajo || [],
    disponibles: (report.disponibles || []).slice(0, 50),
    summary: report.summary,
  });
  if (snapshots.length > 60) snapshots.splice(0, snapshots.length - 60);
  try { localStorage.setItem(key, JSON.stringify(snapshots)); }
  catch (err) { console.warn('[snapshot] no se pudo guardar:', err.message); }
}

function showHeatmapModal(repo) {
  const snapshots = loadInventorySnapshots(repo);
  let modal = $('#heatmap-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'heatmap-modal';
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal__backdrop" data-close></div>
      <div class="modal__panel">
        <div class="modal__header">
          <h2 class="modal__title">🔥 Mapa de calor — productos más agotados</h2>
          <button class="icon-btn icon-btn--ghost" data-close>×</button>
        </div>
        <div class="modal__body" id="heatmap-modal-body"></div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => {
      if (e.target.matches('[data-close]') || e.target.closest('[data-close]')) {
        modal.hidden = true;
      }
    });
  }
  const body = $('#heatmap-modal-body');
  if (snapshots.length < 2) {
    body.innerHTML = `
      <div class="inv-empty">
        <div class="inv-empty__icon">📊</div>
        <div class="inv-empty__text">
          Necesitas al menos 2 análisis para ver el mapa de calor.<br>
          Ahora tienes ${snapshots.length}.<br>
          Cada análisis guarda un snapshot automáticamente.
        </div>
      </div>`;
    modal.hidden = false;
    return;
  }
  const agotadoCount = new Map();
  for (const snap of snapshots) {
    for (const p of snap.agotados || []) {
      const key = String(p.id);
      agotadoCount.set(key, (agotadoCount.get(key) || 0) + 1);
    }
  }
  const lastSnap = snapshots[snapshots.length - 1];
  const sorted = Array.from(agotadoCount.entries())
    .map(([id, count]) => ({
      id,
      name: lastSnap.agotados?.find(p => String(p.id) === id)?.name || id,
      timesAgotado: count,
      pct: Math.round((count / snapshots.length) * 100),
    }))
    .sort((a, b) => b.timesAgotado - a.timesAgotado)
    .slice(0, 30);

  if (!sorted.length) {
    body.innerHTML = `<div class="inv-empty"><div class="inv-empty__icon">🎉</div><div class="inv-empty__text">¡Ningún producto se ha agotado en los ${snapshots.length} análisis!</div></div>`;
  } else {
    body.innerHTML = `
      <p style="color:var(--text-secondary);font-size:13px;margin:0 0 var(--s-3);line-height:1.6">
        Productos que se agotaron en más análisis (de ${snapshots.length} totales en ${escapeHtml(repo)}).
        Rojo más intenso = más veces agotado.
      </p>
      <div class="heatmap-grid">
        ${sorted.map(p => {
          const intensity = Math.min(1, p.pct / 100);
          const r = 239, g = Math.round(68 + (1 - intensity) * 150), b = Math.round(73 + (1 - intensity) * 100);
          const bg = `rgba(${r}, ${g}, ${b}, ${0.2 + intensity * 0.8})`;
          return `
            <div class="heatmap-cell" style="background: ${bg}; border-color: rgba(${r},${g},${b},0.4)">
              <div class="heatmap-cell__count">${p.timesAgotado}x</div>
              <div class="heatmap-cell__name">${escapeHtml(p.name)}</div>
              <div class="heatmap-cell__id">${escapeHtml(p.id)}</div>
              <div class="heatmap-cell__pct">${p.pct}% de los análisis</div>
            </div>`;
        }).join('')}
      </div>
    `;
  }
  modal.hidden = false;
}

// ─── Predicción de demanda (regresión lineal simple) ───
function linearRegression(points) {
  // points: [{ x, y }] — devuelve { slope, intercept, r2 }
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: 0, r2: 0 };
  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const meanX = sumX / n;
  const meanY = sumY / n;
  let num = 0, denX = 0, denY = 0;
  for (const p of points) {
    num += (p.x - meanX) * (p.y - meanY);
    denX += (p.x - meanX) ** 2;
    denY += (p.y - meanY) ** 2;
  }
  const slope = denX === 0 ? 0 : num / denX;
  const intercept = meanY - slope * meanX;
  const r2 = (denX === 0 || denY === 0) ? 0 : (num * num) / (denX * denY);
  return { slope, intercept, r2 };
}

function showPredictionModal(repo) {
  const snapshots = loadInventorySnapshots(repo);
  let modal = $('#prediction-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'prediction-modal';
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal__backdrop" data-close></div>
      <div class="modal__panel">
        <div class="modal__header">
          <h2 class="modal__title">🔮 Predicción de demanda</h2>
          <button class="icon-btn icon-btn--ghost" data-close>×</button>
        </div>
        <div class="modal__body" id="prediction-modal-body"></div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => {
      if (e.target.matches('[data-close]') || e.target.closest('[data-close]')) {
        modal.hidden = true;
      }
    });
  }
  const body = $('#prediction-modal-body');
  if (snapshots.length < 3) {
    body.innerHTML = `
      <div class="inv-empty">
        <div class="inv-empty__icon">🔮</div>
        <div class="inv-empty__text">
          Necesitas al menos 3 análisis para predecir demanda.<br>
          Ahora tienes ${snapshots.length}.<br>
          La predicción mejora con más datos históricos.
        </div>
      </div>`;
    modal.hidden = false;
    return;
  }
  // Para cada producto del último snapshot, mirar su stock en snapshots anteriores
  const lastSnap = snapshots[snapshots.length - 1];
  const allProducts = [
    ...(lastSnap.disponibles || []),
    ...(lastSnap.stockBajo || []),
    ...(lastSnap.agotados || []),
  ];
  // Map id → [{ x: ts, y: stock }] buscando en cada snapshot
  const series = new Map();
  for (const snap of snapshots) {
    const items = [...(snap.disponibles || []), ...(snap.stockBajo || []), ...(snap.agotados || [])];
    for (const p of items) {
      const key = String(p.id);
      if (!series.has(key)) series.set(key, []);
      const stock = typeof p.stock === 'number' ? p.stock : null;
      if (stock != null) {
        series.get(key).push({ x: snap.ts, y: stock, date: snap.date });
      }
    }
  }
  // Calcular predicción: cuántos días hasta stock=0
  const predictions = [];
  const now = Date.now();
  const DAY_MS = 86400000;
  for (const [id, points] of series) {
    if (points.length < 2) continue;
    const lastPoint = points[points.length - 1];
    if (lastPoint.y === 0) continue; // ya agotado
    // Normalizar x a días desde primer punto
    const x0 = points[0].x;
    const normPoints = points.map(p => ({ x: (p.x - x0) / DAY_MS, y: p.y }));
    const { slope, intercept, r2 } = linearRegression(normPoints);
    if (slope >= 0) continue; // no está bajando
    // stock = intercept + slope * x => x_when_zero = -intercept / slope
    const xWhenZero = -intercept / slope; // en días desde x0
    const daysFromNow = xWhenZero - (now - x0) / DAY_MS;
    if (daysFromNow <= 0 || daysFromNow > 365) continue;
    const product = allProducts.find(p => String(p.id) === id);
    predictions.push({
      id,
      name: product?.name || id,
      currentStock: lastPoint.y,
      slope: slope.toFixed(2), // unidades/día
      daysUntilEmpty: Math.round(daysFromNow),
      confidence: r2,
      estimatedDate: new Date(now + daysFromNow * DAY_MS).toISOString().slice(0, 10),
    });
  }
  predictions.sort((a, b) => a.daysUntilEmpty - b.daysUntilEmpty);
  if (!predictions.length) {
    body.innerHTML = `<div class="inv-empty"><div class="inv-empty__icon">📈</div><div class="inv-empty__text">Sin productos con tendencia a agotarse en los próximos 365 días.</div></div>`;
  } else {
    body.innerHTML = `
      <p style="color:var(--text-secondary);font-size:13px;margin:0 0 var(--s-3);line-height:1.6">
        Productos que se agotarán pronto según tendencia de stock (basado en ${snapshots.length} análisis).
        Confianza = R² del ajuste lineal (más cerca de 1 = más confiable).
      </p>
      <div class="inv-section">
        <table class="inv-table">
          <thead><tr><th>Producto</th><th>Stock actual</th><th>Tendencia</th><th>Días hasta agotar</th><th>Fecha estimada</th><th>Confianza</th></tr></thead>
          <tbody>
            ${predictions.slice(0, 30).map(p => {
              const urgency = p.daysUntilEmpty < 7 ? 'zero' : p.daysUntilEmpty < 30 ? 'low' : 'ok';
              const conf = p.confidence > 0.7 ? 'ok' : p.confidence > 0.4 ? 'low' : 'zero';
              return `
                <tr>
                  <td>${escapeHtml(p.id)}<br><small style="color:var(--text-muted)">${escapeHtml(p.name)}</small></td>
                  <td class="inv-stock inv-stock--ok">${p.currentStock}</td>
                  <td class="inv-diff inv-diff--down">${p.slope}/día</td>
                  <td class="inv-stock inv-stock--${urgency}">${p.daysUntilEmpty}d</td>
                  <td style="font-family:var(--font-mono);font-size:11px">${p.estimatedDate}</td>
                  <td class="inv-stock inv-stock--${conf}">${(p.confidence * 100).toFixed(0)}%</td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }
  modal.hidden = false;
}

function exportInventoryCSV(report, onlySection = null) {
  const sections = onlySection
    ? [{ name: onlySection, items: report[onlySection] || [] }]
    : [
        { name: 'agotados', items: report.agotados || [] },
        { name: 'stockBajo', items: report.stockBajo || [] },
        { name: 'disponibles', items: report.disponibles || [] },
      ];

  const hasPrice = !!report.fields?.price;
  const headers = ['categoria', 'id', 'nombre', 'stock'];
  if (hasPrice) headers.push('precio');

  const rows = [headers.join(',')];
  for (const sec of sections) {
    for (const p of sec.items) {
      const row = [
        sec.name,
        `"${String(p.id || '').replace(/"/g, '""')}"`,
        `"${String(p.name || '').replace(/"/g, '""')}"`,
        p.stock ?? '',
      ];
      if (hasPrice) row.push(p.price ?? '');
      rows.push(row.join(','));
    }
  }

  const csv = '\uFEFF' + rows.join('\n'); // BOM para Excel
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const date = new Date().toISOString().slice(0, 10);
  a.download = `inventario-${report.repo.replace('/', '-')}-${date}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  toast('CSV exportado', '📊');
}

// ─── PWA Notifications ───
async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    console.log('[notif] navegador no soporta notificaciones');
    return false;
  }
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

async function showNotification(title, body, opts = {}) {
  const granted = await requestNotificationPermission();
  if (!granted) {
    // Fallback: toast in-app
    toast(`${title}: ${body}`, opts.icon || '🔔');
    return;
  }
  try {
    const notif = new Notification(title, {
      body,
      icon: './icon-192.png',
      badge: './icon-192.png',
      tag: opts.tag || 'agent-brain',
      renotify: opts.renotify || false,
      data: opts.data || {},
    });
    notif.onclick = () => {
      window.focus();
      notif.close();
      if (opts.onClick) opts.onClick();
    };
  } catch (err) {
    console.warn('[notif] error mostrando notificación:', err.message);
    toast(`${title}: ${body}`, opts.icon || '🔔');
  }
}

// Notificar cuando un análisis de inventario detecta productos agotados
async function notifyInventoryAlerts(report) {
  if (!report) return;
  const agotados = report.agotados?.length || 0;
  const nuevos = report.nuevos?.length || 0;
  const stockBajo = report.stockBajo?.length || 0;

  if (agotados > 0) {
    await showNotification(
      `🔴 ${agotados} producto${agotados > 1 ? 's' : ''} agotado${agotados > 1 ? 's' : ''}`,
      `En ${report.repo || 'tu repo'}: ${report.agotados.slice(0, 3).map(p => p.name).join(', ')}${agotados > 3 ? '...' : ''}`,
      { icon: '🔴', tag: 'inv-agotados', renotify: true }
    );
  }
  if (nuevos > 0) {
    await showNotification(
      `✨ ${nuevos} producto${nuevos > 1 ? 's' : ''} nuevo${nuevos > 1 ? 's' : ''}`,
      `Detectado${nuevos > 1 ? 's' : ''} en ${report.labelB || report.repo || 'tu repo'}`,
      { icon: '✨', tag: 'inv-nuevos', renotify: true }
    );
  }
  if (stockBajo > 0 && agotados === 0) {
    await showNotification(
      `⚠️ ${stockBajo} producto${stockBajo > 1 ? 's' : ''} con stock bajo`,
      `En ${report.repo || 'tu repo'}: stock < 5 unidades`,
      { icon: '⚠️', tag: 'inv-stockbajo' }
    );
  }
}

// Hook: llamar notifyInventoryAlerts después de cada análisis
const _originalRenderSingle = renderSingleRepoReport;
renderSingleRepoReport = function(report) {
  _originalRenderSingle.call(this, report);
  notifyInventoryAlerts(report);
};
const _originalRenderCompare = renderInventoryReport;
renderInventoryReport = function(report) {
  _originalRenderCompare.call(this, report);
  notifyInventoryAlerts(report);
};

init().catch(err => {
  console.error('init failed:', err);
  $('#hero-subtitle').textContent = 'Error al cargar.';
});

window.__agentBrain = { DEMO, state, loadAll };
