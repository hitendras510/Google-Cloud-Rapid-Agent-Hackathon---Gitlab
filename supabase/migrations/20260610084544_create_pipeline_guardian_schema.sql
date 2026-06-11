/*
# PipelineGuardian Core Schema

1. New Tables
  - `projects` - Monitored GitLab projects
    - `id` (uuid, primary key)
    - `gitlab_project_id` (integer, GitLab project ID)
    - `name` (text, project name)
    - `namespace` (text, group/namespace path)
    - `team_id` (text, team identifier)
    - `tech_stack` (text[], technology tags like node, python, docker)
    - `webhook_secret` (text, webhook validation token)
    - `default_branch` (text, default main/master)
    - `created_at` (timestamp)

  - `failures` - Every captured pipeline failure
    - `id` (uuid, primary key)
    - `project_id` (uuid, FK to projects)
    - `pipeline_id` (bigint, GitLab pipeline ID)
    - `job_id` (bigint, GitLab job ID)
    - `job_name` (text, name of the failed job)
    - `stage` (text, pipeline stage)
    - `error_type` (text, classified: syntax/dependency/test/config_env/infra_runner/flaky_test)
    - `exit_code` (integer)
    - `signal_excerpt` (text, cleaned error signal)
    - `raw_log_url` (text, link to full log)
    - `confidence_score` (numeric 0-1)
    - `similarity_score` (numeric 0-1, top vector match)
    - `status` (text: diagnosing/fix_pending/auto_applied/escalated/reverted/resolved)
    - `fix_diff` (text, generated YAML diff)
    - `fix_mr_url` (text, MR link)
    - `fix_mr_id` (bigint)
    - `commit_sha` (text, triggering commit)
    - `commit_author` (text)
    - `branch` (text)
    - `time_to_fix_ms` (integer, milliseconds from detection to fix)
    - `retry_count` (integer, default 0)
    - `resolved_at` (timestamp)
    - `created_at` (timestamp)

  - `failure_traces` - Detailed step-by-step trace for provenance viewer
    - `id` (uuid, primary key)
    - `failure_id` (uuid, FK to failures)
    - `step_name` (text: watcher/classifier/memory_search/fix_generator/validator/action)
    - `step_order` (integer, 1-6)
    - `duration_ms` (integer)
    - `input_summary` (text)
    - `output_summary` (text)
    - `metadata` (jsonb, flexible per-step data)
    - `created_at` (timestamp)

  - `audit_logs` - Immutable hash-chained agent action log
    - `id` (uuid, primary key)
    - `failure_id` (uuid, FK to failures, nullable)
    - `agent_name` (text)
    - `action` (text)
    - `payload` (jsonb)
    - `prev_hash` (text)
    - `current_hash` (text)
    - `created_at` (timestamp)

  - `cost_logs` - Token usage and cost tracking
    - `id` (uuid, primary key)
    - `failure_id` (uuid, FK to failures, nullable)
    - `agent_name` (text)
    - `model` (text, e.g. gemini-2.5-flash)
    - `prompt_tokens` (integer)
    - `completion_tokens` (integer)
    - `usd_cost` (numeric)
    - `created_at` (timestamp)

  - `team_policies` - Per-team auto-apply rules
    - `id` (uuid, primary key)
    - `team_id` (text, unique)
    - `team_name` (text)
    - `auto_apply_threshold` (numeric, default 0.85)
    - `allowed_actions` (text: mr_only/mr_and_merge/comment_only)
    - `protected_branches` (text[])
    - `blast_radius_cap` (integer, max files)
    - `locale` (text, default en)
    - `quiet_hours_start` (time)
    - `quiet_hours_end` (time)
    - `slack_channel` (text)
    - `created_at` (timestamp)

  - `retry_budgets` - Per-pipeline retry limits
    - `id` (uuid, primary key)
    - `pipeline_id` (bigint)
    - `project_id` (uuid, FK to projects)
    - `attempts` (integer, default 0)
    - `max_attempts` (integer, default 3)
    - `last_attempt_at` (timestamp)
    - `expires_at` (timestamp)
    - `created_at` (timestamp)

2. Security
  - Enable RLS on all tables.
  - Allow anon + authenticated full CRUD (single-tenant demo dashboard, no user auth).

3. Indexes
  - failures: (project_id, created_at), (status), (error_type)
  - failure_traces: (failure_id, step_order)
  - audit_logs: (created_at), (failure_id)
  - cost_logs: (created_at), (failure_id)
*/

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gitlab_project_id integer NOT NULL,
  name text NOT NULL,
  namespace text,
  team_id text NOT NULL DEFAULT 'default',
  tech_stack text[] DEFAULT '{}',
  webhook_secret text,
  default_branch text DEFAULT 'main',
  created_at timestamptz DEFAULT now()
);

-- Failures table
CREATE TABLE IF NOT EXISTS failures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  pipeline_id bigint,
  job_id bigint,
  job_name text,
  stage text,
  error_type text CHECK (error_type IN ('syntax', 'dependency', 'test', 'config_env', 'infra_runner', 'flaky_test')),
  exit_code integer,
  signal_excerpt text,
  raw_log_url text,
  confidence_score numeric(4,3) CHECK (confidence_score >= 0 AND confidence_score <= 1),
  similarity_score numeric(4,3) CHECK (similarity_score >= 0 AND similarity_score <= 1),
  status text NOT NULL DEFAULT 'diagnosing' CHECK (status IN ('diagnosing', 'fix_pending', 'auto_applied', 'escalated', 'reverted', 'resolved')),
  fix_diff text,
  fix_mr_url text,
  fix_mr_id bigint,
  commit_sha text,
  commit_author text,
  branch text,
  time_to_fix_ms integer,
  retry_count integer DEFAULT 0,
  resolved_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Failure traces table
CREATE TABLE IF NOT EXISTS failure_traces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  failure_id uuid NOT NULL REFERENCES failures(id) ON DELETE CASCADE,
  step_name text NOT NULL CHECK (step_name IN ('watcher', 'classifier', 'memory_search', 'fix_generator', 'validator', 'action')),
  step_order integer NOT NULL CHECK (step_order >= 1 AND step_order <= 6),
  duration_ms integer,
  input_summary text,
  output_summary text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Audit logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  failure_id uuid REFERENCES failures(id) ON DELETE SET NULL,
  agent_name text NOT NULL,
  action text NOT NULL,
  payload jsonb DEFAULT '{}',
  prev_hash text,
  current_hash text,
  created_at timestamptz DEFAULT now()
);

-- Cost logs table
CREATE TABLE IF NOT EXISTS cost_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  failure_id uuid REFERENCES failures(id) ON DELETE SET NULL,
  agent_name text NOT NULL,
  model text NOT NULL DEFAULT 'gemini-2.5-flash',
  prompt_tokens integer NOT NULL DEFAULT 0,
  completion_tokens integer NOT NULL DEFAULT 0,
  usd_cost numeric(10,6) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Team policies table
CREATE TABLE IF NOT EXISTS team_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id text UNIQUE NOT NULL,
  team_name text NOT NULL,
  auto_apply_threshold numeric(3,2) DEFAULT 0.85 CHECK (auto_apply_threshold >= 0 AND auto_apply_threshold <= 1),
  allowed_actions text DEFAULT 'mr_only' CHECK (allowed_actions IN ('mr_only', 'mr_and_merge', 'comment_only')),
  protected_branches text[] DEFAULT '{main,production}',
  blast_radius_cap integer DEFAULT 5,
  locale text DEFAULT 'en',
  quiet_hours_start time,
  quiet_hours_end time,
  slack_channel text,
  created_at timestamptz DEFAULT now()
);

-- Retry budgets table
CREATE TABLE IF NOT EXISTS retry_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id bigint NOT NULL,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  attempts integer DEFAULT 0,
  max_attempts integer DEFAULT 3,
  last_attempt_at timestamptz,
  expires_at timestamptz DEFAULT (now() + interval '24 hours'),
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_failures_project_created ON failures(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_failures_status ON failures(status);
CREATE INDEX IF NOT EXISTS idx_failures_error_type ON failures(error_type);
CREATE INDEX IF NOT EXISTS idx_failure_traces_failure ON failure_traces(failure_id, step_order);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_failure ON audit_logs(failure_id);
CREATE INDEX IF NOT EXISTS idx_cost_logs_created ON cost_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cost_logs_failure ON cost_logs(failure_id);

-- Enable RLS on all tables
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE failures ENABLE ROW LEVEL SECURITY;
ALTER TABLE failure_traces ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE retry_budgets ENABLE ROW LEVEL SECURITY;

-- RLS Policies (single-tenant, open access for demo dashboard)
DROP POLICY IF EXISTS "anon_select_projects" ON projects;
CREATE POLICY "anon_select_projects" ON projects FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_projects" ON projects;
CREATE POLICY "anon_insert_projects" ON projects FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_projects" ON projects;
CREATE POLICY "anon_update_projects" ON projects FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_projects" ON projects;
CREATE POLICY "anon_delete_projects" ON projects FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_select_failures" ON failures;
CREATE POLICY "anon_select_failures" ON failures FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_failures" ON failures;
CREATE POLICY "anon_insert_failures" ON failures FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_failures" ON failures;
CREATE POLICY "anon_update_failures" ON failures FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_failures" ON failures;
CREATE POLICY "anon_delete_failures" ON failures FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_select_failure_traces" ON failure_traces;
CREATE POLICY "anon_select_failure_traces" ON failure_traces FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_failure_traces" ON failure_traces;
CREATE POLICY "anon_insert_failure_traces" ON failure_traces FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_failure_traces" ON failure_traces;
CREATE POLICY "anon_update_failure_traces" ON failure_traces FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_failure_traces" ON failure_traces;
CREATE POLICY "anon_delete_failure_traces" ON failure_traces FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_select_audit_logs" ON audit_logs;
CREATE POLICY "anon_select_audit_logs" ON audit_logs FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_audit_logs" ON audit_logs;
CREATE POLICY "anon_insert_audit_logs" ON audit_logs FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_audit_logs" ON audit_logs;
CREATE POLICY "anon_update_audit_logs" ON audit_logs FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_audit_logs" ON audit_logs;
CREATE POLICY "anon_delete_audit_logs" ON audit_logs FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_select_cost_logs" ON cost_logs;
CREATE POLICY "anon_select_cost_logs" ON cost_logs FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_cost_logs" ON cost_logs;
CREATE POLICY "anon_insert_cost_logs" ON cost_logs FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_cost_logs" ON cost_logs;
CREATE POLICY "anon_update_cost_logs" ON cost_logs FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_cost_logs" ON cost_logs;
CREATE POLICY "anon_delete_cost_logs" ON cost_logs FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_select_team_policies" ON team_policies;
CREATE POLICY "anon_select_team_policies" ON team_policies FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_team_policies" ON team_policies;
CREATE POLICY "anon_insert_team_policies" ON team_policies FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_team_policies" ON team_policies;
CREATE POLICY "anon_update_team_policies" ON team_policies FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_team_policies" ON team_policies;
CREATE POLICY "anon_delete_team_policies" ON team_policies FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_select_retry_budgets" ON retry_budgets;
CREATE POLICY "anon_select_retry_budgets" ON retry_budgets FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_retry_budgets" ON retry_budgets;
CREATE POLICY "anon_insert_retry_budgets" ON retry_budgets FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_retry_budgets" ON retry_budgets;
CREATE POLICY "anon_update_retry_budgets" ON retry_budgets FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_retry_budgets" ON retry_budgets;
CREATE POLICY "anon_delete_retry_budgets" ON retry_budgets FOR DELETE TO anon, authenticated USING (true);
