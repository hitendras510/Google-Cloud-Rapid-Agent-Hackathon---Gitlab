-- GitLab Installations table
-- Tracks registered GitLab projects for webhook + MCP integration

CREATE TABLE IF NOT EXISTS gitlab_installations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gitlab_instance_url text NOT NULL DEFAULT 'https://gitlab.com',
  gitlab_project_id text NOT NULL,
  gitlab_project_name text NOT NULL,
  gitlab_namespace text NOT NULL,
  access_token_encrypted text,
  webhook_secret text DEFAULT md5(random()::text || clock_timestamp()::text),
  mcp_enabled boolean DEFAULT true,
  is_active boolean DEFAULT true,
  events_received integer DEFAULT 0,
  last_event_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(gitlab_instance_url, gitlab_project_id)
);

ALTER TABLE gitlab_installations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_gitlab_installations" ON gitlab_installations;
CREATE POLICY "anon_select_gitlab_installations" ON gitlab_installations FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_gitlab_installations" ON gitlab_installations;
CREATE POLICY "anon_insert_gitlab_installations" ON gitlab_installations FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_gitlab_installations" ON gitlab_installations;
CREATE POLICY "anon_update_gitlab_installations" ON gitlab_installations FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_gitlab_installations" ON gitlab_installations;
CREATE POLICY "anon_delete_gitlab_installations" ON gitlab_installations FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_gitlab_installations_project ON gitlab_installations(gitlab_project_id);
