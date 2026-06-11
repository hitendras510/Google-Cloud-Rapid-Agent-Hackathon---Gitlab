import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-Gitlab-Event, X-Gitlab-Token",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const event = req.headers.get("X-Gitlab-Event");
    const secretToken = req.headers.get("X-Gitlab-Token");
    const rawBody = await req.text();
    const body = JSON.parse(rawBody);

    if (event === "Pipeline Hook" && body.object_attributes?.status === "failed") {
      const pipeline = body.object_attributes;
      const project = body.project;
      const projectId = String(project.id);

      // Verify token if installation exists
      const { data: installation } = await supabase
        .from("gitlab_installations")
        .select("*")
        .eq("gitlab_project_id", projectId)
        .maybeSingle();

      if (installation?.webhook_secret && secretToken && secretToken !== installation.webhook_secret) {
        return new Response(JSON.stringify({ error: "Invalid webhook token" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Find or create project record
      let { data: projectRecord } = await supabase
        .from("projects")
        .select("id")
        .eq("gitlab_project_id", project.id)
        .eq("platform", "gitlab")
        .maybeSingle();

      if (!projectRecord) {
        const { data: newProject } = await supabase
          .from("projects")
          .insert({
            gitlab_project_id: project.id,
            name: project.name,
            namespace: project.namespace || project.path_with_namespace?.split("/")[0] || "unknown",
            platform: "gitlab",
            team_id: "default",
          })
          .select("id")
          .single();
        projectRecord = newProject;
      }

      if (!projectRecord) {
        return new Response(JSON.stringify({ error: "Could not create project" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const failedJobs = (body.builds || []).filter((b: { status: string }) => b.status === "failed");
      const primaryJob = failedJobs[0] || { name: "unknown", stage: "unknown" };
      const branch = pipeline.ref || "main";
      const commitAuthor = body.user?.name || body.user?.username || "unknown";

      const { data: failure, error: insertError } = await supabase
        .from("failures")
        .insert({
          project_id: projectRecord.id,
          pipeline_id: pipeline.id,
          job_name: primaryJob.name,
          stage: primaryJob.stage,
          status: "diagnosing",
          commit_sha: pipeline.sha,
          commit_author: commitAuthor,
          branch,
          platform: "gitlab",
          raw_log_url: `${project.web_url}/-/pipelines/${pipeline.id}`,
          exit_code: primaryJob.exit_code || null,
        })
        .select("id")
        .single();

      if (insertError) {
        return new Response(JSON.stringify({ error: insertError.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Update installation stats + write audit log in parallel
      await Promise.all([
        installation
          ? supabase.from("gitlab_installations").update({
              events_received: (installation.events_received || 0) + 1,
              last_event_at: new Date().toISOString(),
            }).eq("id", installation.id)
          : Promise.resolve(),
        supabase.from("audit_logs").insert({
          failure_id: failure.id,
          agent_name: "gitlab-webhook",
          action: "pipeline_failure_received",
          payload: {
            pipeline_id: pipeline.id,
            project: project.path_with_namespace,
            branch,
            failed_jobs: failedJobs.map((j: { name: string; stage: string }) => ({ name: j.name, stage: j.stage })),
          },
        }),
      ]);

      // Fire-and-forget orchestrator
      fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/agent-orchestrator`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({ failure_id: failure.id }),
      }).catch(() => {});

      return new Response(
        JSON.stringify({ success: true, failure_id: failure.id, pipeline_id: pipeline.id, project: project.path_with_namespace }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (event === "Merge Request Hook" && body.object_attributes?.action === "open") {
      return new Response(
        JSON.stringify({ success: true, message: "MR opened — predictive analysis noted." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ message: "Event received", event, hint: "Listens for: Pipeline Hook (status=failed)" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
