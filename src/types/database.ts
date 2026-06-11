export interface Project {
  id: string;
  gitlab_project_id: number;
  name: string;
  namespace: string | null;
  team_id: string;
  tech_stack: string[];
  webhook_secret: string | null;
  default_branch: string;
  created_at: string;
}

export interface Failure {
  id: string;
  project_id: string;
  pipeline_id: number;
  job_id: number;
  job_name: string;
  stage: string;
  error_type: 'syntax' | 'dependency' | 'test' | 'config_env' | 'infra_runner' | 'flaky_test';
  exit_code: number;
  signal_excerpt: string;
  raw_log_url: string | null;
  confidence_score: number;
  similarity_score: number;
  status: 'diagnosing' | 'fix_pending' | 'auto_applied' | 'escalated' | 'reverted' | 'resolved';
  fix_diff: string | null;
  fix_mr_url: string | null;
  fix_mr_id: number | null;
  commit_sha: string;
  commit_author: string;
  branch: string;
  time_to_fix_ms: number;
  retry_count: number;
  resolved_at: string | null;
  created_at: string;
  projects?: Project;
}

export interface FailureTrace {
  id: string;
  failure_id: string;
  step_name: 'watcher' | 'classifier' | 'memory_search' | 'fix_generator' | 'validator' | 'action';
  step_order: number;
  duration_ms: number;
  input_summary: string;
  output_summary: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface AuditLog {
  id: string;
  failure_id: string | null;
  agent_name: string;
  action: string;
  payload: Record<string, unknown>;
  prev_hash: string | null;
  current_hash: string | null;
  created_at: string;
}

export interface CostLog {
  id: string;
  failure_id: string | null;
  agent_name: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  usd_cost: number;
  created_at: string;
}

export interface TeamPolicy {
  id: string;
  team_id: string;
  team_name: string;
  auto_apply_threshold: number;
  allowed_actions: 'mr_only' | 'mr_and_merge' | 'comment_only';
  protected_branches: string[];
  blast_radius_cap: number;
  locale: string;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  slack_channel: string | null;
  created_at: string;
}

export interface RetryBudget {
  id: string;
  pipeline_id: number;
  project_id: string;
  attempts: number;
  max_attempts: number;
  last_attempt_at: string | null;
  expires_at: string;
  created_at: string;
}
