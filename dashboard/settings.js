// dashboard/settings.js
// Página de Settings completa: API keys, toggles, conexiones, perfil.
// Se carga como script global (no module).

(function() {
  'use strict';

  function renderSettings() {
    const content = document.getElementById('content');
    if (!content) return;
    const existing = document.getElementById('view-settings');
    if (existing) return; // ya renderizado

    const settingsSection = document.createElement('section');
    // BUGFIX (audit #1.1): include is-active so the section is visible when created.
    // switchView() now calls renderSettings() BEFORE the toggle, so we must start visible.
    settingsSection.className = 'view is-active';
    settingsSection.id = 'view-settings';
    settingsSection.innerHTML = `
      <div class="view__header">
        <h2 class="view__title">⚙️ Settings</h2>
        <span class="view__meta">configuración del sistema</span>
      </div>

      <!-- LLM Providers -->
      <div class="panel" style="margin-bottom: var(--s-4)">
        <div class="panel__header"><h3 class="panel__title">🤖 Modelos de IA</h3></div>
        <div class="panel__body">
          <div class="form-grid">
            <div class="field">
              <label class="field__label">Provider primario</label>
              <select class="field__input" id="set-llm-provider">
                <option value="groq">Groq (gratis, ultra-rápido)</option>
                <option value="openrouter">OpenRouter (multi-modelo, con gratis)</option>
                <option value="deepseek">DeepSeek (barato, razonamiento fuerte)</option>
                <option value="gemini">Google Gemini (gratis)</option>
                <option value="openai">OpenAI (pago)</option>
                <option value="anthropic">Anthropic (pago)</option>
                <option value="github">GitHub Models (gratis)</option>
              </select>
            </div>
            <div class="field">
              <label class="field__label">Modelo</label>
              <input class="field__input" type="text" id="set-llm-model" placeholder="llama-3.1-70b-versatile" value="llama-3.1-70b-versatile">
              <small class="field__hint" id="set-llm-model-hint" style="display:block;margin-top:4px;color:var(--c-text-muted);font-size:0.85em"></small>
            </div>
            <div class="field">
              <label class="field__label">API Key</label>
              <input class="field__input" type="password" id="set-llm-key" placeholder="gsk_xxx...">
            </div>
            <div class="field">
              <label class="field__label">Provider fallback (opcional)</label>
              <select class="field__input" id="set-fallback-provider">
                <option value="">(ninguno)</option>
                <option value="groq">Groq</option>
                <option value="openrouter">OpenRouter</option>
                <option value="deepseek">DeepSeek</option>
                <option value="gemini">Google Gemini</option>
                <option value="github">GitHub Models</option>
              </select>
            </div>
          </div>
          <div style="display:flex;gap:var(--s-2);margin-top:var(--s-3)">
            <button class="btn btn--primary" id="set-llm-save">💾 Guardar</button>
            <button class="btn btn--analyze" id="set-llm-test">🔍 Probar conexión</button>
          </div>
          <div id="set-llm-result" style="margin-top:var(--s-3)"></div>
        </div>
      </div>

      <!-- Backend -->
      <div class="panel" style="margin-bottom: var(--s-4)">
        <div class="panel__header"><h3 class="panel__title">🗄️ Backend</h3></div>
        <div class="panel__body">
          <div class="form-grid">
            <div class="field">
              <label class="field__label">Supabase URL</label>
              <input class="field__input" type="text" id="set-supabase-url" placeholder="https://xxx.supabase.co">
            </div>
            <div class="field">
              <label class="field__label">Supabase Anon Key</label>
              <input class="field__input" type="password" id="set-supabase-key" placeholder="eyJxxx...">
            </div>
            <div class="field">
              <label class="field__label">Edge Function URL (chat)</label>
              <input class="field__input" type="text" id="set-edge-url" placeholder="https://xxx.functions.supabase.co/chat-router">
            </div>
          </div>
          <div style="margin-top:var(--s-3)">
            <label class="settings-toggle">
              <input type="checkbox" id="set-github-sync">
              <span class="settings-toggle__slider"></span>
              <span class="settings-toggle__label">Sincronizar memorias con GitHub</span>
            </label>
            <label class="settings-toggle">
              <input type="checkbox" id="set-create-issues">
              <span class="settings-toggle__slider"></span>
              <span class="settings-toggle__label">Crear Issues desde chat</span>
            </label>
            <label class="settings-toggle">
              <input type="checkbox" id="set-execute-workflows">
              <span class="settings-toggle__slider"></span>
              <span class="settings-toggle__label">Ejecutar workflows de Actions</span>
            </label>
          </div>
          <button class="btn btn--primary" id="set-backend-save" style="margin-top:var(--s-3)">💾 Guardar backend</button>
        </div>
      </div>

      <!-- Conexiones -->
      <div class="panel" style="margin-bottom: var(--s-4)">
        <div class="panel__header"><h3 class="panel__title">🔌 Conexiones</h3></div>
        <div class="panel__body">
          <div class="connections-grid">
            <div class="connection-card" id="conn-github">
              <div class="connection-card__icon">🐙</div>
              <div class="connection-card__body">
                <div class="connection-card__name">GitHub</div>
                <div class="connection-card__status" id="conn-github-status">No conectado</div>
              </div>
              <button class="btn btn--ghost" id="conn-github-btn">Conectar</button>
            </div>
            <div class="connection-card" id="conn-slack">
              <div class="connection-card__icon">💬</div>
              <div class="connection-card__body">
                <div class="connection-card__name">Slack</div>
                <div class="connection-card__status" id="conn-slack-status">No conectado</div>
              </div>
              <button class="btn btn--ghost" id="conn-slack-btn">Conectar</button>
            </div>
            <div class="connection-card" id="conn-discord">
              <div class="connection-card__icon">🎮</div>
              <div class="connection-card__body">
                <div class="connection-card__name">Discord</div>
                <div class="connection-card__status" id="conn-discord-status">No conectado</div>
              </div>
              <button class="btn btn--ghost" id="conn-discord-btn">Conectar</button>
            </div>
            <div class="connection-card" id="conn-shopify">
              <div class="connection-card__icon">🛒</div>
              <div class="connection-card__body">
                <div class="connection-card__name">Shopify</div>
                <div class="connection-card__status" id="conn-shopify-status">No conectado</div>
              </div>
              <button class="btn btn--ghost" id="conn-shopify-btn">Conectar</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Perfil -->
      <div class="panel" style="margin-bottom: var(--s-4)">
        <div class="panel__header"><h3 class="panel__title">👤 Perfil</h3></div>
        <div class="panel__body">
          <div class="form-grid">
            <div class="field">
              <label class="field__label">Email</label>
              <input class="field__input" type="email" id="set-email" placeholder="tu@email.com">
            </div>
            <div class="field">
              <label class="field__label">Nombre</label>
              <input class="field__input" type="text" id="set-name" placeholder="Tu nombre">
            </div>
          </div>
          <div style="display:flex;gap:var(--s-2);margin-top:var(--s-3)">
            <button class="btn btn--primary" id="set-profile-save">💾 Guardar perfil</button>
            <button class="btn btn--ghost" id="set-export-memory">📤 Exportar memoria (JSON)</button>
          </div>
        </div>
      </div>

      <!-- Plugins -->
      <div class="panel">
        <div class="panel__header"><h3 class="panel__title">🧩 Plugins</h3></div>
        <div class="panel__body">
          <p style="color:var(--text-secondary);font-size:13px;margin:0 0 var(--s-3)">Herramientas custom que extienden las capacidades de los agentes.</p>
          <div id="plugins-list"></div>
          <button class="btn btn--analyze" id="set-add-plugin" style="margin-top:var(--s-3)">+ Añadir plugin</button>
        </div>
      </div>
    `;
    // Insertar antes del cierre de content
    content.appendChild(settingsSection);

    // Añadir nav item para Settings
    const nav = document.querySelector('.sidebar .nav');
    if (nav && !document.querySelector('[data-target=settings]')) {
      const divider = nav.querySelector('.nav__divider');
      const btn = document.createElement('button');
      btn.className = 'nav__item';
      btn.dataset.target = 'settings';
      btn.innerHTML = `
        <span class="nav__icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        </span>
        <span class="nav__label">Settings</span>
      `;
      if (divider) nav.insertBefore(btn, divider);
      else nav.appendChild(btn);
      btn.addEventListener('click', () => window.switchView && window.switchView('settings'));
    }

    // Cargar valores guardados
    loadSettingsValues();
    // Attach listeners
    attachSettingsListeners();
  }

  function loadSettingsValues() {
    const get = (k, d='') => localStorage.getItem(k) || d;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    const check = (id, v) => { const el = document.getElementById(id); if (el) el.checked = v === '1' || v === 'true'; };

    set('set-llm-provider', get('llm-provider', 'groq'));
    set('set-llm-model', get('llm-model', 'llama-3.1-70b-versatile'));
    set('set-llm-key', get('llm-api-key', ''));
    set('set-fallback-provider', get('llm-fallback-provider', ''));
    set('set-supabase-url', get('agent-brain-supabase-url', ''));
    set('set-supabase-key', get('agent-brain-supabase-anon-key', ''));
    set('set-edge-url', get('agent-brain-edge-function-url', ''));
    set('set-email', get('user-email', ''));
    set('set-name', get('user-name', ''));

    check('set-github-sync', get('github-sync', 'false'));
    check('set-create-issues', get('create-issues-from-chat', 'true'));
    check('set-execute-workflows', get('execute-workflows', 'true'));

    // Status de conexiones
    const ghToken = get('agent-brain-pat', '');
    const ghStatus = document.getElementById('conn-github-status');
    if (ghStatus) ghStatus.textContent = ghToken ? '✅ Conectado' : 'No conectado';
    if (ghStatus) ghStatus.className = ghToken ? 'connection-card__status connection-card__status--ok' : 'connection-card__status';

    const slack = get('slack-webhook', '');
    const slackStatus = document.getElementById('conn-slack-status');
    if (slackStatus) slackStatus.textContent = slack ? '✅ Conectado' : 'No conectado';
    if (slackStatus) slackStatus.className = slack ? 'connection-card__status connection-card__status--ok' : 'connection-card__status';

    const discord = get('discord-webhook', '');
    const discStatus = document.getElementById('conn-discord-status');
    if (discStatus) discStatus.textContent = discord ? '✅ Conectado' : 'No conectado';
    if (discStatus) discStatus.className = discord ? 'connection-card__status connection-card__status--ok' : 'connection-card__status';

    const shopify = get('shopify-token', '');
    const shopStatus = document.getElementById('conn-shopify-status');
    if (shopStatus) shopStatus.textContent = shopify ? '✅ Conectado' : 'No conectado';
    if (shopStatus) shopStatus.className = shopify ? 'connection-card__status connection-card__status--ok' : 'connection-card__status';
  }

  function attachSettingsListeners() {
    const save = (id, key, type='value') => {
      const el = document.getElementById(id);
      if (el) localStorage.setItem(key, type === 'checked' ? (el.checked ? 'true' : 'false') : el.value);
    };

    document.getElementById('set-llm-save')?.addEventListener('click', () => {
      save('set-llm-provider', 'llm-provider');
      save('set-llm-model', 'llm-model');
      save('set-llm-key', 'llm-api-key');
      save('set-fallback-provider', 'llm-fallback-provider');
      window.toast && window.toast('Configuración de IA guardada', '💾');
    });

    document.getElementById('set-llm-test')?.addEventListener('click', async () => {
      const provider = document.getElementById('set-llm-provider').value;
      const model = document.getElementById('set-llm-model').value.trim() || defaultModelFor(provider);
      const key = document.getElementById('set-llm-key').value.trim();
      const result = document.getElementById('set-llm-result');
      if (!key) { result.innerHTML = '<div class="info-banner" style="background:rgba(239,68,68,0.08);border-color:rgba(239,68,68,0.3)">⚠️ Falta API key</div>'; return; }
      result.innerHTML = '<div class="inv-loading"><div class="inv-loading__spinner"></div><div>Probando…</div></div>';
      try {
        const cfg = providerConfig(provider, model, key);
        const res = await fetch(cfg.endpoint, {
          method: 'POST',
          headers: cfg.headers,
          body: JSON.stringify(cfg.testBody),
        });
        if (res.ok) {
          result.innerHTML = '<div class="info-banner" style="background:rgba(16,185,129,0.08);border-color:rgba(16,185,129,0.3)">✅ Conexión exitosa con ' + provider + ' / ' + model + '</div>';
        } else {
          const txt = await res.text().catch(() => '');
          let errMsg = res.status + ' ' + res.statusText;
          try { const j = JSON.parse(txt); errMsg += ' — ' + (j.error?.message || j.message || '').slice(0, 200); } catch {}
          result.innerHTML = '<div class="info-banner" style="background:rgba(239,68,68,0.08);border-color:rgba(239,68,68,0.3)">❌ ' + errMsg + '</div>';
        }
      } catch (err) {
        result.innerHTML = '<div class="info-banner" style="background:rgba(239,68,68,0.08);border-color:rgba(239,68,68,0.3)">❌ ' + err.message + '</div>';
      }
    });

    // Actualiza placeholder + hint del modelo según provider
    function defaultModelFor(provider) {
      switch (provider) {
        case 'groq':       return 'llama-3.1-70b-versatile';
        case 'openrouter': return 'openai/gpt-4o-mini';
        case 'deepseek':   return 'deepseek-chat';
        case 'gemini':     return 'gemini-1.5-flash';
        case 'openai':     return 'gpt-4o-mini';
        case 'anthropic':  return 'claude-3-5-haiku-latest';
        case 'github':     return 'gpt-4o-mini';
        default:           return '';
      }
    }
    function hintFor(provider) {
      switch (provider) {
        case 'groq':       return 'Gratis en console.groq.com — 30 req/min. Modelo típico: llama-3.1-70b-versatile';
        case 'openrouter': return 'Multi-provider con tier gratis. Formato: "proveedor/modelo" ej: openai/gpt-4o-mini, deepseek/deepseek-chat, meta-llama/llama-3.1-8b-instruct';
        case 'deepseek':   return 'Barato y buen razonamiento. Modelos: deepseek-chat, deepseek-reasoner';
        case 'gemini':     return 'Gratis en ai.google.dev — 15 req/min. Modelos: gemini-1.5-flash, gemini-1.5-pro';
        case 'openai':     return 'Requiere pago. Modelos: gpt-4o-mini, gpt-4o, gpt-3.5-turbo';
        case 'anthropic':  return 'Requiere pago. Modelos: claude-3-5-haiku-latest, claude-3-5-sonnet-latest';
        case 'github':     return 'Gratis con token de GitHub. Modelos: gpt-4o-mini, Phi-3-mini-4k-instruct';
        default:           return '';
      }
    }
    function providerConfig(provider, model, key) {
      // Devuelve { endpoint, headers, chatBody(messages,opts), testBody, supportsStream }
      switch (provider) {
        case 'groq':
          return {
            endpoint: 'https://api.groq.com/openai/v1/chat/completions',
            headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
            chatBody: (m, o) => ({ model, messages: m, stream: !!o.stream, temperature: o.temperature ?? 0.4, max_tokens: o.maxTokens ?? 1024 }),
            testBody: { model, messages: [{ role: 'user', content: 'Responde solo "OK"' }], max_tokens: 5 },
            supportsStream: true,
          };
        case 'openrouter':
          return {
            endpoint: 'https://openrouter.ai/api/v1/chat/completions',
            headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json', 'HTTP-Referer': location.origin, 'X-Title': 'agent-brain' },
            chatBody: (m, o) => ({ model, messages: m, stream: !!o.stream, temperature: o.temperature ?? 0.4, max_tokens: o.maxTokens ?? 1024 }),
            testBody: { model, messages: [{ role: 'user', content: 'Responde solo "OK"' }], max_tokens: 5 },
            supportsStream: true,
          };
        case 'deepseek':
          return {
            endpoint: 'https://api.deepseek.com/v1/chat/completions',
            headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
            chatBody: (m, o) => ({ model, messages: m, stream: !!o.stream, temperature: o.temperature ?? 0.4, max_tokens: o.maxTokens ?? 1024 }),
            testBody: { model, messages: [{ role: 'user', content: 'Responde solo "OK"' }], max_tokens: 5 },
            supportsStream: true,
          };
        case 'gemini':
          return {
            endpoint: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
            headers: { 'Content-Type': 'application/json' },
            chatBody: (m, o) => ({
              contents: m.filter(x => x.role !== 'system').map(x => ({ role: x.role === 'assistant' ? 'model' : 'user', parts: [{ text: x.content }] })),
              systemInstruction: m.find(x => x.role === 'system') ? { parts: [{ text: m.find(x => x.role === 'system').content }] } : undefined,
              generationConfig: { temperature: o.temperature ?? 0.4, maxOutputTokens: o.maxTokens ?? 1024 },
            }),
            testBody: { contents: [{ parts: [{ text: 'Responde solo OK' }] }] },
            supportsStream: false,
          };
        case 'openai':
          return {
            endpoint: 'https://api.openai.com/v1/chat/completions',
            headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
            chatBody: (m, o) => ({ model, messages: m, stream: !!o.stream, temperature: o.temperature ?? 0.4, max_tokens: o.maxTokens ?? 1024 }),
            testBody: { model, messages: [{ role: 'user', content: 'Responde solo "OK"' }], max_tokens: 5 },
            supportsStream: true,
          };
        case 'anthropic':
          return {
            endpoint: 'https://api.anthropic.com/v1/messages',
            headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
            chatBody: (m, o) => ({
              model,
              system: m.find(x => x.role === 'system')?.content || undefined,
              messages: m.filter(x => x.role !== 'system').map(x => ({ role: x.role, content: x.content })),
              max_tokens: o.maxTokens ?? 1024,
              temperature: o.temperature ?? 0.4,
            }),
            testBody: {
              model, max_tokens: 5,
              messages: [{ role: 'user', content: 'Responde solo "OK"' }],
            },
            supportsStream: false,
          };
        case 'github':
          return {
            endpoint: 'https://models.inference.ai.azure.com/chat/completions',
            headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
            chatBody: (m, o) => ({ model, messages: m, temperature: o.temperature ?? 0.4, max_tokens: o.maxTokens ?? 1024 }),
            testBody: { model, messages: [{ role: 'user', content: 'Responde solo "OK"' }], max_tokens: 5 },
            supportsStream: false,
          };
        default:
          throw new Error('Provider no soportado: ' + provider);
      }
    }
    // Exportar para que streaming.js pueda usarlo
    window.__providerConfig = providerConfig;
    window.__defaultModelFor = defaultModelFor;

    // Cuando cambie el provider, actualizar placeholder + hint + modelo por defecto si está vacío
    const providerSel = document.getElementById('set-llm-provider');
    const modelInput = document.getElementById('set-llm-model');
    const modelHint = document.getElementById('set-llm-model-hint');
    function refreshProviderUI() {
      const p = providerSel.value;
      const def = defaultModelFor(p);
      modelInput.placeholder = def;
      modelHint.textContent = hintFor(p);
      // Si el modelo actual no parece corresponder al provider, sugerir el default
      if (!modelInput.value.trim() || modelInput.dataset.lastProvider !== p) {
        modelInput.value = def;
        modelInput.dataset.lastProvider = p;
      }
    }
    providerSel?.addEventListener('change', refreshProviderUI);
    refreshProviderUI();

    document.getElementById('set-backend-save')?.addEventListener('click', () => {
      save('set-supabase-url', 'agent-brain-supabase-url');
      save('set-supabase-key', 'agent-brain-supabase-anon-key');
      save('set-edge-url', 'agent-brain-edge-function-url');
      save('set-github-sync', 'github-sync', 'checked');
      save('set-create-issues', 'create-issues-from-chat', 'checked');
      save('set-execute-workflows', 'execute-workflows', 'checked');
      window.toast && window.toast('Configuración de backend guardada', '💾');
    });

    document.getElementById('set-profile-save')?.addEventListener('click', () => {
      save('set-email', 'user-email');
      save('set-name', 'user-name');
      window.toast && window.toast('Perfil guardado', '💾');
    });

    document.getElementById('set-export-memory')?.addEventListener('click', () => {
      window.exportMemoryJSON && window.exportMemoryJSON();
    });

    // Conexiones
    document.getElementById('conn-github-btn')?.addEventListener('click', () => {
      const token = prompt('Pega tu GitHub Personal Access Token (PAT):');
      if (token) {
        localStorage.setItem('agent-brain-pat', token);
        loadSettingsValues();
        window.toast && window.toast('GitHub conectado', '🐙');
      }
    });

    document.getElementById('conn-slack-btn')?.addEventListener('click', () => {
      const webhook = prompt('Pega tu Slack Incoming Webhook URL:');
      if (webhook) {
        localStorage.setItem('slack-webhook', webhook);
        loadSettingsValues();
        window.toast && window.toast('Slack conectado', '💬');
      }
    });

    document.getElementById('conn-discord-btn')?.addEventListener('click', () => {
      const webhook = prompt('Pega tu Discord Webhook URL:');
      if (webhook) {
        localStorage.setItem('discord-webhook', webhook);
        loadSettingsValues();
        window.toast && window.toast('Discord conectado', '🎮');
      }
    });

    document.getElementById('conn-shopify-btn')?.addEventListener('click', () => {
      const token = prompt('Pega tu Shopify Admin API token:');
      if (token) {
        localStorage.setItem('shopify-token', token);
        loadSettingsValues();
        window.toast && window.toast('Shopify conectado', '🛒');
      }
    });

    // Plugins
    renderPluginsList();
    document.getElementById('set-add-plugin')?.addEventListener('click', () => {
      const name = prompt('Nombre del plugin:');
      if (!name) return;
      const code = prompt('Código JavaScript del plugin (función que recibe input y devuelve resultado):');
      if (!code) return;
      const plugins = JSON.parse(localStorage.getItem('agent-brain-plugins') || '[]');
      plugins.push({ name, code, created: Date.now() });
      localStorage.setItem('agent-brain-plugins', JSON.stringify(plugins));
      renderPluginsList();
      window.toast && window.toast('Plugin añadido', '🧩');
    });
  }

  function renderPluginsList() {
    const el = document.getElementById('plugins-list');
    if (!el) return;
    const plugins = JSON.parse(localStorage.getItem('agent-brain-plugins') || '[]');
    if (!plugins.length) {
      el.innerHTML = '<div class="inv-empty" style="padding:var(--s-4)"><div class="inv-empty__text">Sin plugins. Añade uno con el botón de arriba.</div></div>';
      return;
    }
    el.innerHTML = `
      <table class="inv-table">
        <thead><tr><th>Nombre</th><th>Creado</th><th></th></tr></thead>
        <tbody>
          ${plugins.map((p, i) => `<tr><td>${p.name}</td><td style="font-family:var(--font-mono);font-size:11px">${new Date(p.created).toLocaleDateString('es')}</td><td><button class="inv-section__export" data-del-plugin="${i}" style="color:var(--danger)">🗑</button></td></tr>`).join('')}
        </tbody>
      </table>
    `;
    document.querySelectorAll('[data-del-plugin]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.delPlugin, 10);
        const plugins = JSON.parse(localStorage.getItem('agent-brain-plugins') || '[]');
        plugins.splice(idx, 1);
        localStorage.setItem('agent-brain-plugins', JSON.stringify(plugins));
        renderPluginsList();
        window.toast && window.toast('Plugin eliminado', '🗑');
      });
    });
  }

  // Exponer globalmente
  window.renderSettings = renderSettings;
})();
