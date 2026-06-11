import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface GitHubApiOptions {
  token: string;
  method?: string;
  path: string;
  body?: Record<string, unknown>;
}

async function githubApi({ token, method = "GET", path, body }: GitHubApiOptions) {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "PipelineGuardian/1.0",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`GitHub API ${res.status}: ${errText}`);
  }
  return res.json();
}

async function fetchWorkflowLogs(token: string, owner: string, repo: string, runId: number): Promise<string> {
  // Get the jobs for this workflow run
  const jobs = await githubApi({
    token,
    path: `/repos/${owner}/${repo}/actions/runs/${runId}/jobs`,
  });

  // Find the failed job
  const failedJob = jobs.jobs?.find((j: { conclusion: string }) => j.conclusion === "failure");
  if (!failedJob) return "No failed job found in workflow run.";

  // Fetch logs for the failed job
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/actions/jobs/${failedJob.id}/logs`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "PipelineGuardian/1.0",
      },
    }
  );

  if (!res.ok) {
    return `Could not fetch logs (${res.status}). Job: ${failedJob.name}, Step: ${failedJob.steps?.find((s: { conclusion: string }) => s.conclusion === "failure")?.name || "unknown"}`;
  }

  const logText = await res.text();
  // Extract last 100 lines (most relevant for error)
  const lines = logText.split("\n");
  return lines.slice(-100).join("\n");
}

async function createFixPR(
  token: string,
  owner: string,
  repo: string,
  baseBranch: string,
  fixBranch: string,
  title: string,
  body: string,
  files: Array<{ path: string; content: string }>
) {
  // Get the base branch SHA
  const baseRef = await githubApi({ token, path: `/repos/${owner}/${repo}/git/ref/heads/${baseBranch}` });
  const baseSha = baseRef.object.sha;

  // Create a new branch
  await githubApi({
    token,
    method: "POST",
    path: `/repos/${owner}/${repo}/git/refs`,
    body: { ref: `refs/heads/${fixBranch}`, sha: baseSha },
  });

  // Commit files to the new branch
  for (const file of files) {
    // Get current file (if exists) for the sha
    let fileSha: string | undefined;
    try {
      const existing = await githubApi({ token, path: `/repos/${owner}/${repo}/contents/${file.path}?ref=${fixBranch}` });
      fileSha = existing.sha;
    } catch {
      // File doesn't exist yet
    }

    await githubApi({
      token,
      method: "PUT",
      path: `/repos/${owner}/${repo}/contents/${file.path}`,
      body: {
        message: `fix: ${title}`,
        content: btoa(file.content),
        branch: fixBranch,
        ...(fileSha ? { sha: fileSha } : {}),
      },
    });
  }

  // Create the Pull Request
  const pr = await githubApi({
    token,
    method: "POST",
    path: `/repos/${owner}/${repo}/pulls`,
    body: {
      title: `[PipelineGuardian] ${title}`,
      body,
      head: fixBranch,
      base: baseBranch,
    },
  });

  return pr;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { action, failure_id } = await req.json();

    if (!failure_id) {
      return new Response(
        JSON.stringify({ error: "failure_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Load failure + project + installation
    const { data: failure } = await supabase
      .from("failures")
      .select("*, projects(id, name, namespace, github_repo_full_name, default_branch)")
      .eq("id", failure_id)
      .maybeSingle();

    if (!failure) {
      return new Response(
        JSON.stringify({ error: "Failure not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const repoFullName = failure.projects?.github_repo_full_name;
    if (!repoFullName) {
      return new Response(
        JSON.stringify({ error: "No GitHub repo linked to this project" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const [owner, repo] = repoFullName.split("/");

    // Get installation token
    const { data: installation } = await supabase
      .from("installations")
      .select("github_token_encrypted")
      .eq("github_owner", owner)
      .eq("github_repo", repo)
      .maybeSingle();

    const token = installation?.github_token_encrypted || Deno.env.get("GITHUB_TOKEN");
    if (!token) {
      return new Response(
        JSON.stringify({ error: "No GitHub token configured. Add your PAT in Settings > Integrations." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Action: fetch_logs
    if (action === "fetch_logs") {
      const logs = await fetchWorkflowLogs(token, owner, repo, failure.workflow_run_id);

      // Update failure with signal excerpt
      const excerpt = logs.slice(-2000);
      await supabase.from("failures").update({ signal_excerpt: excerpt }).eq("id", failure_id);

      return new Response(
        JSON.stringify({ success: true, logs_length: logs.length, excerpt: excerpt.slice(-500) }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Action: create_pr
    if (action === "create_pr") {
      const { fix_files, fix_title, fix_description } = await req.json().catch(() => ({}));

      if (!failure.fix_diff) {
        return new Response(
          JSON.stringify({ error: "No fix generated yet for this failure" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const fixBranch = `pipelineguardian/fix-${failure.pipeline_id}`;
      const baseBranch = failure.projects?.default_branch || "main";

      const prBody = `## PipelineGuardian Auto-Fix

**Failure:** ${failure.workflow_name || failure.job_name} on \`${failure.branch}\`
**Error Type:** ${failure.error_type}
**Confidence Score:** ${(failure.confidence_score * 100).toFixed(0)}%
**Similarity to Past Fix:** ${(failure.similarity_score * 100).toFixed(0)}%

### Signal Excerpt
\`\`\`
${(failure.signal_excerpt || "").slice(-500)}
\`\`\`

### Fix Applied
\`\`\`diff
${failure.fix_diff}
\`\`\`

---
*Generated by PipelineGuardian CI/CD Agent*`;

      const pr = await createFixPR(
        token,
        owner,
        repo,
        baseBranch,
        fixBranch,
        fix_title || `Fix ${failure.error_type} in ${failure.job_name}`,
        prBody,
        fix_files || []
      );

      // Update failure with PR info
      await supabase.from("failures").update({
        fix_mr_url: pr.html_url,
        fix_mr_id: pr.number,
        status: "auto_applied",
      }).eq("id", failure_id);

      await supabase.from("audit_logs").insert({
        failure_id,
        agent_name: "github-pr-creator",
        action: "pr_created",
        payload: { pr_number: pr.number, pr_url: pr.html_url, branch: fixBranch },
      });

      return new Response(
        JSON.stringify({ success: true, pr_url: pr.html_url, pr_number: pr.number }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Action: rerun_workflow
    if (action === "rerun_workflow") {
      await githubApi({
        token,
        method: "POST",
        path: `/repos/${owner}/${repo}/actions/runs/${failure.workflow_run_id}/rerun`,
      });

      await supabase.from("audit_logs").insert({
        failure_id,
        agent_name: "github-pr-creator",
        action: "workflow_rerun_triggered",
        payload: { workflow_run_id: failure.workflow_run_id },
      });

      return new Response(
        JSON.stringify({ success: true, message: "Workflow re-run triggered" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Unknown action. Use: fetch_logs, create_pr, rerun_workflow" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
