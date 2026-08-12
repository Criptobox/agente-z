-- ═══════════════════════════════════════════════════════════════════════
-- agent-brain · Supabase Schema
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════════════════

-- Habilitar extensión pgvector si no está
CREATE EXTENSION IF NOT EXISTS vector;

-- ─── Tabla: projects ───
CREATE TABLE IF NOT EXISTS projects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  repo TEXT,
  description TEXT,
  health TEXT DEFAULT 'unknown' CHECK (health IN ('unknown','healthy','warning','critical')),
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE
);

-- ─── Tabla: tasks ───
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY, -- 'TASK-0001'
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  issue_number INT,
  goal TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'in_progress' CHECK (status IN ('in_progress','completed','stuck','needs_human','handoff','throttled','blocked_by_devil')),
  assigned TEXT DEFAULT 'code',
  depends_on TEXT[] DEFAULT '{}',
  related_memory TEXT[] DEFAULT '{}',
  autonomy TEXT DEFAULT 'assisted',
  current_attempt INT DEFAULT 0,
  definition_of_done JSONB DEFAULT '[]',
  budget JSONB DEFAULT '{}',
  handoffs JSONB DEFAULT '[]',
  files_involved TEXT[] DEFAULT '{}',
  symbols_involved TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);

-- ─── Tabla: memories (con pgvector) ───
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY, -- 'BUG-001', 'LESSON-0014', etc.
  type TEXT NOT NULL CHECK (type IN ('error','decision','fact','lesson','criteria','episode','budget','diary','project')),
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  project_name TEXT,
  title TEXT NOT NULL,
  body TEXT,
  status TEXT,
  severity TEXT,
  confidence INT DEFAULT 50,
  verified_by TEXT,
  files TEXT[] DEFAULT '{}',
  symbols TEXT[] DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  scope TEXT,
  trigger TEXT,
  files_pattern TEXT[] DEFAULT '{}',
  rule TEXT,
  anti_pattern TEXT,
  born_from TEXT[] DEFAULT '{}',
  times_applied INT DEFAULT 0,
  times_prevented_failure INT DEFAULT 0,
  times_ignored INT DEFAULT 0,
  promoted_to_rule BOOLEAN DEFAULT false,
  archived BOOLEAN DEFAULT false,
  stale BOOLEAN DEFAULT false,
  commit_sha TEXT,
  supersedes TEXT,
  invalidated_by TEXT,
  task_id TEXT,
  agent TEXT,
  embedding VECTOR(1536),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Índice vectorial IVFFlat para búsqueda semántica rápida
CREATE INDEX IF NOT EXISTS idx_memories_embedding
  ON memories USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
CREATE INDEX IF NOT EXISTS idx_memories_project ON memories(project_id);
CREATE INDEX IF NOT EXISTS idx_memories_user ON memories(user_id);
CREATE INDEX IF NOT EXISTS idx_memories_tags ON memories USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_memories_stale ON memories(stale) WHERE stale = true;

-- ─── Tabla: chat_messages ───
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  agent TEXT, -- qué agente respondió
  content TEXT NOT NULL,
  action_cards JSONB, -- botones de aprobar/modificar/cancelar
  voice BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_user ON chat_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_created ON chat_messages(created_at DESC);

-- ─── Tabla: episodes ───
CREATE TABLE IF NOT EXISTS episodes (
  id TEXT PRIMARY KEY,
  task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
  attempt INT,
  agent TEXT,
  strategy TEXT,
  gates_failed TEXT[] DEFAULT '{}',
  gates_passed TEXT[] DEFAULT '{}',
  result TEXT,
  needs_human BOOLEAN DEFAULT false,
  body JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_episodes_task ON episodes(task_id);

-- ─── Tabla: budget_snapshots ───
CREATE TABLE IF NOT EXISTS budget_snapshots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  tokens_used INT DEFAULT 0,
  tokens_limit INT DEFAULT 120000,
  tokens_percent INT DEFAULT 0,
  minutes_estimated INT DEFAULT 0,
  minutes_limit INT DEFAULT 180,
  minutes_percent INT DEFAULT 0,
  calls INT DEFAULT 0,
  failures INT DEFAULT 0,
  tasks_throttled INT DEFAULT 0,
  kind TEXT DEFAULT 'OK',
  models JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_budget_user_date ON budget_snapshots(user_id, date DESC);

-- ─── Tabla: user_settings (config por usuario) ───
CREATE TABLE IF NOT EXISTS user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  llm_provider TEXT DEFAULT 'groq',
  llm_model TEXT DEFAULT 'llama-3.1-70b-versatile',
  llm_api_key TEXT, -- encriptado en producción
  llm_fallback_provider TEXT,
  llm_fallback_model TEXT,
  llm_fallback_api_key TEXT,
  github_connected BOOLEAN DEFAULT false,
  github_token TEXT,
  github_repo TEXT,
  create_issues_from_chat BOOLEAN DEFAULT true,
  execute_workflows BOOLEAN DEFAULT true,
  slack_connected BOOLEAN DEFAULT false,
  discord_connected BOOLEAN DEFAULT false,
  voice_enabled BOOLEAN DEFAULT true,
  voice_lang TEXT DEFAULT 'es-ES',
  voice_rate FLOAT DEFAULT 1.1,
  theme TEXT DEFAULT 'dark',
  compact_mode BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── Función: search_memories (búsqueda híbrida) ───
-- Combina: 70% vectorial + 20% léxica + 10% confidence
CREATE OR REPLACE FUNCTION search_memories(
  p_query TEXT,
  p_query_embedding VECTOR(1536),
  p_user_id UUID,
  p_project_id UUID DEFAULT NULL,
  p_types TEXT[] DEFAULT NULL,
  p_limit INT DEFAULT 10
)
RETURNS TABLE (
  id TEXT,
  type TEXT,
  title TEXT,
  body TEXT,
  confidence INT,
  tags TEXT[],
  files TEXT[],
  symbols TEXT[],
  stale BOOLEAN,
  vector_score FLOAT,
  lexical_score FLOAT,
  final_score FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH vector_search AS (
    SELECT
      m.id, m.type, m.title, m.body, m.confidence, m.tags, m.files, m.symbols, m.stale,
      1 - (m.embedding <=> p_query_embedding) AS vector_score
    FROM memories m
    WHERE m.user_id = p_user_id
      AND m.archived = false
      AND (p_project_id IS NULL OR m.project_id = p_project_id)
      AND (p_types IS NULL OR m.type = ANY(p_types))
    ORDER BY m.embedding <=> p_query_embedding
    LIMIT p_limit * 3
  ),
  lexical_search AS (
    SELECT
      m.id, m.type, m.title, m.body, m.confidence, m.tags, m.files, m.symbols, m.stale,
      CASE
        WHEN m.title ILIKE '%' || p_query || '%' THEN 1.0
        WHEN m.body ILIKE '%' || p_query || '%' THEN 0.5
        WHEN EXISTS (SELECT 1 FROM unnest(m.tags) t WHERE t ILIKE '%' || p_query || '%') THEN 0.7
        ELSE 0.0
      END AS lexical_score
    FROM memories m
    WHERE m.user_id = p_user_id
      AND m.archived = false
      AND (p_project_id IS NULL OR m.project_id = p_project_id)
      AND (p_types IS NULL OR m.type = ANY(p_types))
      AND (
        m.title ILIKE '%' || p_query || '%'
        OR m.body ILIKE '%' || p_query || '%'
        OR EXISTS (SELECT 1 FROM unnest(m.tags) t WHERE t ILIKE '%' || p_query || '%')
      )
    LIMIT p_limit * 3
  )
  SELECT
    COALESCE(v.id, l.id) AS id,
    COALESCE(v.type, l.type) AS type,
    COALESCE(v.title, l.title) AS title,
    COALESCE(v.body, l.body) AS body,
    COALESCE(v.confidence, l.confidence) AS confidence,
    COALESCE(v.tags, l.tags) AS tags,
    COALESCE(v.files, l.files) AS files,
    COALESCE(v.symbols, l.symbols) AS symbols,
    COALESCE(v.stale, l.stale) AS stale,
    COALESCE(v.vector_score, 0.0) AS vector_score,
    COALESCE(l.lexical_score, 0.0) AS lexical_score,
    (COALESCE(v.vector_score, 0.0) * 0.7 + COALESCE(l.lexical_score, 0.0) * 0.2 + COALESCE(v.confidence, l.confidence, 50) / 100.0 * 0.1) AS final_score
  FROM vector_search v
  FULL OUTER JOIN lexical_search l ON v.id = l.id
  ORDER BY final_score DESC
  LIMIT p_limit;
END;
$$;

-- ─── Row Level Security ───
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE episodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- Política: usuarios solo ven sus propios datos
CREATE POLICY "users_select_own_projects" ON projects FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_insert_own_projects" ON projects FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_update_own_projects" ON projects FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users_delete_own_projects" ON projects FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "users_select_own_tasks" ON tasks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_insert_own_tasks" ON tasks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_update_own_tasks" ON tasks FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users_delete_own_tasks" ON tasks FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "users_select_own_memories" ON memories FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_insert_own_memories" ON memories FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_update_own_memories" ON memories FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users_delete_own_memories" ON memories FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "users_own_chat" ON chat_messages FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "users_own_episodes" ON episodes FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "users_own_budget" ON budget_snapshots FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "users_own_settings" ON user_settings FOR ALL USING (auth.uid() = user_id);

-- ─── Trigger: updated_at automático ───
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_projects_updated BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trigger_tasks_updated BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trigger_memories_updated BEFORE UPDATE ON memories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trigger_settings_updated BEFORE UPDATE ON user_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Realtime: habilitar para tablas clave ───
ALTER TABLE tasks REPLICA IDENTITY FULL;
ALTER TABLE chat_messages REPLICA IDENTITY FULL;
ALTER TABLE memories REPLICA IDENTITY FULL;
ALTER TABLE episodes REPLICA IDENTITY FULL;

-- Habilitar realtime en estas tablas
-- (también debe activarse en Dashboard → Database → Replication)
-- Supabase lo hace automáticamente con:
-- SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
