// supabase/functions/chat-router/index.ts
// Edge Function con dos modos:
//
//   1. mode: 'proxy' — puente para providers que bloquean CORS desde el
//      navegador (groq, openai, anthropic, github models). La API key del
//      usuario viaja SOLO entre su navegador y su propio Supabase; nunca por
//      proxies públicos de terceros. El destino está restringido a una
//      allowlist de hosts de APIs de IA (anti open-relay / SSRF).
//
//   2. mode: 'chat' (default) — enruta mensajes del chat al agente correcto
//      usando GROQ_API_KEY del entorno del deployment.
//
// Desplegar: supabase functions deploy chat-router
// Secrets:   supabase secrets set GROQ_API_KEY=...

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY') || '';
const GROQ_MODEL = 'llama-3.1-70b-versatile';

// Hosts a los que el modo proxy puede llamar. Nada más.
const PROXY_ALLOWED_HOSTS = new Set([
  'api.groq.com',
  'api.openai.com',
  'api.anthropic.com',
  'api.deepseek.com',
  'openrouter.ai',
  'models.inference.ai.azure.com',
  'models.github.ai',
  'generativelanguage.googleapis.com',
]);

// Rate limit simple en memoria (por isolate — mitiga abuso básico, no es
// una garantía dura; para eso, verification JWT + límites por usuario).
const RATE_LIMIT_MAX = 30;
const RATE_WINDOW_MS = 60_000;
const rateBuckets = new Map<string, number[]>();

function rateLimited(id: string): boolean {
  const now = Date.now();
  const bucket = (rateBuckets.get(id) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (bucket.length >= RATE_LIMIT_MAX) {
    rateBuckets.set(id, bucket);
    return true;
  }
  bucket.push(now);
  rateBuckets.set(id, bucket);
  return false;
}

// ─── Modo proxy: puente CORS con allowlist de destinos ───
async function handleProxy(payload: { targetUrl?: string; targetHeaders?: Record<string, string>; targetBody?: string }) {
  const { targetUrl, targetHeaders = {}, targetBody } = payload;
  if (!targetUrl || !targetBody) {
    return json({ error: 'proxy requiere targetUrl y targetBody' }, 400);
  }

  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return json({ error: 'targetUrl inválida' }, 400);
  }
  if (parsed.protocol !== 'https:' || !PROXY_ALLOWED_HOSTS.has(parsed.hostname)) {
    return json({ error: `destino no permitido: ${parsed.hostname}` }, 403);
  }

  const upstream = await fetch(parsed.href, {
    method: 'POST',
    headers: targetHeaders,
    body: targetBody,
  });

  // Passthrough del body (soporta SSE/streaming tal cual) y del content-type.
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      ...corsHeaders,
      'Content-Type': upstream.headers.get('content-type') || 'application/json',
    },
  });
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ─── Modo chat: enrutador de agentes ───
function routeAgent(message: string) {
  const m = message.toLowerCase();
  if (m.match(/\b(crear|nueva?|abrir)\b.*\b(tarea|bug|issue)\b/) || m.match(/\b(investigar|arreglar|fix)\b/)) return 'orchestrator';
  if (m.match(/\b(stuck|atascad|bloque)\b/)) return 'research';
  if (m.match(/\b(audit|seguridad|secreto|token)\b/)) return 'security';
  if (m.match(/\b(analiz|auditar|repo)\b/)) return 'analyst';
  if (m.match(/\b(inventar|producto|stock|agotad)\b/)) return 'inventory';
  return 'chat';
}

const AGENT_PROMPTS: Record<string, string> = {
  chat: 'Eres CHAT, la interfaz conversacional de agent-brain. Respondes en español, en texto markdown natural, máx 3 párrafos. Cita IDs concretos.',
  orchestrator: 'Eres ORCHESTRATOR. Responde: (1) aceptas o no, (2) qué agente asignarías, (3) 2-3 gates para DoD. Formato JSON.',
  research: 'Eres RESEARCH. Hipótesis en una frase, confidence 0-100, qué archivo leerías primero.',
  security: 'Eres SECURITY. Reporta hallazgos con severity y fix propuesto.',
  analyst: 'Eres ANALYST. Top 5 hallazgos con archivo:línea y fix concreto.',
  inventory: 'Eres INVENTORY. Reporta agotados, nuevos, stock bajo.',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    // Identidad para rate limit: apikey del header o IP del cliente.
    const rlId = req.headers.get('apikey') || req.headers.get('x-forwarded-for') || 'anon';
    if (rateLimited(rlId)) {
      return json({ error: 'rate limit excedido (30 req/min)' }, 429);
    }

    const payload = await req.json();

    if (payload.mode === 'proxy') {
      return await handleProxy(payload);
    }

    const { message, history = [], userId } = payload;
    if (!message) return json({ error: 'message requerido' }, 400);

    const agent = routeAgent(message);
    const systemPrompt = AGENT_PROMPTS[agent] || AGENT_PROMPTS.chat;
    const messages = [{ role: 'system', content: systemPrompt }, ...history.slice(-6), { role: 'user', content: message }];

    let response = '';
    if (GROQ_API_KEY) {
      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: GROQ_MODEL, messages, temperature: 0.4, max_tokens: 1024 }),
      });
      if (groqRes.ok) { const data = await groqRes.json(); response = data.choices?.[0]?.message?.content || '(sin respuesta)'; }
      else response = `⚠️ Groq respondió ${groqRes.status}.`;
    } else response = `[demo] Agente ${agent} recibiría: "${message}". Configura GROQ_API_KEY en Supabase Secrets.`;

    const actionCards = (agent === 'orchestrator' || response.match(/\b(crear|ejecutar|asignar)\b/))
      ? [{ label: 'Aprobar', action: 'approve', style: 'primary' }, { label: 'Modificar', action: 'modify', style: 'secondary' }, { label: 'Cancelar', action: 'cancel', style: 'danger' }]
      : [];

    // Persistir chat usando las credenciales del PROPIO deployment (env de
    // Supabase Functions), nunca credenciales pasadas por el cliente — antes
    // esto era un relay de escritura abierto a cualquier Supabase.
    if (userId) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      if (supabaseUrl && serviceKey) {
        try {
          const sb = createClient(supabaseUrl, serviceKey);
          await sb.from('chat_messages').insert({ user_id: userId, role: 'user', content: message });
          await sb.from('chat_messages').insert({ user_id: userId, role: 'assistant', agent, content: response, action_cards: actionCards.length ? actionCards : null });
        } catch (e) { console.error('[supabase] save error:', (e as Error).message); }
      }
    }

    return json({ agent, response, actionCards });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
