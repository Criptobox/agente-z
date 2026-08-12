// dashboard/streaming.js
// Streaming de respuestas LLM — palabra por palabra como ChatGPT.
// Funciona con Groq (streaming nativo) y con mocks en modo demo.

(function() {
  'use strict';

  // Stream desde Groq (compatible OpenAI streaming)
  async function streamFromGroq(messages, opts, onToken, onDone, onError) {
    const apiKey = localStorage.getItem('llm-api-key') || localStorage.getItem('GROQ_API_KEY') || '';
    const model = opts.model || localStorage.getItem('llm-model') || 'llama-3.1-70b-versatile';
    const provider = localStorage.getItem('llm-provider') || 'groq';

    let endpoint, headers;
    if (provider === 'groq') {
      endpoint = 'https://api.groq.com/openai/v1/chat/completions';
      headers = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
    } else if (provider === 'gemini') {
      // Gemini no soporta streaming SSE estándar — fallback a no-stream
      endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      headers = { 'Content-Type': 'application/json' };
    } else {
      // Sin provider configurado — usar mock
      return streamMock(messages, opts, onToken, onDone, onError);
    }

    if (!apiKey) {
      return streamMock(messages, opts, onToken, onDone, onError);
    }

    try {
      const body = provider === 'groq' ? {
        model, messages, stream: true, temperature: opts.temperature || 0.4, max_tokens: opts.maxTokens || 1024,
      } : {
        contents: messages.filter(m => m.role !== 'system').map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
        systemInstruction: messages.find(m => m.role === 'system') ? { parts: [{ text: messages.find(m => m.role === 'system').content }] } : undefined,
        generationConfig: { temperature: opts.temperature || 0.4, maxOutputTokens: opts.maxTokens || 1024 },
      };

      const res = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body) });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${txt.slice(0, 200)}`);
      }

      if (provider === 'groq') {
        // SSE streaming
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
        // Gemini no-stream fallback
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
        // Simular streaming palabra por palabra
        const words = text.split(' ');
        let full = '';
        for (const w of words) {
          full += (full ? ' ' : '') + w;
          onToken(w + ' ', full);
          await new Promise(r => setTimeout(r, 30));
        }
        onDone(text);
      }
    } catch (err) {
      onError(err);
    }
  }

  // Mock streaming para modo demo
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
    } else {
      response = 'Recibí tu mensaje. Estoy procesándolo en background. Cuando tenga una respuesta completa, aparecerá aquí.\n\n¿Qué más necesitas?';
    }

    // Simular streaming palabra por palabra
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
        // Mostrar respuesta en el chat en tiempo real
        if (window.addChatMessage) {
          window.addChatMessage('assistant', payload.new.content, payload.new.agent, payload.new.action_cards);
        }
      }
    });

    sb.realtime.subscribe('tasks', (payload) => {
      // Actualizar vista de tareas cuando cambian
      if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
        if (window.loadAll) window.loadAll();
      }
    });

    sb.realtime.subscribe('memories', (payload) => {
      // Actualizar memoria cuando se añade nueva
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
    stream: streamFromGroq,
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
