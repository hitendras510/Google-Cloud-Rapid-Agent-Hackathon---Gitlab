"""
config.py — PipelineGuardian ADK Layer
All secrets are loaded from environment variables.
Never hardcode values here.
"""
import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Config:
    # ── GitLab ────────────────────────────────────────────────────────────────
    gitlab_token: str
    gitlab_mcp_url: str          # e.g. https://gitlab.com/api/v4/mcp

    # ── Supabase ──────────────────────────────────────────────────────────────
    supabase_url: str
    supabase_service_key: str    # service-role key for server-side calls

    # ── Google AI ─────────────────────────────────────────────────────────────
    google_api_key: str
    gemini_model: str

    # ── Supabase Edge-Function URLs ────────────────────────────────────────────
    @property
    def orchestrator_url(self) -> str:
        return f"{self.supabase_url}/functions/v1/agent-orchestrator"

    @property
    def mcp_client_url(self) -> str:
        return f"{self.supabase_url}/functions/v1/gitlab-mcp-client"


def load_config() -> Config:
    """Load and validate all required environment variables."""
    required = {
        "GITLAB_TOKEN":              "GitLab Personal Access Token",
        "SUPABASE_URL":              "Supabase project URL",
        "SUPABASE_SERVICE_ROLE_KEY": "Supabase service-role key",
        "GOOGLE_API_KEY":            "Google AI API key",
    }

    missing = [k for k in required if not os.environ.get(k)]
    if missing:
        raise EnvironmentError(
            "Missing required environment variables:\n"
            + "\n".join(f"  {k}  ({required[k]})" for k in missing)
        )

    return Config(
        gitlab_token=os.environ["GITLAB_TOKEN"],
        gitlab_mcp_url=os.environ.get(
            "GITLAB_MCP_URL", "https://gitlab.com/api/v4/mcp"
        ),
        supabase_url=os.environ["SUPABASE_URL"],
        supabase_service_key=os.environ["SUPABASE_SERVICE_ROLE_KEY"],
        google_api_key=os.environ["GOOGLE_API_KEY"],
        gemini_model=os.environ.get("GEMINI_MODEL", "gemini-2.5-flash"),
    )
