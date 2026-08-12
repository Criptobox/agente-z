// dashboard/background-runner.js
// Sistema de tareas en background.
// Todo se ejecuta en 2do plano. Las respuestas aparecen dentro de la app.
//
// Flujo:
//   1. Usuario pide algo (chat, analizar repo, comparar inventario)
//   2. Se crea una BackgroundTask con estado "running"
//   3. Se dispatcha al backend (Edge Function, GitHub Action, o mock)
//   4. Se hace polling del resultado cada N segundos
//   5. Cuando termina, se muestra la respuesta inline en el chat o en la vista activa
//   6. Si hay error, se muestra inline también

(function() {
  'use strict';

  // ─── Estado de tareas en background ───
  const tasks = new Map(); // taskId → { id, type, status, progress, result, error, startedAt, completedAt }
  const pollers = new Map(); // taskId → intervalId
  const listeners = new Map(); // taskId → [callbacks]

  const STORAGE_KEY = 'agent-brain-bg-tasks';

  // ─── Persistir tareas en localStorage ───
  function saveTasks() {
    const serializable = {};
    for (const [id, task] of tasks) {
      serializable[id] = task;
    }
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable)); } catch {}
  }

  function loadTasks() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      for (const [id, task] of Object.entries(saved)) {
        // Si una tarea estaba "running" al cerrar, marcarla como "interrupted"
        if (task.status === 'running') {
          task.status = 'interrupted';
          task.error = 'La sesión se cerró mientras la tarea estaba en curso';
        }
        tasks.set(id, task);
      }
    } catch {}
  }

  // ─── Crear una tarea en background ───
  function createTask(type, description, payload) {
    const id = 'bg-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    const task = {
      id,
      type,            // 'chat', 'analyze-repo', 'inventory', 'create-task', 'custom'
      description,     // texto humano: "Analizando repo facebook/react..."
      status: 'running', // 'running', 'completed', 'error', 'interrupted'
      progress: 0,     // 0-100
      result: null,    // resultado cuando termina
      error: null,     // error si falla
      startedAt: Date.now(),
      completedAt: null,
      payload,         // datos originales de la petición
    };
    tasks.set(id, task);
    saveTasks();
    notifyListeners(id, task);
    updateNotificationCenter();
    return id;
  }

  // ─── Actualizar una tarea ───
  function updateTask(id, updates) {
    const task = tasks.get(id);
    if (!task) return;
    Object.assign(task, updates);
    if (updates.status === 'completed' || updates.status === 'error') {
      task.completedAt = Date.now();
      // Detener polling
      if (pollers.has(id)) {
        clearInterval(pollers.get(id));
        pollers.delete(id);
      }
    }
    saveTasks();
    notifyListeners(id, task);
    updateNotificationCenter();
  }

  // ─── Notificación a listeners ───
  function notifyListeners(id, task) {
    const cbs = listeners.get(id);
    if (cbs) cbs.forEach(cb => cb(task));
  }

  function onTaskUpdate(id, callback) {
    if (!listeners.has(id)) listeners.set(id, []);
    listeners.get(id).push(callback);
    // Si la tarea ya existe, notificar inmediatamente
    const task = tasks.get(id);
    if (task) callback(task);
  }

  // ─── Ejecutar tarea con mock (modo demo o sin backend) ───
  // ─── Chat con IA real (sin backend, directo a la API del provider) ───
  async function executeLLMChat(id, payload) {
    try {
      updateTask(id, { progress: 20, description: 'Pensando…' });

      const provider = localStorage.getItem('llm-provider') || 'groq';
      const model = localStorage.getItem('llm-model') || (window.__defaultModelFor ? window.__defaultModelFor(provider) : 'llama-3.1-70b-versatile');
      const apiKey = localStorage.getItem('llm-api-key') || '';
      const fallbackProvider = localStorage.getItem('llm-fallback-provider') || '';

      if (!apiKey) {
        updateTask(id, { status: 'error', error: 'Configura tu API key en Settings antes de chatear.' });
        return;
      }

      // Construir messages: system prompt + historial + mensaje actual
      const systemPrompt = 'Eres el asistente conversacional de agent-brain, un sistema multi-agente en GitHub. Respondes preguntas del usuario sobre su sistema en lenguaje natural.\n\n## REGLAS\n- Responde en texto markdown natural, NO JSON.\n- Sé honesto: si no sabes algo, dilo.\n- Sé conciso: máx 3 párrafos. El usuario lee desde móvil.\n- Si la pregunta requiere crear una tarea, sugiérelo pero NO la crees.\n- Cita IDs concretos (TASK-XXXX, BUG-XXXX, LESSON-XXXX) cuando sea relevante.';

      const history = (payload.history || []).map(h => ({
        role: h.role || 'user',
        content: h.content,
      }));

      const messages = [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: payload.message || '' },
      ];

      updateTask(id, { progress: 50, description: 'Generando respuesta…' });

      let fullText = '';

      // Intentar provider primario
      try {
        fullText = await streamChat({ provider, model, apiKey, messages });
      } catch (primaryErr) {
        // Si hay fallback configurado, intentarlo
        if (fallbackProvider) {
          updateTask(id, { progress: 70, description: `Provider primario falló (${primaryErr.message}). Probando fallback ${fallbackProvider}…` });
          const fallbackModel = window.__defaultModelFor ? window.__defaultModelFor(fallbackProvider) : 'llama-3.1-70b-versatile';
          const fallbackKey = localStorage.getItem('llm-fallback-api-key') || apiKey;
          fullText = await streamChat({ provider: fallbackProvider, model: fallbackModel, apiKey: fallbackKey, messages });
        } else {
          throw primaryErr;
        }
      }

      updateTask(id, {
        status: 'completed',
        progress: 100,
        result: {
          agent: 'chat',
          text: fullText || '(sin respuesta)',
        },
      });
    } catch (err) {
      updateTask(id, { status: 'error', error: err.message || 'Error desconocido en el chat' });
    }
  }

  // Helper: llama a window.streaming.stream() y devuelve el texto completo
  function streamChat({ provider, model, apiKey, messages }) {
    return new Promise((resolve, reject) => {
      let buffer = '';
      window.streaming.stream(
        messages,
        { provider, model, apiKey, stream: true, temperature: 0.4, maxTokens: 1024 },
        (token) => { buffer += token; },        // onToken
        (full) => { resolve(full || buffer); },  // onDone
        (err) => { reject(err); },               // onError
      );
    });
  }

  function executeMock(id, type, payload) {
    const steps = getMockSteps(type, payload);
    let stepIdx = 0;
    const interval = setInterval(() => {
      if (stepIdx >= steps.length) {
        clearInterval(interval);
        const result = getMockResult(type, payload);
        updateTask(id, { status: 'completed', progress: 100, result });
        return;
      }
      const step = steps[stepIdx];
      updateTask(id, { progress: step.progress, description: step.description });
      stepIdx++;
    }, 800);
  }

  function getMockSteps(type, payload) {
    if (type === 'chat') {
      return [
        { progress: 20, description: 'Pensando...' },
        { progress: 50, description: 'Buscando en memoria...' },
        { progress: 80, description: 'Generando respuesta...' },
      ];
    }
    if (type === 'analyze-repo') {
      return [
        { progress: 15, description: 'Listando archivos del repo...' },
        { progress: 35, description: 'Leyendo código fuente...' },
        { progress: 60, description: 'Buscando bugs y antipatrones...' },
        { progress: 85, description: 'Generando reporte...' },
      ];
    }
    if (type === 'inventory') {
      return [
        { progress: 25, description: 'Buscando archivo de productos...' },
        { progress: 55, description: 'Parseando productos...' },
        { progress: 80, description: 'Clasificando agotados/nuevos...' },
      ];
    }
    if (type === 'create-task') {
      return [
        { progress: 30, description: 'Creando Definition of Done...' },
        { progress: 70, description: 'Despachando agente...' },
      ];
    }
    return [{ progress: 50, description: 'Procesando...' }];
  }

  function getMockResult(type, payload) {
    if (type === 'chat') {
      const q = (payload?.message || '').toLowerCase();
      if (q.includes('stuck')) {
        return {
          agent: 'chat',
          text: 'Tienes **1 tarea stuck**:\n\n• **TASK-0041** — Refactorizar calculateTotal\n  Intento 5/5. Gate G3 fallando.\n\n¿Quieres que cree una tarea para que `research` investigue?',
          actionCards: [{ label: 'Crear tarea', action: 'create', style: 'primary' }, { label: 'Ver detalle', action: 'detail', style: 'secondary' }],
        };
      }
      if (q.includes('cuota') || q.includes('budget')) {
        return { agent: 'budget', text: '📊 **Budget de hoy:**\n\n• Tokens: 45k/120k (38%)\n• Minutos: 12/180 (7%)\n• Estado: ✅ OK' };
      }
      if (q.includes('diario')) {
        return { agent: 'diarist', text: '📅 **Último diario:**\n\n"Arreglado bug del carrito. 1 lección nueva sobre NaN."\n\n• TASK-0042 cerrada\n• Devil bloqueó por falta de gate G3\n• Sin tareas STUCK' };
      }
      return { agent: 'chat', text: 'Recibí tu mensaje. Estoy procesándolo en background. Cuando tenga una respuesta completa, aparecerá aquí.' };
    }
    if (type === 'analyze-repo') {
      return {
        agent: 'analyst',
        text: '🔍 **Análisis de ' + (payload?.repo || 'repo') + ' completado:**\n\n🔴 **2 bugs encontrados:**\n• `calculateTotal` — NaN al eliminar producto (cart.js:42)\n• `checkout` — Redirige a /404 (auth.js:15)\n\n✨ **3 mejoras sugeridas:**\n• Añadir try/catch en `fetch`\n• Migrar a async/await\n• Añadir tests E2E',
        actionCards: [{ label: 'Ver reporte completo', action: 'view-report', style: 'primary' }, { label: 'Crear tareas', action: 'create-tasks', style: 'secondary' }],
      };
    }
    if (type === 'inventory') {
      return {
        agent: 'inventory',
        text: '📦 **Inventario de ' + (payload?.repo || 'repo') + ':**\n\n• Total: 15 productos\n• 🔴 Agotados: 4\n• ⚠️ Stock bajo: 3\n• ✅ Disponibles: 8\n\nValor total: $5,300',
        actionCards: [{ label: 'Ver inventario', action: 'view-inventory', style: 'primary' }],
      };
    }
    return { agent: 'orchestrator', text: 'Tarea completada.' };
  }

  // ─── Ejecutar tarea real (Edge Function o GitHub Action) ───
  async function executeReal(id, type, payload) {
    try {
      const edgeUrl = localStorage.getItem('agent-brain-edge-function-url');
      const ghToken = localStorage.getItem('agent-brain-pat');
      // BUGFIX (audit #1.11): tautological lookup. Fall back to TARGET_REPOS var.
      const ghRepo = localStorage.getItem('agent-brain-repo') || localStorage.getItem('agent-brain-target-repos');

      if (edgeUrl) {
        // Edge Function de Supabase
        updateTask(id, { progress: 30, description: 'Enviando a Edge Function...' });
        const res = await fetch(edgeUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: payload.message || payload.description,
            type,
            payload,
            history: payload.history || [],
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        updateTask(id, { status: 'completed', progress: 100, result: data });
      } else if (ghToken && ghRepo) {
        // GitHub Actions dispatch
        updateTask(id, { progress: 40, description: 'Despachando workflow...' });
        await fetch(`https://api.github.com/repos/${ghRepo}/dispatches`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${ghToken}`, 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event_type: type === 'chat' ? 'chat' : 'agent_run',
            client_payload: { message: payload.message, type, payload: JSON.stringify(payload), task_id: id },
          }),
        });
        // Polling: buscar el resultado en los Issues
        updateTask(id, { progress: 60, description: 'Esperando respuesta del agente...' });
        startPolling(id, ghRepo, ghToken);
      } else if (type === 'chat' && window.streaming && typeof window.streaming.stream === 'function') {
        // Sin backend PERO hay IA configurada — usar streaming directo
        executeLLMChat(id, payload);
      } else {
        // Sin backend ni IA — usar mock
        executeMock(id, type, payload);
      }
    } catch (err) {
      updateTask(id, { status: 'error', error: err.message });
    }
  }

  // ─── Polling de Issues de GitHub ───
  function startPolling(taskId, repo, token) {
    let attempts = 0;
    const maxAttempts = 30; // 5 minutos máximo (10s × 30)
    const interval = setInterval(async () => {
      attempts++;
      if (attempts > maxAttempts) {
        clearInterval(interval);
        updateTask(taskId, { status: 'error', error: 'Timeout: el agente tardó demasiado en responder' });
        return;
      }
      try {
        // Buscar comentarios recientes en Issues con label agent-task o chat
        const res = await fetch(
          `https://api.github.com/repos/${repo}/issues/comments?sort=created&direction=desc&per_page=5`,
          { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github+json' } }
        );
        if (!res.ok) return;
        const comments = await res.json();
        // Buscar comentario que mencione el taskId
        const found = comments.find(c => c.body && c.body.includes(taskId));
        if (found) {
          clearInterval(interval);
          updateTask(taskId, {
            status: 'completed',
            progress: 100,
            result: {
              agent: 'agent',
              text: found.body.replace(`[${taskId}]`, '').trim(),
              commentUrl: found.html_url,
            }
          });
        } else {
          updateTask(taskId, { progress: Math.min(90, 60 + attempts * 3), description: `Esperando respuesta... (${attempts}/${maxAttempts})` });
        }
      } catch {}
    }, 10000); // cada 10 segundos
    pollers.set(taskId, interval);
  }

  // ─── API pública ───
  const bgRunner = {
    init() {
      loadTasks();
      updateNotificationCenter();
    },

    // Ejecutar una tarea en background
    run(type, description, payload = {}) {
      const id = createTask(type, description, payload);
      // Decidir si usar mock o real
      const demoMode = new URLSearchParams(location.search).get('demo') === '1';
      if (demoMode) {
        executeMock(id, type, payload);
      } else {
        executeReal(id, type, payload);
      }
      return id;
    },

    // Suscribirse a updates de una tarea
    on(id, callback) {
      onTaskUpdate(id, callback);
    },

    // Obtener tarea
    get(id) {
      return tasks.get(id);
    },

    // Obtener todas las tareas
    getAll() {
      return Array.from(tasks.values()).sort((a, b) => b.startedAt - a.startedAt);
    },

    // Tareas activas
    getActive() {
      return Array.from(tasks.values()).filter(t => t.status === 'running');
    },

    // Cancelar tarea
    cancel(id) {
      if (pollers.has(id)) {
        clearInterval(pollers.get(id));
        pollers.delete(id);
      }
      updateTask(id, { status: 'error', error: 'Cancelada por el usuario' });
    },

    // Limpiar tareas completadas
    clear() {
      for (const [id, task] of tasks) {
        if (task.status !== 'running') tasks.delete(id);
      }
      saveTasks();
      updateNotificationCenter();
    },
  };

  // ─── Notification Center (campana en el topbar) ───
  function updateNotificationCenter() {
    const active = bgRunner.getActive();
    const completed = bgRunner.getAll().filter(t => t.status === 'completed' && !t.seen);
    const errored = bgRunner.getAll().filter(t => t.status === 'error' && !t.seen);

    let bell = document.getElementById('notif-bell');
    if (!bell) {
      // Crear campana en el topbar
      const actions = document.querySelector('.topbar__actions');
      if (!actions) return;
      bell = document.createElement('button');
      bell.className = 'icon-btn icon-btn--ghost';
      bell.id = 'notif-bell';
      bell.style.position = 'relative';
      bell.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
        <span class="notif-badge" id="notif-badge" hidden></span>
      `;
      actions.insertBefore(bell, actions.firstChild);
      bell.addEventListener('click', toggleNotificationPanel);
    }

    const totalUnseen = completed.length + errored.length;
    const badge = document.getElementById('notif-badge');
    if (badge) {
      badge.hidden = totalUnseen === 0 && active.length === 0;
      badge.textContent = totalUnseen > 0 ? totalUnseen : (active.length > 0 ? active.length : '');
      badge.className = 'notif-badge' + (active.length > 0 ? ' notif-badge--active' : '');
    }
  }

  function toggleNotificationPanel() {
    let panel = document.getElementById('notif-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'notif-panel';
      panel.className = 'notif-panel';
      document.body.appendChild(panel);
      panel.addEventListener('click', (e) => {
        if (e.target === panel) panel.hidden = true;
      });
    }
    if (panel.hidden === false) {
      panel.hidden = true;
      return;
    }

    const allTasks = bgRunner.getAll();
    const active = allTasks.filter(t => t.status === 'running');
    const done = allTasks.filter(t => t.status === 'completed').slice(0, 10);
    const errors = allTasks.filter(t => t.status === 'error').slice(0, 5);

    panel.innerHTML = `
      <div class="notif-panel__header">
        <h3>🔔 Notificaciones</h3>
        <button class="btn btn--ghost" id="notif-clear" style="font-size:11px;padding:4px 10px">Limpiar</button>
      </div>
      <div class="notif-panel__body">
        ${active.length ? `
          <div class="notif-section">
            <div class="notif-section__title">⏳ En curso (${active.length})</div>
            ${active.map(t => `
              <div class="notif-item notif-item--active" data-task-id="${t.id}">
                <div class="notif-item__icon">${getTaskIcon(t.type)}</div>
                <div class="notif-item__body">
                  <div class="notif-item__title">${t.description}</div>
                  <div class="notif-item__progress">
                    <div class="notif-progress"><div class="notif-progress__fill" style="width:${t.progress}%"></div></div>
                    <span>${t.progress}%</span>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        ` : ''}
        ${done.length ? `
          <div class="notif-section">
            <div class="notif-section__title">✅ Completadas (${done.length})</div>
            ${done.map(t => `
              <div class="notif-item notif-item--done" data-task-id="${t.id}">
                <div class="notif-item__icon">${getTaskIcon(t.type)}</div>
                <div class="notif-item__body">
                  <div class="notif-item__title">${t.description}</div>
                  <div class="notif-item__meta">${formatTime(t.completedAt)} · ${t.result?.agent || ''}</div>
                </div>
                <button class="notif-item__view" data-view-task="${t.id}">Ver</button>
              </div>
            `).join('')}
          </div>
        ` : ''}
        ${errors.length ? `
          <div class="notif-section">
            <div class="notif-section__title">❌ Errores (${errors.length})</div>
            ${errors.map(t => `
              <div class="notif-item notif-item--error" data-task-id="${t.id}">
                <div class="notif-item__icon">❌</div>
                <div class="notif-item__body">
                  <div class="notif-item__title">${t.description}</div>
                  <div class="notif-item__meta">${t.error}</div>
                </div>
              </div>
            `).join('')}
          </div>
        ` : ''}
        ${!active.length && !done.length && !errors.length ? `
          <div class="notif-empty">Sin notificaciones</div>
        ` : ''}
      </div>
    `;

    // Marcar como vistas
    for (const t of allTasks) {
      if (t.status !== 'running' && !t.seen) {
        const task = tasks.get(t.id);
        if (task) { task.seen = true; }
      }
    }
    saveTasks();
    updateNotificationCenter();

    // Listeners
    panel.querySelectorAll('[data-view-task]').forEach(btn => {
      btn.addEventListener('click', () => {
        const taskId = btn.dataset.viewTask;
        const task = bgRunner.get(taskId);
        if (task && task.result) {
          // Mostrar resultado en el chat
          if (window.addChatMessage) {
            window.addChatMessage('assistant', task.result.text || JSON.stringify(task.result), task.result.agent, task.result.actionCards);
          }
          // Ir a chat
          if (window.switchView) window.switchView('chat');
        }
        panel.hidden = true;
      });
    });

    document.getElementById('notif-clear')?.addEventListener('click', () => {
      bgRunner.clear();
      panel.innerHTML = '<div class="notif-empty">Sin notificaciones</div>';
      updateNotificationCenter();
    });

    panel.hidden = false;
  }

  function getTaskIcon(type) {
    const icons = { chat: '💬', 'analyze-repo': '🔍', inventory: '📦', 'create-task': '📋', custom: '⚙️' };
    return icons[type] || '⚙️';
  }

  function formatTime(ts) {
    if (!ts) return '';
    const diff = Date.now() - ts;
    const min = Math.floor(diff / 60000);
    if (min < 1) return 'ahora';
    if (min < 60) return `${min}m`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h`;
    return `${Math.floor(hr / 24)}d`;
  }

  // Exponer globalmente
  window.bgRunner = bgRunner;

  // Inicializar al cargar
  document.addEventListener('DOMContentLoaded', () => bgRunner.init());
})();
