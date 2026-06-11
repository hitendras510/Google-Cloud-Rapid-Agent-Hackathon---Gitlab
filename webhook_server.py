"""
webhook_server.py — PipelineGuardian FastAPI Server
====================================================
Single server that:
  • Serves the React/Vite frontend (GET /)
  • Receives GitLab pipeline webhooks (POST /webhook/gitlab)
  • Triggers the ADK 6-agent repair pipeline asynchronously
  • Exposes health + agent-info endpoints for Cloud Run probes

Secrets are loaded from Google Cloud Secret Manager at startup.
In local dev, falls back to environment variables / .env file.
"""

import asyncio
import hmac
import json
import logging
import os
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from fastapi import BackgroundTasks, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# ── Load .env for local dev (no-op in Cloud Run) ─────────────────────────────
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger("pipeline_guardian")

# ── Secret Manager ────────────────────────────────────────────────────────────

def get_secret(name: str) -> str:
    """
    Load a secret from Google Cloud Secret Manager.
    Falls back to environment variable of the same name (local dev / CI).
    """
    # Fast path: env var already set (Docker --set-env-vars or local .env)
    val = os.environ.get(name)
    if val:
        return val

    # Cloud Secret Manager path
    try:
        from google.cloud import secretmanager

        client = secretmanager.SecretManagerServiceClient()
        project = os.environ.get("GOOGLE_CLOUD_PROJECT") or os.environ.get("GCP_PROJECT")
        if not project:
            raise ValueError("GOOGLE_CLOUD_PROJECT not set")

        response = client.access_secret_version(
            name=f"projects/{project}/secrets/{name}/versions/latest"
        )
        value = response.payload.data.decode("utf-8").strip()
        # Cache in env so subsequent calls are instant
        os.environ[name] = value
        logger.info(f"✅ Loaded secret: {name}")
        return value
    except Exception as exc:
        logger.warning(f"⚠️  Could not load {name} from Secret Manager: {exc}")
        raise RuntimeError(
            f"Secret '{name}' not found in environment or Secret Manager"
        ) from exc


# ── Secrets loaded at startup ─────────────────────────────────────────────────

class Secrets:
    gitlab_token: str = ""
    gemini_api_key: str = ""
    supabase_url: str = ""
    supabase_anon_key: str = ""
    webhook_secret: str = ""


_secrets = Secrets()


def _load_all_secrets() -> None:
    """Load all required secrets once at server startup."""
    secret_map = {
        "gitlab_token":   "GITLAB_TOKEN",
        "gemini_api_key": "GEMINI_API_KEY",
        "supabase_url":   "SUPABASE_URL",
        "supabase_anon_key": "SUPABASE_ANON_KEY",
        "webhook_secret": "WEBHOOK_SECRET",
    }
    errors = []
    for attr, env_name in secret_map.items():
        try:
            setattr(_secrets, attr, get_secret(env_name))
        except RuntimeError as e:
            errors.append(str(e))

    if errors:
        logger.warning(f"Missing secrets (non-fatal in dev): {errors}")

    # Inject GOOGLE_API_KEY so ADK/Gemini picks it up
    if _secrets.gemini_api_key:
        os.environ["GOOGLE_API_KEY"] = _secrets.gemini_api_key
    if _secrets.gitlab_token:
        os.environ["GITLAB_TOKEN"] = _secrets.gitlab_token


# ── ADK setup ─────────────────────────────────────────────────────────────────
# Imports are deferred to _init_agent() to avoid top-level import failures
# on Railway if google-adk has transient install issues.

class AgentPool:
    """Holds a single warm ADK InMemoryRunner shared across all requests."""
    runner = None
    startup_time: float = 0.0


_pool = AgentPool()


def _init_agent() -> None:
    """Build the ADK agent once at startup (imports deferred here)."""
    from google.adk.runners import InMemoryRunner  # noqa: PLC0415
    from adk_agents.agent import build_root_agent  # noqa: PLC0415

    t0 = time.time()
    root_agent = build_root_agent()
    _pool.runner = InMemoryRunner(agent=root_agent)
    _pool.startup_time = time.time() - t0
    logger.info(
        f"✅ ADK InMemoryRunner ready in {_pool.startup_time:.2f}s "
        f"— agent: {root_agent.name} ({len(root_agent.sub_agents)} sub-agents)"
    )


# ── Lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🚀 PipelineGuardian starting up...")
    _load_all_secrets()
    _init_agent()
    logger.info("✅ Server ready")
    yield
    logger.info("👋 PipelineGuardian shutting down")


# ── FastAPI app ───────────────────────────────────────────────────────────────

app = FastAPI(
    title="PipelineGuardian",
    description="Autonomous CI/CD repair agent — ADK + Gemini 2.5 Flash + GitLab MCP",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

# ── Static files (React build) ────────────────────────────────────────────────
_STATIC_DIR = Path(__file__).parent / "static"
if _STATIC_DIR.exists():
    # Mount assets under /assets (Vite output structure)
    _assets = _STATIC_DIR / "assets"
    if _assets.exists():
        app.mount("/assets", StaticFiles(directory=str(_assets)), name="assets")
    logger.info(f"📦 Serving React build from {_STATIC_DIR}")
else:
    logger.warning("⚠️  No static/ directory found — React frontend not built")


# ─────────────────────────────────────────────────────────────────────────────
# Routes
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    """Cloud Run liveness + readiness probe."""
    return {
        "status": "healthy",
        "agent_ready": _pool.runner is not None,
        "startup_time_s": round(_pool.startup_time, 2),
    }


@app.get("/agent-info")
async def agent_info():
    """Agent graph description — for hackathon demos."""
    if not _pool.runner:
        raise HTTPException(503, "Agent not ready")
    agent = _pool.runner.agent
    return {
        "name": agent.name,
        "type": "SequentialAgent",
        "model": os.environ.get("GEMINI_MODEL", "gemini-2.5-flash"),
        "pipeline": [
            {"order": i + 1, "name": a.name, "description": a.description}
            for i, a in enumerate(agent.sub_agents)
        ],
    }


# ── GitLab Webhook ────────────────────────────────────────────────────────────

class GitLabPipelineEvent(BaseModel):
    object_kind: str = ""
    object_attributes: dict = {}
    project: dict = {}
    user: dict = {}
    builds: list = []


@app.post("/webhook/gitlab")
async def gitlab_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    x_gitlab_token: Optional[str] = Header(None, alias="X-Gitlab-Token"),
    x_gitlab_event: Optional[str] = Header(None, alias="X-Gitlab-Event"),
):
    """
    Receive GitLab pipeline failure webhooks.

    Validates the X-Gitlab-Token header, parses the pipeline event,
    and fires the ADK agent pipeline in the background.
    Returns {"status": "processing"} immediately without awaiting the agent.
    """
    # ── Token validation ──────────────────────────────────────────────────────
    webhook_secret = _secrets.webhook_secret
    if webhook_secret and x_gitlab_token != webhook_secret:
        logger.warning(f"❌ Invalid webhook token from {request.client.host}")
        raise HTTPException(status_code=401, detail="Invalid webhook token")

    # ── Parse body ────────────────────────────────────────────────────────────
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    event_type = x_gitlab_event or body.get("object_kind", "")

    # Only handle pipeline failures
    if event_type != "Pipeline Hook" and body.get("object_kind") != "pipeline":
        return JSONResponse(
            {"status": "ignored", "reason": f"Event '{event_type}' not handled"},
        )

    pipeline = body.get("object_attributes", {})
    status = pipeline.get("status", "")

    if status != "failed":
        return JSONResponse(
            {"status": "ignored", "reason": f"Pipeline status '{status}' — only 'failed' is processed"},
        )

    # ── Extract fields ────────────────────────────────────────────────────────
    project = body.get("project", {})
    project_id = str(project.get("id", ""))
    pipeline_id = pipeline.get("id")
    ref = pipeline.get("ref", "main")
    sha = pipeline.get("sha", "")
    failed_jobs = [
        b for b in body.get("builds", []) if b.get("status") == "failed"
    ]
    job_name = failed_jobs[0].get("name", "unknown") if failed_jobs else "unknown"
    stage = failed_jobs[0].get("stage", "unknown") if failed_jobs else "unknown"

    logger.info(
        f"📥 GitLab webhook: project={project_id} pipeline={pipeline_id} "
        f"ref={ref} job={job_name} stage={stage}"
    )

    if not project_id or not pipeline_id:
        raise HTTPException(status_code=422, detail="Missing project_id or pipeline_id")

    # ── Fire ADK pipeline in background ──────────────────────────────────────
    background_tasks.add_task(
        run_pipeline_guardian,
        project_id=project_id,
        pipeline_id=pipeline_id,
        ref=ref,
        sha=sha,
        job_name=job_name,
        stage=stage,
    )

    return JSONResponse(
        status_code=202,
        content={
            "status": "processing",
            "pipeline_id": pipeline_id,
            "project_id": project_id,
            "message": "ADK agent pipeline initiated",
        },
    )


# ── ADK Pipeline Runner ───────────────────────────────────────────────────────

async def run_pipeline_guardian(
    project_id: str,
    pipeline_id: int,
    ref: str = "main",
    sha: str = "",
    job_name: str = "unknown",
    stage: str = "unknown",
) -> None:
    """
    Run the full 6-agent PipelineGuardian ADK pipeline for a failed GitLab pipeline.

    Uses InMemoryRunner (ADK 2.2.0) with a 60-second timeout.
    Logs each MCP tool call to console and writes the final result
    to the Supabase audit_logs table.
    """
    if not _pool.runner:
        logger.error("❌ ADK runner not initialized — skipping pipeline")
        return

    start_ms = int(time.time() * 1000)
    session_id = f"pipeline-{project_id}-{pipeline_id}-{int(time.time())}"

    logger.info(
        f"🤖 ADK pipeline starting — project={project_id} "
        f"pipeline={pipeline_id} session={session_id}"
    )

    # Create a fresh session per pipeline run
    session = await _pool.runner.session_service.create_session(
        app_name="pipelineguardian",
        user_id="system",
        session_id=session_id,
    )

    # Seed message passed to the first agent (pipeline_watcher)
    message_text = (
        f"Pipeline #{pipeline_id} in project {project_id} has failed on branch '{ref}'. "
        f"Failed job: '{job_name}' (stage: {stage}). "
        f"Commit SHA: {sha}. "
        f"Run the full analysis and fix pipeline: "
        f"fetch the job log, classify the error, search memory, generate a fix, "
        f"validate it, and take action (create MR if confidence >= 0.85, "
        f"notify author if 0.60-0.85, escalate otherwise)."
    )

    from google.genai import types as genai_types  # noqa: PLC0415

    new_message = genai_types.Content(
        role="user",
        parts=[genai_types.Part(text=message_text)],
    )

    # ── Stream events with 60s timeout ────────────────────────────────────────
    final_text = ""
    mcp_calls: list[str] = []
    error: Optional[str] = None

    try:
        async with asyncio.timeout(60):
            result_stream = _pool.runner.run_async(
                user_id="system",
                session_id=session_id,
                new_message=new_message,
            )

            async for event in result_stream:
                if not hasattr(event, "content") or not event.content:
                    continue

                author = getattr(event, "author", "unknown")

                for part in event.content.parts:
                    # Log MCP tool calls
                    if hasattr(part, "function_call") and part.function_call:
                        tool_name = part.function_call.name
                        mcp_calls.append(tool_name)
                        logger.info(f"  🔧 [{author}] MCP Call: {tool_name}")

                    # Log tool responses
                    if hasattr(part, "function_response") and part.function_response:
                        logger.info(f"  ✅ [{author}] MCP Response: {part.function_response.name}")

                    # Capture final text output
                    if hasattr(part, "text") and part.text:
                        if event.is_final_response():
                            final_text = part.text
                            logger.info(f"  📄 [{author}] Final: {part.text[:200]}")

    except TimeoutError:
        error = "Pipeline timed out after 60 seconds"
        logger.error(f"⏰ {error} — project={project_id} pipeline={pipeline_id}")
    except Exception as exc:
        error = str(exc)
        logger.exception(f"❌ ADK pipeline error: {exc}")

    elapsed_ms = int(time.time() * 1000) - start_ms

    # Parse final result JSON if possible
    final_result: dict = {}
    if final_text:
        try:
            final_result = json.loads(final_text)
        except json.JSONDecodeError:
            final_result = {"raw_output": final_text[:500]}

    logger.info(
        f"✅ ADK pipeline done — project={project_id} pipeline={pipeline_id} "
        f"status={final_result.get('final_status', 'unknown')} "
        f"elapsed={elapsed_ms}ms mcp_calls={mcp_calls}"
    )

    # ── Write result to Supabase audit_logs ───────────────────────────────────
    await _log_to_supabase(
        project_id=project_id,
        pipeline_id=pipeline_id,
        session_id=session_id,
        final_result=final_result,
        mcp_calls=mcp_calls,
        elapsed_ms=elapsed_ms,
        error=error,
    )


async def _log_to_supabase(
    project_id: str,
    pipeline_id: int,
    session_id: str,
    final_result: dict,
    mcp_calls: list[str],
    elapsed_ms: int,
    error: Optional[str],
) -> None:
    """Write the ADK pipeline result to Supabase audit_logs via HTTP REST."""
    supabase_url = _secrets.supabase_url
    anon_key = _secrets.supabase_anon_key

    if not supabase_url or not anon_key:
        logger.warning("Supabase not configured — skipping audit log")
        return

    import httpx

    url = f"{supabase_url}/rest/v1/audit_logs"
    headers = {
        "apikey": anon_key,
        "Authorization": f"Bearer {anon_key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }
    payload = {
        "agent_name": "webhook_server",
        "action": "adk_pipeline_completed",
        "payload": {
            "project_id": project_id,
            "pipeline_id": pipeline_id,
            "session_id": session_id,
            "final_status": final_result.get("final_status"),
            "action_taken": final_result.get("action_taken"),
            "action_url": final_result.get("action_url"),
            "mcp_calls": mcp_calls,
            "elapsed_ms": elapsed_ms,
            "error": error,
        },
    }

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(url, headers=headers, json=payload)
            resp.raise_for_status()
            logger.info(f"✅ Audit log written to Supabase (HTTP {resp.status_code})")
    except Exception as exc:
        logger.warning(f"⚠️  Failed to write audit log to Supabase: {exc}")


# ── React SPA fallback — must be LAST ────────────────────────────────────────
# Any route not matched above (e.g., /failures, /trace) returns index.html
# so React Router can handle client-side navigation.

@app.get("/{full_path:path}", include_in_schema=False)
async def serve_react(full_path: str):
    """Serve React SPA for all unmatched routes (client-side routing support)."""
    index = _STATIC_DIR / "index.html"
    if index.exists():
        return FileResponse(str(index))
    raise HTTPException(status_code=404, detail="Frontend not built. Run: npm run build")
