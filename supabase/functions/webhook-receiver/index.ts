import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey, X-Gitlab-Token, X-Gitlab-Event",
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
    const body = await req.json();

    if (event === "Pipeline Hook" && body.object_attributes?.status === "failed") {
      const pipeline = body.object_attributes;
      const project = body.project;
      const commit = body.commit || {};

      // Find or create project
      let { data: existingProject } = await supabase
        .from("projects")
        .select("id")
        .eq("gitlab_project_id", project.id)
        .maybeSingle();

      if (!existingProject) {
        const { data: newProject } = await supabase
          .from("projects")
          .insert({
            gitlab_project_id: project.id,
            name: project.name,
            namespace: project.namespace || project.path_with_namespace,
          })
          .select("id")
          .single();
        existingProject = newProject;
      }

      if (!existingProject) {
        return new Response(
          JSON.stringify({ error: "Could not create project" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Insert failure record
      const { data: failure, error } = await supabase
        .from("failures")
        .insert({
          project_id: existingProject.id,
          pipeline_id: pipeline.id,
          job_name: "pending-classification",
          stage: "pending",
          status: "diagnosing",
          commit_sha: commit.sha || pipeline.sha,
          commit_author: commit.author?.name || "unknown",
          branch: pipeline.ref || "main",
        })
        .select("id")
        .single();

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Log the webhook receipt in audit
      await supabase.from("audit_logs").insert({
        failure_id: failure.id,
        agent_name: "webhook-receiver",
        action: "pipeline_failure_received",
        payload: {
          pipeline_id: pipeline.id,
          project_name: project.name,
          ref: pipeline.ref,
          commit_sha: commit.sha,
        },
      });

      return new Response(
        JSON.stringify({
          success: true,
          failure_id: failure.id,
          message: "Pipeline failure captured, agent orchestration initiated",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle MR Hook for prediction (Enhancement #08)
    if (event === "Merge Request Hook" && body.object_attributes?.action === "open") {
      return new Response(
        JSON.stringify({
          success: true,
          message: "MR prediction endpoint - would analyze diff for failure prediction",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ message: "Event received but no action taken", event }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
