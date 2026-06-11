"""
agent.py — PipelineGuardian ADK Agent Layer
============================================
Main entry point for the Google ADK integration.

Architecture: SequentialAgent of 6 LlmAgents
  1. pipeline_watcher    — fetches failed job log via GitLab MCP
  2. failure_classifier  — classifies error type + confidence
  3. memory_searcher     — vector-similarity search in Supabase
  4. fix_generator       — generates .gitlab-ci.yml unified diff
  5. pre_flight_validator— validates YAML syntax + CI lint
  6. action_agent        — creates MR / notifies author / escalates

MCP Connection: GitLab MCP over HTTP/SSE (ADK 2.2.0+ pattern)
  url  = GITLAB_MCP_URL  (default: https://gitlab.com/api/v4/mcp)
  auth = Bearer GITLAB_TOKEN

Usage (ADK web UI):
  export GOOGLE_API_KEY=... GITLAB_TOKEN=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...
  uv run adk web

Usage (CLI runner):
  python -m adk_agents.main --failure-id <uuid>
"""

import os

from google.adk.agents import LlmAgent, SequentialAgent
from google.adk.tools.mcp_tool.mcp_toolset import MCPToolset, SseConnectionParams

from .prompts import (
    ACTION_AGENT_PROMPT,
    FAILURE_CLASSIFIER_PROMPT,
    FIX_GENERATOR_PROMPT,
    MEMORY_SEARCHER_PROMPT,
    PIPELINE_WATCHER_PROMPT,
    PRE_FLIGHT_VALIDATOR_PROMPT,
)
from .tools import (
    check_lint_ci,
    create_failure_trace,
    fetch_job_log,
    log_escalation,
    notify_author,
    query_similar_failures,
    update_failure_record,
    validate_yaml,
    write_audit_log,
)

# ── Model ─────────────────────────────────────────────────────────────────────
_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")

# ── MCP Toolsets — one per agent that needs GitLab MCP tools ──────────────────
# In ADK 2.2.0, MCPToolset is passed directly as `tools=[toolset]` inside
# LlmAgent. Each agent gets its own toolset instance with a tool_filter so
# only the relevant MCP tools are exposed to each agent.
#
# Docs: https://google.github.io/adk-docs/tools/mcp-tools/


def _make_mcp_toolset(tool_filter: list[str] | None = None) -> MCPToolset:
    """
    Create an MCPToolset connected to the GitLab MCP server over SSE.

    Args:
        tool_filter: Optional list of tool names to expose.
                     None = expose all available tools.
    Returns:
        MCPToolset instance (connection is lazy — opens on first invocation).
    """
    gitlab_token = os.environ.get("GITLAB_TOKEN", "")
    gitlab_mcp_url = os.environ.get("GITLAB_MCP_URL", "https://gitlab.com/api/v4/mcp")

    return MCPToolset(
        connection_params=SseConnectionParams(
            url=gitlab_mcp_url,
            headers={"Authorization": f"Bearer {gitlab_token}"},
        ),
        # tool_filter restricts which MCP tools this agent can call
        tool_filter=tool_filter or [],
    )


# ── Build the SequentialAgent ─────────────────────────────────────────────────
# Each MCPToolset is scoped to the tools its agent actually needs.
# Plain Python function tools (from tools/) are passed alongside MCP toolsets.


def build_root_agent() -> SequentialAgent:
    """
    Build the full PipelineGuardian SequentialAgent.

    MCPToolset connections are lazy — they open on first tool invocation,
    so this function is safe to call at import time (no network I/O).

    Returns:
        SequentialAgent (root_agent) ready for ADK discovery.
    """

    # ── Agent 1: Pipeline Watcher ─────────────────────────────────────────────
    pipeline_watcher = LlmAgent(
        name="pipeline_watcher",
        model=_MODEL,
        instruction=PIPELINE_WATCHER_PROMPT,
        description=(
            "Calls GitLab MCP to fetch pipeline jobs, identifies the failed job, "
            "retrieves its raw log, and extracts the last 500-char error signal."
        ),
        tools=[
            # GitLab MCP: list jobs for a pipeline
            _make_mcp_toolset(tool_filter=["get_pipeline_jobs"]),
            # GitLab REST: download raw job trace
            fetch_job_log,
        ],
    )

    # ── Agent 2: Failure Classifier ───────────────────────────────────────────
    failure_classifier = LlmAgent(
        name="failure_classifier",
        model=_MODEL,
        instruction=FAILURE_CLASSIFIER_PROMPT,
        description=(
            "Classifies the CI failure into one of 6 categories "
            "(syntax|dependency|test|config_env|infra_runner|flaky_test) "
            "with a confidence score 0.0–1.0."
        ),
        tools=[],  # Pure Gemini reasoning — no external tools needed
    )

    # ── Agent 3: Memory Searcher ──────────────────────────────────────────────
    memory_searcher = LlmAgent(
        name="memory_searcher",
        model=_MODEL,
        instruction=MEMORY_SEARCHER_PROMPT,
        description=(
            "Queries Supabase via pgvector similarity search (match_failures RPC) "
            "to find past resolved failures similar to the current one."
        ),
        tools=[query_similar_failures],
    )

    # ── Agent 4: Fix Generator ────────────────────────────────────────────────
    fix_generator = LlmAgent(
        name="fix_generator",
        model=_MODEL,
        instruction=FIX_GENERATOR_PROMPT,
        description=(
            "Generates a minimal .gitlab-ci.yml unified diff that fixes the root "
            "cause, adapting from past memory-search fixes when available."
        ),
        tools=[],  # Pure Gemini generation — no external tools needed
    )

    # ── Agent 5: Pre-Flight Validator ─────────────────────────────────────────
    pre_flight_validator = LlmAgent(
        name="pre_flight_validator",
        model=_MODEL,
        instruction=PRE_FLIGHT_VALIDATOR_PROMPT,
        description=(
            "Validates the generated fix: YAML syntax (PyYAML), "
            "GitLab CI lint (REST + MCP lint_ci), and accidental secret exposure check."
        ),
        tools=[
            validate_yaml,   # Local PyYAML parse
            check_lint_ci,   # GitLab REST /ci/lint endpoint
            _make_mcp_toolset(tool_filter=["lint_ci"]),
        ],
    )

    # ── Agent 6: Action Agent ─────────────────────────────────────────────────
    action_agent = LlmAgent(
        name="action_agent",
        model=_MODEL,
        instruction=ACTION_AGENT_PROMPT,
        description=(
            "Final decision-maker: "
            "confidence ≥ 0.85 → create MR via GitLab MCP; "
            "0.60–0.85 → notify commit author; "
            "< 0.60 → create GitLab issue. "
            "Always persists result to Supabase."
        ),
        tools=[
            # GitLab MCP: create MR / issue / retry pipeline
            _make_mcp_toolset(tool_filter=[
                "create_merge_request",
                "create_issue",
                "manage_pipeline",
            ]),
            # Supabase function tools
            notify_author,          # Log suggestion for human approval
            log_escalation,         # Log low-confidence escalation
            update_failure_record,  # Persist final status + MR URL
            write_audit_log,        # Write structured audit trail
            create_failure_trace,   # Write per-agent step trace
        ],
    )

    # ── SequentialAgent: runs agents 1-6 in strict order ─────────────────────
    return SequentialAgent(
        name="pipeline_guardian",
        description=(
            "PipelineGuardian: autonomous CI/CD repair agent. "
            "Watches GitLab pipeline failures, classifies with Gemini 2.5 Flash, "
            "searches memory for past fixes, generates a patch, validates it, "
            "and autonomously creates a fix MR or escalates."
        ),
        sub_agents=[
            pipeline_watcher,
            failure_classifier,
            memory_searcher,
            fix_generator,
            pre_flight_validator,
            action_agent,
        ],
    )


# ── Module-level root_agent (required by `adk web` / `adk run`) ──────────────
# ADK looks for a top-level `root_agent` variable in the entry-point module.
# build_root_agent() is synchronous and safe to call at import time because
# MCPToolset connections are lazy (no network I/O until first tool call).
root_agent = build_root_agent()
