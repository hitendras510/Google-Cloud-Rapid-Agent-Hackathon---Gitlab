import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { createHmac } from "node:crypto";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey, X-GitHub-Event, X-Hub-Signature-256, X-GitHub-Delivery",
};

function verifySignature(payload: string, signature: string, secret: string): boolean {
  const hmac = createHmac("sha256", secret);
  const digest = "sha256=" + hmac.update(payload).digest("hex");
  return digest === signature;
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

    const event = req.headers.get("X-GitHub-Event");
    const signature = req.headers.get("X-Hub-Signature-256");
    const deliveryId = req.headers.get("X-GitHub-Delivery");
    const rawBody = await req.text();
    const body = JSON.parse(rawBody);

    // Handle ping event (GitHub sends this when webhook is first configured)
    if (event === "ping") {
      return new Response(
        JSON.stringify({ success: true, message: "Pong! Webhook configured successfully.", delivery_id: deliveryId }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle workflow_run event (GitHub Actions pipeline failure)
    if (event === "workflow_run" && body.action === "completed" && body.workflow_run?.conclusion === "failure") {
      const run = body.workflow_run;
      const repo = body.repository;

      // Verify webhook signature if installation exists
      const { data: installation } = await supabase
        .from("installations")
        .select("*")
        .eq("github_owner", repo.owner.login)
        .eq("github_repo", repo.name)
        .maybeSingle();

      if (installation && signature) {
        const isValid = verifySignature(rawBody, signature, installation.webhook_secret);
        if (!isValid) {
          return new Response(
            JSON.stringify({ error: "Invalid webhook signature" }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      // Find or create project
      let { data: project } = await supabase
        .from("projects")
        .select("id")
        .eq("github_repo_full_name", repo.full_name)
        .maybeSingle();

      if (!project) {
        const { data: newProject } = await supabase
          .from("projects")
          .insert({
            gitlab_project_id: repo.id,
            name: repo.name,
            namespace: repo.owner.login,
            platform: "github",
            github_repo_full_name: repo.full_name,
            team_id: "default",
          })
          .select("id")
          .single();
        project = newProject;
      }

      if (!project) {
        return new Response(
          JSON.stringify({ error: "Could not create project" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Extract failed job info from the workflow run
      const jobName = run.name || "workflow";
      const branch = run.head_branch || "main";
      const commitSha = run.head_sha;
      const commitAuthor = run.head_commit?.author?.name || run.actor?.login || "unknown";

      // Insert failure record
      const { data: failure, error: insertError } = await supabase
        .from("failures")
        .insert({
          project_id: project.id,
          pipeline_id: run.id,
          workflow_run_id: run.id,
          workflow_name: run.name,
          run_attempt: run.run_attempt || 1,
          job_name: jobName,
          stage: "github-actions",
          status: "diagnosing",
          commit_sha: commitSha,
          commit_author: commitAuthor,
          branch,
          platform: "github",
          raw_log_url: `https://github.com/${repo.full_name}/actions/runs/${run.id}`,
        })
        .select("id")
        .single();

      if (insertError) {
        return new Response(
          JSON.stringify({ error: insertError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Update installation stats
      if (installation) {
        await supabase
          .from("installations")
          .update({
            events_received: (installation.events_received || 0) + 1,
            last_event_at: new Date().toISOString(),
          })
          .eq("id", installation.id);
      }

      // Log the webhook receipt
      await supabase.from("audit_logs").insert({
        failure_id: failure.id,
        agent_name: "github-webhook",
        action: "workflow_failure_received",
        payload: {
          delivery_id: deliveryId,
          workflow_run_id: run.id,
          repo: repo.full_name,
          branch,
          commit_sha: commitSha,
          workflow_name: run.name,
          run_url: run.html_url,
        },
      });

      // Trigger the agent orchestrator
      const orchestratorUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/agent-orchestrator`;
      fetch(orchestratorUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({ failure_id: failure.id }),
      }).catch(() => {});

      return new Response(
        JSON.stringify({
          success: true,
          failure_id: failure.id,
          message: "GitHub Actions failure captured. Agent pipeline initiated.",
          workflow_run: run.name,
          repo: repo.full_name,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle check_run event (individual job failures)
    if (event === "check_run" && body.action === "completed" && body.check_run?.conclusion === "failure") {
      const checkRun = body.check_run;
      const repo = body.repository;

      return new Response(
        JSON.stringify({
          success: true,
          message: "Check run failure noted. Use workflow_run events for full pipeline tracking.",
          check_run_name: checkRun.name,
          repo: repo.full_name,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        message: "Event received but no action taken",
        event,
        action: body.action,
        hint: "PipelineGuardian listens for: workflow_run (completed+failure), ping",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
