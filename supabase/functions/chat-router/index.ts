// supabase/functions/chat-router/index.ts
// Edge Function que recibe mensajes del chat y los enruta al agente correcto.
// Desplegar: supabase functions deploy chat-router

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY') || '';
const GROQ_MODEL = 'llama-3.1-70b-versatile';

function routeAgent(message) {
  const m = message.toLowerCase();
  if (m.match(/\b(crear|nueva?|abrir)\b.*\b(tarea|bug|issue)\b/) || m.match(/\b(investigar|arreglar|fix)\b/)) return 'orchestrator';
  if (m.match(/\b(stuck|atascad|bloque)\b/)) return 'research';
  if (m.match(/\b(audit|seguridad|secreto|token)\b/)) return 'security';
  if (m.match(/\b(analiz|auditar|repo)\b/)) return 'analyst';
  if (m.match(/\b(inventar|producto|stock|agotad)\b/)) return 'inventory';
  return 'chat';
}

const AGENT_PROMPTS = {
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
    const { message, history = [], userId, supabaseUrl, supabaseKey } = await req.json();
    if (!message) return new Response(JSON.stringify({ error: 'message requerido' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

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

    if (supabaseUrl && supabaseKey && userId) {
      try {
        const sb = createClient(supabaseUrl, supabaseKey);
        await sb.from('chat_messages').insert({ user_id: userId, role: 'user', content: message });
        await sb.from('chat_messages').insert({ user_id: userId, role: 'assistant', agent, content: response, action_cards: actionCards.length ? actionCards : null });
      } catch (e) { console.error('[supabase] save error:', e.message); }
    }

    return new Response(JSON.stringify({ agent, response, actionCards }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
