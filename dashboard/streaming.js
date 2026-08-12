// dashboard/streaming.js
// Streaming de respuestas LLM — palabra por palabra como ChatGPT.
// Soporta: Groq, OpenRouter, DeepSeek, OpenAI, Anthropic, Gemini, GitHub Models.
// Fallback automático al provider secundario si el primario falla.

(function() {
  'use strict';

  // Lee la config guardada por settings.js
  function getProviderConfig(provider, model, key) {
    if (window.__providerConfig) return window.__providerConfig(provider, model, key);
    // Fallback mínimo si settings.js no cargó todavía
    switch (provider) {
      case 'groq':
        return {
          endpoint: 'https://api.groq.com/openai/v1/chat/completions',
          headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
          chatBody: (m, o) => ({ model, messages: m, stream: !!o.stream, temperature: o.temperature ?? 0.4, max_tokens: o.maxTokens ?? 1024 }),
          supportsStream: true,
        };
      case 'openrouter':
        return {
          endpoint: 'https://openrouter.ai/api/v1/chat/completions',
          headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json', 'HTTP-Referer': location.origin, 'X-Title': 'agent-brain' },
          chatBody: (m, o) => ({ model, messages: m, stream: !!o.stream, temperature: o.temperature ?? 0.4, max_tokens: o.maxTokens ?? 1024 }),
          supportsStream: true,
        };
      case 'deepseek':
        return {
          endpoint: 'https://api.deepseek.com/v1/chat/completions',
          headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
          chatBody: (m, o) => ({ model, messages: m, stream: !!o.stream, temperature: o.temperature ?? 0.4, max_tokens: o.maxTokens ?? 1024 }),
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
          supportsStream: false,
        };
      case 'openai':
        return {
          endpoint: 'https://api.openai.com/v1/chat/completions',
          headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
          chatBody: (m, o) => ({ model, messages: m, stream: !!o.stream, temperature: o.temperature ?? 0.4, max_tokens: o.maxTokens ?? 1024 }),
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
          supportsStream: false,
        };
      case 'github':
        return {
          endpoint: 'https://models.inference.ai.azure.com/chat/completions',
          headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
          chatBody: (m, o) => ({ model, messages: m, temperature: o.temperature ?? 0.4, max_tokens: o.maxTokens ?? 1024 }),
          supportsStream: false,
        };
      default:
        return null;
    }
  }

  function getSavedSettings() {
    return {
      provider: localStorage.getItem('llm-provider') || 'groq',
      model: localStorage.getItem('llm-model') || 'llama-3.1-70b-versatile',
      key: localStorage.getItem('llm-api-key') || localStorage.getItem('GROQ_API_KEY') || '',
      fallbackProvider: localStorage.getItem('llm-fallback-provider') || '',
    };
  }

  // Llamada principal: intenta provider primario, si falla y hay fallback, lo intenta con ese.
  async function stream(messages, opts, onToken, onDone, onError) {
    const s = getSavedSettings();
    if (!s.key) {
      // Sin API key → modo demo
      return streamMock(messages, opts, onToken, onDone, onError);
    }

    // Lista de intentos: primario + fallback (si hay y es distinto)
    const attempts = [{ provider: s.provider, model: s.model, key: s.key }];
    if (s.fallbackProvider && s.fallbackProvider !== s.provider) {
      attempts.push({
        provider: s.fallbackProvider,
        model: window.__defaultModelFor ? window.__defaultModelFor(s.fallbackProvider) : 'llama-3.1-70b-versatile',
        key: s.key,  // mismo key (OpenRouter suele ser multi; otros no — el test lo rechazará)
      });
    }

    let lastErr = null;
    for (let i = 0; i < attempts.length; i++) {
      const a = attempts[i];
      try {
        await streamOnce(a, messages, opts, onToken, onDone, onError, i > 0);
        return;  // éxito
      } catch (err) {
        lastErr = err;
        console.warn(`[streaming] ${a.provider} falló:`, err.message);
        // Si fue abort por el usuario, no reintentar
        if (err.name === 'AbortError') break;
        // Si quedan intentos, notificar al usuario que estamos cayendo al fallback
        if (i < attempts.length - 1 && onToken) {
          onToken(`\n\n⚠️ ${a.provider} falló (${err.message.slice(0, 80)}), probando ${attempts[i+1].provider}…\n\n`, '');
        }
      }
    }
    // Todos fallaron
    if (onToken && lastErr) {
      onToken(`\n\n❌ Todos los providers fallaron. Último error: ${lastErr.message.slice(0, 200)}\n\n`, '');
    }
    onError(lastErr || new Error('Streaming falló sin error específico'));
  }

  // Providers que SABEMOS que bloquean llamadas desde browser (CORS)
  // y por los que hay que rutear a través de un proxy CORS público.
  // Lista negra CORS — probada con curl -X OPTIONS:
  //   - groq: NO envía Access-Control-Allow-Origin en preflight
  //   - openai: ídem
  //   - anthropic: ídem
  //   - github (models.inference.ai.azure.com): ídem
  // Providers que SÍ funcionan directo desde browser:
  //   - openrouter, deepseek, gemini
  const CORS_BLOCKED_PROVIDERS = ['groq', 'openai', 'anthropic', 'github'];
  const CORS_PROXY = 'https://corsproxy.io/?url=';

  async function streamOnce(attempt, messages, opts, onToken, onDone, onError, isFallback) {
    const cfg = getProviderConfig(attempt.provider, attempt.model, attempt.key);
    if (!cfg) throw new Error(`Provider no soportado: ${attempt.provider}`);

    const useStream = cfg.supportsStream && opts.stream !== false;
    const body = cfg.chatBody(messages, { ...opts, stream: useStream });

    // Si el provider está en lista negra CORS, rutear a través del proxy
    let url = cfg.endpoint;
    const needsProxy = CORS_BLOCKED_PROVIDERS.includes(attempt.provider);
    if (needsProxy) {
      url = CORS_PROXY + encodeURIComponent(cfg.endpoint);
    }

    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: cfg.headers,
        body: JSON.stringify(body),
        signal: opts.signal,
      });
    } catch (fetchErr) {
      // Si falla el fetch directo (CORS, red, etc.) y no estamos usando proxy aún, reintentar con proxy
      if (!needsProxy && (fetchErr.name === 'TypeError' || fetchErr.message.includes('Failed to fetch'))) {
        console.warn(`[streaming] ${attempt.provider} fetch directo falló (${fetchErr.message}), reintentando con proxy CORS…`);
        const proxyUrl = CORS_PROXY + encodeURIComponent(cfg.endpoint);
        res = await fetch(proxyUrl, {
          method: 'POST',
          headers: cfg.headers,
          body: JSON.stringify(body),
          signal: opts.signal,
        });
      } else {
        throw fetchErr;
      }
    }

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      let detail = txt.slice(0, 300);
      try { const j = JSON.parse(txt); detail = j.error?.message || j.message || detail; } catch {}
      throw new Error(`HTTP ${res.status}: ${detail}`);
    }

    if (useStream && res.body) {
      // SSE streaming (Groq, OpenRouter, DeepSeek, OpenAI)
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            // OpenRouter puede traer comentarios de ruteo; ignorarlos
            const token = parsed.choices?.[0]?.delta?.content || '';
            if (token) {
              fullText += token;
              onToken(token, fullText);
            }
          } catch {}
        }
      }
      onDone(fullText);
    } else {
      // No-streaming (Gemini, Anthropic, GitHub Models, o stream desactivado)
      const data = await res.json();
      let text = '';
      if (attempt.provider === 'gemini') {
        text = data.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
      } else if (attempt.provider === 'anthropic') {
        text = data.content?.map(c => c.text).join('') || '';
      } else {
        text = data.choices?.[0]?.message?.content || '';
      }
      // Simular streaming palabra por palabra para mejor UX
      const words = text.match(/\S+\s*/g) || [text];
      let full = '';
      for (const w of words) {
        full += w;
        onToken(w, full);
        // ~30ms/palabra = ~33 palabras/segundo, comparable a lectura humana
        await new Promise(r => setTimeout(r, 25));
      }
      onDone(text);
    }
  }

  // Mock streaming para modo demo o sin API key
  async function streamMock(messages, opts, onToken, onDone, onError) {
    const lastMsg = messages[messages.length - 1]?.content || '';
    const q = lastMsg.toLowerCase();

    let response = '';
    if (q.includes('stuck')) {
      response = 'Tienes **1 tarea stuck**:\n\n• **TASK-0041** — Refactorizar calculateTotal\n  Intento 5/5. Gate G3 fallando.\n\n¿Quieres que cree una tarea para que `research` investigue?';
    } else if (q.includes('cuota') || q.includes('budget')) {
      response = '📊 **Budget de hoy:**\n\n• Tokens: 45k/120k (38%)\n• Minutos: 12/180 (7%)\n• Estado: ✅ OK';
    } else if (q.includes('diario')) {
      response = '📅 **Último diario:**\n\n"Arreglado bug del carrito. 1 lección nueva sobre NaN."\n\n• TASK-0042 cerrada\n• Sin tareas STUCK';
    } else if (q.includes('analiz') || q.includes('repo')) {
      response = '🔍 Para analizar un repo, ve a la vista **Inventario** y pega la URL. Te mostraré productos agotados, stock bajo y más.';
    } else if (!localStorage.getItem('llm-api-key')) {
      response = '⚠️ **Modo demo** — no tienes API key configurada.\n\nVe a **Settings → Modelos de IA** y pega tu API key de Groq, OpenRouter, DeepSeek, Gemini, etc. Después del primer mensaje real, las respuestas vendrán en streaming palabra por palabra.\n\nMientras tanto, prueba preguntas como: "tareas stuck", "budget", "diario".';
    } else {
      response = 'Recibí tu mensaje. Estoy procesándolo en background. Cuando tenga una respuesta completa, aparecerá aquí.\n\n¿Qué más necesitas?';
    }

    const words = response.split(/(\s+)/);
    let full = '';
    for (const w of words) {
      full += w;
      onToken(w, full);
      await new Promise(r => setTimeout(r, 20 + Math.random() * 40));
    }
    onDone(response);
  }

  // ─── Command Center: ejecuta cualquier acción desde el chat ───
  const commandPatterns = [
    { regex: /^(analiz|audit|revis)\w*\s+(?:repo\s+)?(.+)/i, type: 'analyze-repo', extract: (m) => ({ repo: m[2].trim() }) },
    { regex: /^(compar)\w*\s+(.+)\s+(?:con|vs|contra)\s+(.+)/i, type: 'compare-repos', extract: (m) => ({ repoA: m[2].trim(), repoB: m[3].trim() }) },
    { regex: /^(crea|nueva?|abrir)\w*\s+(?:tarea|bug|issue)\s+(?:para\s+)?(.+)/i, type: 'create-task', extract: (m) => ({ goal: m[2].trim() }) },
    { regex: /^(inventar|inventari|stock)\w*/i, type: 'inventory', extract: () => ({}) },
    { regex: /^(settings?|config)\w*/i, type: 'settings', extract: () => ({}) },
    { regex: /^(help|ayuda|comandos)/i, type: 'help', extract: () => ({}) },
  ];

  function parseCommand(message) {
    for (const p of commandPatterns) {
      const match = message.match(p.regex);
      if (match) return { type: p.type, payload: p.extract(match) };
    }
    return { type: 'chat', payload: { message } };
  }

  function getHelpText() {
    return `📋 **Comandos disponibles:**\n\n• \`analiza <repo>\` — Audita un repo de GitHub\n• \`compara <repoA> con <repoB>\` — Compara inventarios\n• \`crea tarea <descripción>\` — Crea una nueva tarea\n• \`inventario\` — Ve al módulo de inventario\n• \`settings\` — Abre configuración\n\nO simplemente escribe una pregunta y responderé.`;
  }

  // ─── Realtime con Supabase ───
  let realtimeChannel = null;

  function initRealtime() {
    const sbUrl = localStorage.getItem('agent-brain-supabase-url');
    const sbKey = localStorage.getItem('agent-brain-supabase-anon-key');
    if (!sbUrl || !sbKey || !window.supabaseClient) return;

    const sb = window.supabaseClient;
    if (realtimeChannel) realtimeChannel.unsubscribe();

    realtimeChannel = sb.realtime.subscribe('chat_messages', (payload) => {
      if (payload.eventType === 'INSERT' && payload.new?.role === 'assistant') {
        if (window.addChatMessage) {
          window.addChatMessage('assistant', payload.new.content, payload.new.agent, payload.new.action_cards);
        }
      }
    });

    sb.realtime.subscribe('tasks', (payload) => {
      if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
        if (window.loadAll) window.loadAll();
      }
    });

    sb.realtime.subscribe('memories', (payload) => {
      if (payload.eventType === 'INSERT') {
        if (window.loadAll) window.loadAll();
      }
    });
  }

  // ─── Historial de conversación persistente ───
  const HISTORY_KEY = 'agent-brain-chat-history';

  function saveChatHistory(history) {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-50))); } catch {}
  }

  function loadChatHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; }
  }

  function clearChatHistory() {
    localStorage.removeItem(HISTORY_KEY);
  }

  // ─── Exponer globalmente ───
  window.streaming = {
    stream,
    parseCommand,
    getHelpText,
    initRealtime,
  };
  window.chatHistory = {
    save: saveChatHistory,
    load: loadChatHistory,
    clear: clearChatHistory,
  };
})();
