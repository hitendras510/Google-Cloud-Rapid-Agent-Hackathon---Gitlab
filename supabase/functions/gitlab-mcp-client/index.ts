import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// -------------------------------------------------------------------
// GitLab MCP HTTP transport client
// Spec: https://modelcontextprotocol.io/docs/concepts/transports
// GitLab MCP endpoint: https://<instance>/api/v4/mcp
// -------------------------------------------------------------------

interface MCPRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface MCPToolCallParams {
  name: string;
  arguments: Record<string, unknown>;
}

let _reqId = 1;

async function mcpCall(
  instanceUrl: string,
  token: string,
  method: string,
  params?: Record<string, unknown>
): Promise<unknown> {
  const body: MCPRequest = { jsonrpc: "2.0", id: _reqId++, method, params };

  const res = await fetch(`${instanceUrl}/api/v4/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`MCP ${res.status}: ${errText.slice(0, 200)}`);
  }

  const contentType = res.headers.get("content-type") || "";

  // Handle SSE stream (some MCP servers return SSE even for non-streaming calls)
  if (contentType.includes("text/event-stream")) {
    const text = await res.text();
    // Parse the last "data:" line that contains the JSON-RPC response
    const lines = text.split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (line.startsWith("data:")) {
        try {
          const json = JSON.parse(line.slice(5).trim());
          if (json.result !== undefined) return json.result;
          if (json.error) throw new Error(`MCP error: ${JSON.stringify(json.error)}`);
        } catch {
          // continue searching
        }
      }
    }
    throw new Error("No valid MCP response in SSE stream");
  }

  const json = await res.json();
  if (json.error) throw new Error(`MCP error: ${JSON.stringify(json.error)}`);
  return json.result;
}

// Convenience wrapper for tool calls
async function mcpTool(
  instanceUrl: string,
  token: string,
  toolName: string,
  args: Record<string, unknown>
): Promise<unknown> {
  return mcpCall(instanceUrl, token, "tools/call", {
    name: toolName,
    arguments: args,
  } as unknown as Record<string, unknown>);
}

// List available tools (for health check / verification)
async function mcpListTools(instanceUrl: string, token: string): Promise<unknown> {
  return mcpCall(instanceUrl, token, "tools/list");
}

// -------------------------------------------------------------------
// Main handler
// -------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const { tool, args = {}, failure_id, action } = body;

    // ------- Health check: list available MCP tools -------
    if (action === "list_tools" || tool === "list_tools") {
      const instanceUrl = body.instance_url || "https://gitlab.com";
      const token = body.token || Deno.env.get("GITLAB_TOKEN");
      if (!token) {
        return new Response(
          JSON.stringify({ error: "No GitLab token. Pass 'token' or set GITLAB_TOKEN secret." }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const tools = await mcpListTools(instanceUrl, token);
      return new Response(JSON.stringify({ success: true, tools }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ------- Failure-linked MCP actions -------
    if (failure_id) {
      const { data: failure } = await supabase
        .from("failures")
        .select("*, projects(name, namespace, gitlab_project_id)")
        .eq("id", failure_id)
        .maybeSingle();

      if (!failure) {
        return new Response(JSON.stringify({ error: "Failure not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const projectId = String(failure.projects?.gitlab_project_id);

      const { data: installation } = await supabase
        .from("gitlab_installations")
        .select("access_token_encrypted, gitlab_instance_url")
        .eq("gitlab_project_id", projectId)
        .maybeSingle();

      const token = installation?.access_token_encrypted || Deno.env.get("GITLAB_TOKEN");
      const instanceUrl = installation?.gitlab_instance_url || "https://gitlab.com";

      if (!token) {
        return new Response(
          JSON.stringify({ error: "No GitLab token configured for this project." }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // get_pipeline_jobs via MCP
      if (action === "get_pipeline_jobs") {
        const result = await mcpTool(instanceUrl, token, "get_pipeline_jobs", {
          id: projectId,
          pipeline_id: failure.pipeline_id,
        });
        return new Response(JSON.stringify({ success: true, result }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // manage_pipeline (retry) via MCP
      if (action === "retry_pipeline") {
        const result = await mcpTool(instanceUrl, token, "manage_pipeline", {
          id: projectId,
          pipeline_id: failure.pipeline_id,
          retry: true,
        });
        await supabase.from("audit_logs").insert({
          failure_id, agent_name: "gitlab-mcp-client", action: "pipeline_retry_via_mcp",
          payload: { mcp_tool: "manage_pipeline", pipeline_id: failure.pipeline_id },
        });
        return new Response(JSON.stringify({ success: true, result }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // create_merge_request via MCP
      if (action === "create_mr") {
        const fixBranch = `pipelineguardian/fix-${failure.pipeline_id}`;
        const baseBranch = failure.projects?.default_branch || "main";

        const result = await mcpTool(instanceUrl, token, "create_merge_request", {
          id: projectId,
          title: `[PipelineGuardian] Fix ${failure.error_type} in ${failure.job_name}`,
          source_branch: fixBranch,
          target_branch: baseBranch,
          description: `## PipelineGuardian Auto-Fix\n\n**Pipeline:** #${failure.pipeline_id}\n**Job:** \`${failure.job_name}\` (stage: ${failure.stage})\n**Error Type:** ${failure.error_type}\n**Confidence:** ${((failure.confidence_score || 0) * 100).toFixed(0)}%\n\n> Generated via GitLab MCP \`create_merge_request\` tool`,
        }) as { web_url?: string; iid?: number };

        if (result?.web_url) {
          await Promise.all([
            supabase.from("failures").update({ fix_mr_url: result.web_url, fix_mr_id: result.iid, status: "auto_applied" }).eq("id", failure_id),
            supabase.from("audit_logs").insert({ failure_id, agent_name: "gitlab-mcp-client", action: "mr_created_via_mcp", payload: { mcp_tool: "create_merge_request", mr_url: result.web_url } }),
          ]);
        }
        return new Response(JSON.stringify({ success: true, result }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // create_issue (escalation) via MCP
      if (action === "create_issue") {
        const result = await mcpTool(instanceUrl, token, "create_issue", {
          id: projectId,
          title: `[PipelineGuardian] Unresolved failure: ${failure.job_name} (confidence too low)`,
          description: `## Needs Human Review\n\n**Pipeline:** #${failure.pipeline_id} on \`${failure.branch}\`\n**Error Type:** ${failure.error_type}\n**Confidence:** ${((failure.confidence_score || 0) * 100).toFixed(0)}%\n\n### Signal\n\`\`\`\n${(failure.signal_excerpt || "").slice(-400)}\n\`\`\`\n\n> Escalated by PipelineGuardian via GitLab MCP \`create_issue\``,
          labels: ["pipelineguardian", "ci-failure"],
        });
        return new Response(JSON.stringify({ success: true, result }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // semantic_code_search via MCP
      if (action === "semantic_search") {
        const result = await mcpTool(instanceUrl, token, "semantic_code_search", {
          project_id: projectId,
          semantic_query: args.query || `${failure.error_type} error in ${failure.job_name}`,
        });
        return new Response(JSON.stringify({ success: true, result }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // search MRs/issues for similar past failures
      if (action === "search_similar") {
        const result = await mcpTool(instanceUrl, token, "search", {
          scope: "merge_requests",
          search: `PipelineGuardian ${failure.error_type}`,
          project_id: projectId,
          state: "merged",
          per_page: 5,
        });
        return new Response(JSON.stringify({ success: true, result }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // ------- Direct MCP tool call (for testing / advanced use) -------
    if (tool && args) {
      const instanceUrl = body.instance_url || "https://gitlab.com";
      const token = body.token || Deno.env.get("GITLAB_TOKEN");
      if (!token) {
        return new Response(JSON.stringify({ error: "No token provided" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const result = await mcpTool(instanceUrl, token, tool, args);
      return new Response(JSON.stringify({ success: true, result }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(
      JSON.stringify({
        message: "GitLab MCP Client",
        available_actions: ["list_tools", "get_pipeline_jobs", "retry_pipeline", "create_mr", "create_issue", "semantic_search", "search_similar"],
        usage: "Pass { failure_id, action } or { tool, args, token } or { action: 'list_tools', token }",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
