// dashboard/supabase-client.js
// Cliente Supabase para el dashboard.
// Carga dinámicamente @supabase/supabase-js desde CDN (sin npm install).
// Maneja auth, CRUD, realtime y búsqueda semántica.

const SUPABASE_URL = localStorage.getItem('agent-brain-supabase-url') || '';
const SUPABASE_ANON_KEY = localStorage.getItem('agent-brain-supabase-anon-key') || '';

let supabase = null;

// Cargar supabase-js desde CDN
async function loadSupabase() {
  if (supabase) return supabase;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  try {
    if (!window.supabase) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.0/dist/umd/supabase.min.js';
        script.onload = resolve;
        script.onerror = () => reject(new Error('No se pudo cargar Supabase JS desde CDN'));
        document.head.appendChild(script);
      });
    }
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true },
      realtime: { params: { eventsPerSecond: 2 } },
    });
    return supabase;
  } catch (err) {
    console.error('[supabase] error cargando:', err.message);
    return null;
  }
}

// ─── Auth ───
const auth = {
  async signInWithEmail(email, password) {
    const sb = await loadSupabase();
    if (!sb) throw new Error('Supabase no configurado');
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  },

  async signInWithMagicLink(email) {
    const sb = await loadSupabase();
    if (!sb) throw new Error('Supabase no configurado');
    const { data, error } = await sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) throw error;
    return data;
  },

  async signUp(email, password) {
    const sb = await loadSupabase();
    if (!sb) throw new Error('Supabase no configurado');
    const { data, error } = await sb.auth.signUp({ email, password });
    if (error) throw error;
    return data;
  },

  async signInWithGitHub() {
    const sb = await loadSupabase();
    if (!sb) throw new Error('Supabase no configurado');
    const { data, error } = await sb.auth.signInWithOAuth({ provider: 'github' });
    if (error) throw error;
    return data;
  },

  async signOut() {
    const sb = await loadSupabase();
    if (!sb) return;
    await sb.auth.signOut();
  },

  async getSession() {
    const sb = await loadSupabase();
    if (!sb) return null;
    const { data } = await sb.auth.getSession();
    return data.session;
  },

  async getCurrentUser() {
    const sb = await loadSupabase();
    if (!sb) return null;
    const { data } = await sb.auth.getUser();
    return data.user;
  },

  onAuthStateChange(callback) {
    loadSupabase().then(sb => {
      if (sb) sb.auth.onAuthStateChange((event, session) => callback(event, session));
    });
  },
};

// ─── CRUD ───
const db = {
  async select(table, filters = {}, limit = 50, order = 'created_at', ascending = false) {
    const sb = await loadSupabase();
    if (!sb) return [];
    let query = sb.from(table).select('*').limit(limit).order(order, { ascending });
    for (const [key, value] of Object.entries(filters)) {
      if (value != null) query = query.eq(key, value);
    }
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  async insert(table, row) {
    const sb = await loadSupabase();
    if (!sb) throw new Error('Supabase no configurado');
    const { data, error } = await sb.from(table).insert(row).select();
    if (error) throw error;
    return data;
  },

  async update(table, id, updates) {
    const sb = await loadSupabase();
    if (!sb) throw new Error('Supabase no configurado');
    const { data, error } = await sb.from(table).update(updates).eq('id', id).select();
    if (error) throw error;
    return data;
  },

  async delete(table, id) {
    const sb = await loadSupabase();
    if (!sb) throw new Error('Supabase no configurado');
    const { error } = await sb.from(table).delete().eq('id', id);
    if (error) throw error;
  },

  async upsert(table, row) {
    const sb = await loadSupabase();
    if (!sb) throw new Error('Supabase no configurado');
    const { data, error } = await sb.from(table).upsert(row).select();
    if (error) throw error;
    return data;
  },
};

// ─── Búsqueda semántica ───
const search = {
  async memories(query, embedding, options = {}) {
    const sb = await loadSupabase();
    if (!sb) return [];
    const { data, error } = await sb.rpc('search_memories', {
      p_query: query,
      p_query_embedding: embedding,
      p_user_id: (await auth.getCurrentUser())?.id,
      p_project_id: options.projectId || null,
      p_types: options.types || null,
      p_limit: options.limit || 10,
    });
    if (error) throw error;
    return data || [];
  },

  // Fallback sin vectorial: solo léxica
  async memoriesLexical(query, options = {}) {
    const sb = await loadSupabase();
    if (!sb) return [];
    let q = sb.from('memories').select('*').ilike('title', `%${query}%`).limit(options.limit || 10);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  },
};

// ─── Realtime ───
const realtime = {
  subscribe(table, callback, filter = null) {
    loadSupabase().then(sb => {
      if (!sb) return;
      let channel = sb.channel(`${table}-changes`);
      if (filter) {
        channel = channel.on('postgres_changes',
          { event: '*', schema: 'public', table, filter },
          (payload) => callback(payload)
        );
      } else {
        channel = channel.on('postgres_changes',
          { event: '*', schema: 'public', table },
          (payload) => callback(payload)
        );
      }
      channel.subscribe();
    });
  },
  unsubscribe(table) {
    loadSupabase().then(sb => {
      if (sb) sb.channel(`${table}-changes`).unsubscribe();
    });
  },
};

// ─── Config ───
const config = {
  setCredentials(url, anonKey) {
    localStorage.setItem('agent-brain-supabase-url', url);
    localStorage.setItem('agent-brain-supabase-anon-key', anonKey);
  },
  getCredentials() {
    return {
      url: localStorage.getItem('agent-brain-supabase-url') || '',
      anonKey: localStorage.getItem('agent-brain-supabase-anon-key') || '',
    };
  },
  isConfigured() {
    const c = this.getCredentials();
    return Boolean(c.url && c.anonKey);
  },
};

// Hacer global para compatibilidad con script normal (no module)
window.supabaseClient = { auth, db, search, realtime, config, loadSupabase };
