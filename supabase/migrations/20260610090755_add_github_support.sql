/*
# Add GitHub support to PipelineGuardian

1. Modified Tables
  - `projects`: Add `platform` column (github/gitlab), `github_repo_full_name` (owner/repo), `github_installation_id`
  - `failures`: Add `workflow_run_id`, `workflow_name`, `run_attempt` columns for GitHub Actions data

2. New Table
  - `installations` - Tracks GitHub webhook installations
    - `id` (uuid, primary key)
    - `github_owner` (text, GitHub user or org)
    - `github_repo` (text, repo name)
    - `webhook_id` (text, GitHub webhook ID)
    - `webhook_secret` (text, HMAC secret for verification)
    - `github_token_encrypted` (text, PAT for API calls)
    - `is_active` (boolean)
    - `created_at` (timestamp)

3. Security
  - RLS on installations (single-tenant, open for demo)

4. Notes
  - Non-destructive: adds columns, does not modify or remove existing ones
  - Platform defaults to 'github' for new projects
*/

-- Add platform support to projects
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'platform') THEN
    ALTER TABLE projects ADD COLUMN platform text NOT NULL DEFAULT 'github' CHECK (platform IN ('github', 'gitlab'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'github_repo_full_name') THEN
    ALTER TABLE projects ADD COLUMN github_repo_full_name text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'github_installation_id') THEN
    ALTER TABLE projects ADD COLUMN github_installation_id text;
  END IF;
END $$;

-- Add GitHub Actions fields to failures
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'failures' AND column_name = 'workflow_run_id') THEN
    ALTER TABLE failures ADD COLUMN workflow_run_id bigint;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'failures' AND column_name = 'workflow_name') THEN
    ALTER TABLE failures ADD COLUMN workflow_name text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'failures' AND column_name = 'run_attempt') THEN
    ALTER TABLE failures ADD COLUMN run_attempt integer DEFAULT 1;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'failures' AND column_name = 'platform') THEN
    ALTER TABLE failures ADD COLUMN platform text NOT NULL DEFAULT 'github';
  END IF;
END $$;

-- Installations table
CREATE TABLE IF NOT EXISTS installations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  github_owner text NOT NULL,
  github_repo text NOT NULL,
  webhook_id text,
  webhook_secret text NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  github_token_encrypted text,
  is_active boolean DEFAULT true,
  events_received integer DEFAULT 0,
  last_event_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(github_owner, github_repo)
);

ALTER TABLE installations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_installations" ON installations;
CREATE POLICY "anon_select_installations" ON installations FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_installations" ON installations;
CREATE POLICY "anon_insert_installations" ON installations FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_installations" ON installations;
CREATE POLICY "anon_update_installations" ON installations FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_installations" ON installations;
CREATE POLICY "anon_delete_installations" ON installations FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_installations_repo ON installations(github_owner, github_repo);
CREATE INDEX IF NOT EXISTS idx_failures_workflow ON failures(workflow_run_id);
