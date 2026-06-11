"""
tools/supabase_tools.py — Function tools that call Supabase REST API / Edge Functions.
These are plain Python functions; ADK wraps them automatically when passed to LlmAgent.
"""
import json
import os
import time
from typing import Optional

import requests


# ─── Shared HTTP helper ───────────────────────────────────────────────────────

def _supabase_headers() -> dict[str, str]:
    # Fall back to anon key if service role key is not set
    key = (
        os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        or os.environ.get("SUPABASE_ANON_KEY", "")
    )
    return {
        "Authorization": f"Bearer {key}",
        "apikey": key,
        "Content-Type": "application/json",
    }


def _supabase_url() -> str:
    return os.environ["SUPABASE_URL"]


# ─── Tool: query_similar_failures ─────────────────────────────────────────────

def query_similar_failures(signal_excerpt: str, top_k: int = 3) -> dict:
    """
    Search the Supabase `failures` table for past resolved failures similar to
    the provided signal_excerpt using vector similarity (pgvector / match_failures RPC).

    Args:
        signal_excerpt: The last 500 chars of the failed CI job log.
        top_k: Number of similar failures to return (default 3).

    Returns:
        dict with keys: has_similar_fix, similarity_score, past_fix_description,
        past_fix_diff, past_failure_id
    """
    url = f"{_supabase_url()}/rest/v1/rpc/match_failures"
    payload = {
        "query_text": signal_excerpt,
        "match_threshold": 0.70,
        "match_count": top_k,
    }

    try:
        resp = requests.post(url, headers=_supabase_headers(), json=payload, timeout=10)
        resp.raise_for_status()
        results = resp.json()

        if results and len(results) > 0:
            top = results[0]
            return {
                "has_similar_fix": True,
                "similarity_score": round(float(top.get("similarity", 0.0)), 4),
                "past_fix_description": top.get("fix_description"),
                "past_fix_diff": top.get("fix_diff"),
                "past_failure_id": top.get("id"),
            }
    except Exception as exc:  # noqa: BLE001
        # Surface error to the agent so it can decide to proceed without memory
        return {
            "has_similar_fix": False,
            "similarity_score": 0.0,
            "past_fix_description": None,
            "past_fix_diff": None,
            "past_failure_id": None,
            "error": str(exc),
        }

    return {
        "has_similar_fix": False,
        "similarity_score": 0.0,
        "past_fix_description": None,
        "past_fix_diff": None,
        "past_failure_id": None,
    }


# ─── Tool: validate_yaml ──────────────────────────────────────────────────────

def validate_yaml(yaml_content: str) -> dict:
    """
    Validate a YAML string for syntax correctness using PyYAML.

    Args:
        yaml_content: Raw YAML string to validate.

    Returns:
        dict with keys: valid (bool), errors (list[str])
    """
    try:
        import yaml  # PyYAML
        yaml.safe_load(yaml_content)
        return {"valid": True, "errors": []}
    except Exception as exc:  # noqa: BLE001
        return {"valid": False, "errors": [str(exc)]}


# ─── Tool: check_lint_ci ──────────────────────────────────────────────────────

def check_lint_ci(project_id: str, yaml_content: str) -> dict:
    """
    Lint a .gitlab-ci.yml using the GitLab CI lint REST API endpoint.

    Args:
        project_id: Numeric GitLab project ID.
        yaml_content: The .gitlab-ci.yml content string.

    Returns:
        dict with keys: valid (bool), errors (list[str]), warnings (list[str])
    """
    gitlab_token = os.environ.get("GITLAB_TOKEN", "")
    gitlab_url = os.environ.get("GITLAB_INSTANCE_URL", "https://gitlab.com")
    url = f"{gitlab_url}/api/v4/projects/{project_id}/ci/lint"

    try:
        resp = requests.post(
            url,
            headers={
                "PRIVATE-TOKEN": gitlab_token,
                "Content-Type": "application/json",
            },
            json={"content": yaml_content},
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        return {
            "valid": data.get("valid", False),
            "errors": data.get("errors", []),
            "warnings": data.get("warnings", []),
        }
    except Exception as exc:  # noqa: BLE001
        return {"valid": False, "errors": [str(exc)], "warnings": []}


# ─── Tool: fetch_job_log ──────────────────────────────────────────────────────

def fetch_job_log(project_id: str, job_id: int) -> dict:
    """
    Fetch the raw log for a specific GitLab CI job and return the last 500 chars.

    Args:
        project_id: Numeric GitLab project ID.
        job_id: Numeric GitLab job ID.

    Returns:
        dict with keys: log_excerpt (str), full_log_length (int)
    """
    gitlab_token = os.environ.get("GITLAB_TOKEN", "")
    gitlab_url = os.environ.get("GITLAB_INSTANCE_URL", "https://gitlab.com")
    url = f"{gitlab_url}/api/v4/projects/{project_id}/jobs/{job_id}/trace"

    try:
        resp = requests.get(
            url,
            headers={"PRIVATE-TOKEN": gitlab_token},
            timeout=20,
        )
        resp.raise_for_status()
        full_log = resp.text
        excerpt = full_log[-500:] if len(full_log) > 500 else full_log
        return {"log_excerpt": excerpt, "full_log_length": len(full_log)}
    except Exception as exc:  # noqa: BLE001
        return {"log_excerpt": f"Error fetching log: {exc}", "full_log_length": 0}


# ─── Tool: update_failure_record ─────────────────────────────────────────────

def update_failure_record(
    failure_id: str,
    error_type: str,
    confidence_score: float,
    similarity_score: float,
    status: str,
    fix_diff: Optional[str] = None,
    fix_mr_url: Optional[str] = None,
    fix_mr_id: Optional[int] = None,
    time_to_fix_ms: Optional[int] = None,
) -> dict:
    """
    Update the `failures` table row with the results from the ADK agent pipeline.

    Args:
        failure_id: UUID of the failure record.
        error_type: Classified error type.
        confidence_score: Confidence from the classifier (0.0-1.0).
        similarity_score: Similarity from memory search (0.0-1.0).
        status: Final status: auto_applied | fix_pending | escalated.
        fix_diff: Unified diff of the generated fix (optional).
        fix_mr_url: URL of the created MR (optional).
        fix_mr_id: IID of the created MR (optional).
        time_to_fix_ms: Total elapsed milliseconds (optional).

    Returns:
        dict with key: success (bool)
    """
    url = f"{_supabase_url()}/rest/v1/failures?id=eq.{failure_id}"
    payload: dict = {
        "error_type": error_type,
        "confidence_score": confidence_score,
        "similarity_score": similarity_score,
        "status": status,
    }
    if fix_diff:
        payload["fix_diff"] = fix_diff
    if fix_mr_url:
        payload["fix_mr_url"] = fix_mr_url
    if fix_mr_id:
        payload["fix_mr_id"] = fix_mr_id
    if time_to_fix_ms:
        payload["time_to_fix_ms"] = time_to_fix_ms

    try:
        resp = requests.patch(
            url,
            headers={**_supabase_headers(), "Prefer": "return=minimal"},
            json=payload,
            timeout=10,
        )
        resp.raise_for_status()
        return {"success": True}
    except Exception as exc:  # noqa: BLE001
        return {"success": False, "error": str(exc)}


# ─── Tool: write_audit_log ────────────────────────────────────────────────────

def write_audit_log(
    failure_id: str,
    agent_name: str,
    action: str,
    payload: dict,
) -> dict:
    """
    Write an entry to the `audit_logs` table.

    Args:
        failure_id: UUID of the failure record.
        agent_name: Name of the ADK agent writing this log.
        action: Short action string (e.g. 'mr_created', 'escalated').
        payload: Arbitrary metadata dict to store.

    Returns:
        dict with key: success (bool)
    """
    url = f"{_supabase_url()}/rest/v1/audit_logs"
    body = {
        "failure_id": failure_id,
        "agent_name": agent_name,
        "action": action,
        "payload": payload,
    }

    try:
        resp = requests.post(
            url,
            headers={**_supabase_headers(), "Prefer": "return=minimal"},
            json=body,
            timeout=10,
        )
        resp.raise_for_status()
        return {"success": True}
    except Exception as exc:  # noqa: BLE001
        return {"success": False, "error": str(exc)}


# ─── Tool: create_failure_trace ──────────────────────────────────────────────

def create_failure_trace(
    failure_id: str,
    step_name: str,
    step_order: int,
    duration_ms: int,
    input_summary: str,
    output_summary: str,
    metadata: Optional[dict] = None,
) -> dict:
    """
    Write an agent step trace to the `failure_traces` table.

    Args:
        failure_id: UUID of the failure record.
        step_name: Name of the agent step.
        step_order: 1-indexed order of this step.
        duration_ms: How long this step took in milliseconds.
        input_summary: Short description of the input.
        output_summary: Short description of the output.
        metadata: Optional dict of extra structured data.

    Returns:
        dict with key: success (bool)
    """
    url = f"{_supabase_url()}/rest/v1/failure_traces"
    body = {
        "failure_id": failure_id,
        "step_name": step_name,
        "step_order": step_order,
        "duration_ms": duration_ms,
        "input_summary": input_summary,
        "output_summary": output_summary,
        "metadata": metadata or {},
    }

    try:
        resp = requests.post(
            url,
            headers={**_supabase_headers(), "Prefer": "return=minimal"},
            json=body,
            timeout=10,
        )
        resp.raise_for_status()
        return {"success": True}
    except Exception as exc:  # noqa: BLE001
        return {"success": False, "error": str(exc)}


# ─── Tool: notify_author ─────────────────────────────────────────────────────

def notify_author(
    failure_id: str,
    author: str,
    error_type: str,
    fix_description: str,
    fix_diff: str,
    confidence_score: float,
) -> dict:
    """
    Simulate notifying the commit author about a suggested fix (confidence 0.60-0.85).
    In production this would send an email or Slack message.

    Args:
        failure_id: UUID of the failure record.
        author: Commit author name.
        error_type: Classified error type.
        fix_description: One-sentence description of the fix.
        fix_diff: The generated diff to share.
        confidence_score: The confidence level.

    Returns:
        dict with key: success (bool), message (str)
    """
    # Log the notification in audit_logs
    write_audit_log(
        failure_id=failure_id,
        agent_name="action_agent",
        action="suggestion_sent",
        payload={
            "author": author,
            "error_type": error_type,
            "fix_description": fix_description,
            "confidence_score": confidence_score,
        },
    )
    return {
        "success": True,
        "message": f"Fix suggestion sent to {author} for approval (confidence: {confidence_score:.0%})",
    }


# ─── Tool: log_escalation ────────────────────────────────────────────────────

def log_escalation(
    failure_id: str,
    reason: str,
    confidence_score: float,
) -> dict:
    """
    Log an escalation event when confidence is too low or validation fails.

    Args:
        failure_id: UUID of the failure record.
        reason: Reason for escalation.
        confidence_score: The confidence level at time of escalation.

    Returns:
        dict with key: success (bool)
    """
    write_audit_log(
        failure_id=failure_id,
        agent_name="action_agent",
        action="escalated",
        payload={"reason": reason, "confidence_score": confidence_score},
    )
    update_failure_record(
        failure_id=failure_id,
        error_type="unknown",
        confidence_score=confidence_score,
        similarity_score=0.0,
        status="escalated",
    )
    return {"success": True, "action": "escalated", "reason": reason}
