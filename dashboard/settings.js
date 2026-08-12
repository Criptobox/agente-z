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
                <option value="openrouter">OpenRouter (gratis + pago, 100+ modelos)</option>
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
              <small id="set-llm-model-hint" style="display:block;color:var(--text-secondary);font-size:11px;margin-top:4px"></small>
            </div>
            <div class="field">
              <label class="field__label">API Key</label>
              <input class="field__input" type="password" id="set-llm-key" placeholder="gsk_xxx...">
              <small id="set-llm-key-hint" style="display:block;color:var(--text-secondary);font-size:11px;margin-top:4px"></small>
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
          <div id="set-llm-cors-hint" class="cors-hint"></div>
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
      const model = document.getElementById('set-llm-model').value;
      const key = document.getElementById('set-llm-key').value;
      const result = document.getElementById('set-llm-result');
      if (!key) { result.innerHTML = '<div class="info-banner" style="background:rgba(239,68,68,0.08);border-color:rgba(239,68,68,0.3)">⚠️ Falta API key</div>'; return; }
      result.innerHTML = '<div class="inv-loading"><div class="inv-loading__spinner"></div><div>Probando…</div></div>';
      try {
        let endpoint, headers, body;
        if (provider === 'groq' || provider === 'openrouter' || provider === 'deepseek' || provider === 'openai') {
          // OpenAI-compatible: groq, openrouter, deepseek, openai
          const endpoints = {
            groq: 'https://api.groq.com/openai/v1/chat/completions',
            openrouter: 'https://openrouter.ai/api/v1/chat/completions',
            deepseek: 'https://api.deepseek.com/chat/completions',
            openai: 'https://api.openai.com/v1/chat/completions',
          };
          endpoint = endpoints[provider];
          headers = { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' };
          if (provider === 'openrouter') {
            headers['HTTP-Referer'] = location.origin;
            headers['X-Title'] = 'agent-brain';
          }
          body = JSON.stringify({ model, messages: [{ role: 'user', content: 'Responde solo "OK"'}], max_tokens: 5 });
        } else if (provider === 'gemini') {
          endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
          headers = { 'Content-Type': 'application/json' };
          body = JSON.stringify({ contents: [{ parts: [{ text: 'Responde solo OK' }] }] });
        } else if (provider === 'anthropic') {
          endpoint = 'https://api.anthropic.com/v1/messages';
          headers = { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' };
          body = JSON.stringify({ model, max_tokens: 5, messages: [{ role: 'user', content: 'Responde solo OK' }] });
        } else if (provider === 'github') {
          endpoint = 'https://models.inference.ai.azure.com/chat/completions';
          headers = { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' };
          body = JSON.stringify({ model, messages: [{ role: 'user', content: 'Responde solo "OK"'}], max_tokens: 5 });
        } else {
          throw new Error('Provider no soportado para test');
        }
        const res = await fetch(endpoint, { method: 'POST', headers, body });
        if (res.ok) {
          result.innerHTML = '<div class="info-banner" style="background:rgba(16,185,129,0.08);border-color:rgba(16,185,129,0.3)">✅ Conexión exitosa con ' + provider + ' / ' + model + '</div>';
        } else {
          result.innerHTML = '<div class="info-banner" style="background:rgba(239,68,68,0.08);border-color:rgba(239,68,68,0.3)">❌ Error ' + res.status + ': ' + res.statusText + '</div>';
        }
      } catch (err) {
        result.innerHTML = '<div class="info-banner" style="background:rgba(239,68,68,0.08);border-color:rgba(239,68,68,0.3)">❌ ' + err.message + '</div>';
      }
    });

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

  // ─── Helpers dinámicos por provider ───
  // Config de cada provider: modelo por defecto, placeholder de API key, link para obtenerla
  const PROVIDER_CONFIG = {
    groq: {
      defaultModel: 'llama-3.1-70b-versatile',
      keyPlaceholder: 'gsk_xxx...',
      keyHint: 'Obtén tu key gratis en console.groq.com/keys',
      modelHint: 'Modelos recomendados: llama-3.1-70b-versatile, llama-3.1-8b-instant, mixtral-8x7b-32768',
    },
    openrouter: {
      defaultModel: 'meta-llama/llama-3.1-8b-instruct:free',
      keyPlaceholder: 'sk-or-v1-xxx...',
      keyHint: 'Obtén tu key en openrouter.ai/keys (hay modelos gratis)',
      modelHint: 'Modelos gratis: meta-llama/llama-3.1-8b-instruct:free, google/gemma-2-9b-it:free',
    },
    deepseek: {
      defaultModel: 'deepseek-chat',
      keyPlaceholder: 'sk-xxx...',
      keyHint: 'Obtén tu key en platform.deepseek.com/api_keys',
      modelHint: 'Modelos: deepseek-chat (general), deepseek-reasoner (razonamiento)',
    },
    gemini: {
      defaultModel: 'gemini-1.5-flash',
      keyPlaceholder: 'AIzaXxxx...',
      keyHint: 'Obtén tu key en aistudio.google.com/app/apikey',
      modelHint: 'Modelos: gemini-1.5-flash (rápido), gemini-1.5-pro (potente)',
    },
    openai: {
      defaultModel: 'gpt-4o-mini',
      keyPlaceholder: 'sk-xxx...',
      keyHint: 'Obtén tu key en platform.openai.com/api-keys',
      modelHint: 'Modelos: gpt-4o-mini (barato), gpt-4o, gpt-3.5-turbo',
    },
    anthropic: {
      defaultModel: 'claude-3-5-haiku-20241022',
      keyPlaceholder: 'sk-ant-xxx...',
      keyHint: 'Obtén tu key en console.anthropic.com/settings/keys',
      modelHint: 'Modelos: claude-3-5-haiku-20241022 (rápido), claude-3-5-sonnet-20241022',
    },
    github: {
      defaultModel: 'gpt-4o-mini',
      keyPlaceholder: 'ghp_xxx...',
      keyHint: 'Obtén tu PAT en github.com/settings/tokens (scopes: repo, workflow, models)',
      modelHint: 'Modelos: gpt-4o-mini, gpt-4o, mistral-large',
    },
  };

  // Devuelve la config de un provider (para que streaming.js la use)
  function providerConfig(provider, model, key) {
    const cfg = PROVIDER_CONFIG[provider] || PROVIDER_CONFIG.groq;
    return {
      provider,
      model: model || cfg.defaultModel,
      apiKey: key,
      endpoint: endpointFor(provider),
      supportsStream: ['groq', 'openrouter', 'deepseek', 'openai'].includes(provider),
      chatBody: (m, o) => ({ model: model || cfg.defaultModel, messages: m, stream: !!o.stream, temperature: o.temperature ?? 0.4, max_tokens: o.maxTokens ?? 1024 }),
    };
  }

  // Devuelve el modelo por defecto para un provider
  function defaultModelFor(provider) {
    return (PROVIDER_CONFIG[provider] || PROVIDER_CONFIG.groq).defaultModel;
  }

  // Endpoint según provider
  function endpointFor(provider) {
    switch (provider) {
      case 'groq': return 'https://api.groq.com/openai/v1/chat/completions';
      case 'openrouter': return 'https://openrouter.ai/api/v1/chat/completions';
      case 'deepseek': return 'https://api.deepseek.com/chat/completions';
      case 'gemini': return `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`;
      case 'openai': return 'https://api.openai.com/v1/chat/completions';
      case 'anthropic': return 'https://api.anthropic.com/v1/messages';
      case 'github': return 'https://models.inference.ai.azure.com/chat/completions';
      default: return 'https://api.groq.com/openai/v1/chat/completions';
    }
  }

  // Providers que SÍ funcionan directo desde el navegador (probado con curl)
  const CORS_OK_PROVIDERS = ['openrouter', 'deepseek', 'gemini'];

  // Actualizar hints cuando cambia el provider
  function updateProviderHints() {
    const provider = document.getElementById('set-llm-provider')?.value || 'groq';
    const cfg = PROVIDER_CONFIG[provider] || PROVIDER_CONFIG.groq;
    const modelInput = document.getElementById('set-llm-model');
    const keyInput = document.getElementById('set-llm-key');
    const modelHint = document.getElementById('set-llm-model-hint');
    const keyHint = document.getElementById('set-llm-key-hint');
    const corsHint = document.getElementById('set-llm-cors-hint');

    if (modelInput && !modelInput.value) modelInput.value = cfg.defaultModel;
    if (modelInput) modelInput.placeholder = cfg.defaultModel;
    if (keyInput) keyInput.placeholder = cfg.keyPlaceholder;
    if (modelHint) modelHint.textContent = cfg.modelHint;
    if (keyHint) keyHint.textContent = cfg.keyHint;

    // Hint de CORS: ¿este provider funciona desde el navegador?
    if (corsHint) {
      if (CORS_OK_PROVIDERS.includes(provider)) {
        corsHint.className = 'cors-hint';
        corsHint.innerHTML = '✅ <strong>Funciona directo desde el navegador.</strong> No necesita proxy ni backend.';
      } else {
        corsHint.className = 'cors-hint cors-hint--warning';
        corsHint.innerHTML = '⚠️ <strong>' + provider + ' bloquea llamadas desde el navegador (CORS).</strong> ' +
          'Se usará un proxy CORS público automáticamente. <strong>Recomendado:</strong> usá OpenRouter, DeepSeek o Gemini para mejor rendimiento y privacidad.';
      }
    }
  }

  // Exponer globalmente
  window.renderSettings = renderSettings;
  window.__providerConfig = providerConfig;
  window.__defaultModelFor = defaultModelFor;

  // ─── Hook para actualizar hints cuando se renderiza Settings ───
  // Usamos un MutationObserver para detectar cuando el select cambia
  const _origRenderSettings = renderSettings;
  window.renderSettings = function() {
    _origRenderSettings();
    // Dar un tick para que el DOM esté listo
    setTimeout(() => {
      updateProviderHints();
      const prov = document.getElementById('set-llm-provider');
      if (prov && !prov.dataset.hooked) {
        prov.addEventListener('change', updateProviderHints);
        prov.dataset.hooked = '1';
      }
    }, 50);
  };
})();
