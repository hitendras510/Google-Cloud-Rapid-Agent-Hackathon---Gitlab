"""
server.py — FastAPI HTTP server for PipelineGuardian ADK on Cloud Run
======================================================================
This is the Cloud Run entry point. It wraps the ADK SequentialAgent behind
a simple REST API so Cloud Run can receive HTTP requests.

Endpoints:
  GET  /health          — liveness + readiness probe for Cloud Run
  POST /run             — trigger the full 6-agent pipeline for a failure_id
  GET  /agent-info      — describe the agent graph (for hackathon demos)

Cloud Run health checks hit /health — it must respond 200 within the
container startup probe window (default 240s).

Secrets are read from environment variables injected by Cloud Run
(set via --set-env-vars or --set-secrets in gcloud deploy).
"""

import asyncio
import json
import logging
import os
import time
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

# Load .env for local development (no-op in Cloud Run where envs are injected)
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("pipeline_guardian")

# ── ADK imports ───────────────────────────────────────────────────────────────
# Imported after dotenv so env vars are available
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types as genai_types

from adk_agents.agent import build_root_agent


# ── Application state ─────────────────────────────────────────────────────────

class AppState:
    root_agent = None
    session_service = None
    runner = None
    startup_time: float = 0.0


_state = AppState()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Build the ADK agent once on startup (warm pool stays warm in Cloud Run)."""
    logger.info("🚀 PipelineGuardian starting — building ADK agent...")
    t0 = time.time()

    _state.root_agent = build_root_agent()
    _state.session_service = InMemorySessionService()
    _state.runner = Runner(
        agent=_state.root_agent,
        app_name="pipeline_guardian",
        session_service=_state.session_service,
    )
    _state.startup_time = time.time() - t0

    logger.info(f"✅ ADK agent ready in {_state.startup_time:.2f}s — 6 sub-agents online")
    yield
    # Cleanup on shutdown
    logger.info("👋 PipelineGuardian shutting down")


# ── FastAPI app ───────────────────────────────────────────────────────────────

app = FastAPI(
    title="PipelineGuardian ADK Service",
    description=(
        "Autonomous CI/CD repair agent powered by Google ADK + Gemini 2.5 Flash. "
        "Receives pipeline failure IDs and runs the full 6-agent diagnosis & fix pipeline."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


# ── Request / Response models ─────────────────────────────────────────────────

class RunRequest(BaseModel):
    failure_id: str
    pipeline_id: Optional[int] = None
    project_id: Optional[str] = None
    branch: Optional[str] = "main"
    job_name: Optional[str] = None


class RunResponse(BaseModel):
    success: bool
    failure_id: str
    action_taken: Optional[str] = None
    final_status: Optional[str] = None
    action_url: Optional[str] = None
    elapsed_ms: int
    error: Optional[str] = None


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    """
    Cloud Run liveness + readiness probe.
    Returns 200 once the ADK agent is built, 503 during cold start.
    """
    if _state.root_agent is None:
        raise HTTPException(status_code=503, detail="Agent not ready yet")
    return {
        "status": "healthy",
        "agent": _state.root_agent.name,
        "sub_agents": [a.name for a in _state.root_agent.sub_agents],
        "startup_time_s": round(_state.startup_time, 2),
        "model": os.environ.get("GEMINI_MODEL", "gemini-2.5-flash"),
    }


@app.get("/agent-info")
async def agent_info():
    """Describe the agent graph — useful for hackathon demos."""
    if _state.root_agent is None:
        raise HTTPException(status_code=503, detail="Agent not ready")

    return {
        "name": _state.root_agent.name,
        "description": _state.root_agent.description,
        "type": "SequentialAgent",
        "model": os.environ.get("GEMINI_MODEL", "gemini-2.5-flash"),
        "mcp_url": os.environ.get("GITLAB_MCP_URL", "https://gitlab.com/api/v4/mcp"),
        "supabase_url": os.environ.get("SUPABASE_URL", ""),
        "pipeline": [
            {
                "order": i + 1,
                "name": a.name,
                "description": a.description,
            }
            for i, a in enumerate(_state.root_agent.sub_agents)
        ],
    }


@app.post("/run", response_model=RunResponse)
async def run_pipeline(request: RunRequest):
    """
    Trigger the full 6-agent PipelineGuardian pipeline for a given failure_id.

    The failure must already exist in the Supabase `failures` table
    (created by the gitlab-webhook or github-webhook edge function).
    """
    if _state.runner is None:
        raise HTTPException(status_code=503, detail="Agent runner not ready")

    logger.info(f"📥 /run called — failure_id={request.failure_id}")
    start_ms = int(time.time() * 1000)

    try:
        # Create a session per failure (isolated context per run)
        session = await _state.session_service.create_session(
            app_name="pipeline_guardian",
            user_id="system",
            session_id=request.failure_id,
        )

        # Build the initial message that seeds all 6 agents with context
        initial_message = genai_types.Content(
            role="user",
            parts=[
                genai_types.Part(
                    text=json.dumps({
                        "failure_id": request.failure_id,
                        "pipeline_id": request.pipeline_id,
                        "project_id": request.project_id,
                        "branch": request.branch or "main",
                        "job_name": request.job_name,
                        "task": (
                            "Analyse this CI/CD pipeline failure end-to-end. "
                            "1. Fetch the job log via GitLab MCP. "
                            "2. Classify the error type and confidence. "
                            "3. Search memory for similar past fixes. "
                            "4. Generate a .gitlab-ci.yml patch. "
                            "5. Validate the patch (YAML + CI lint). "
                            "6. Take action: MR if confidence>=0.85, "
                            "notify author if 0.60-0.85, else GitLab issue."
                        ),
                    })
                )
            ],
        )

        # Stream through all 6 agents, capture the final output
        final_result: dict = {}
        async for event in _state.runner.run_async(
            user_id="system",
            session_id=request.failure_id,
            new_message=initial_message,
        ):
            if hasattr(event, "content") and event.content and event.is_final_response():
                for part in event.content.parts:
                    if hasattr(part, "text") and part.text:
                        try:
                            final_result = json.loads(part.text)
                        except json.JSONDecodeError:
                            final_result = {"raw_output": part.text}

        elapsed = int(time.time() * 1000) - start_ms
        logger.info(
            f"✅ Pipeline done — failure_id={request.failure_id} "
            f"status={final_result.get('final_status')} elapsed={elapsed}ms"
        )

        return RunResponse(
            success=True,
            failure_id=request.failure_id,
            action_taken=final_result.get("action_taken"),
            final_status=final_result.get("final_status"),
            action_url=final_result.get("action_url"),
            elapsed_ms=elapsed,
        )

    except Exception as exc:
        elapsed = int(time.time() * 1000) - start_ms
        logger.exception(f"❌ Pipeline error — failure_id={request.failure_id}: {exc}")
        return RunResponse(
            success=False,
            failure_id=request.failure_id,
            elapsed_ms=elapsed,
            error=str(exc),
        )


@app.post("/webhook/trigger")
async def webhook_trigger(req: Request):
    """
    Convenience endpoint: receives the same payload as Supabase edge functions
    and fires the ADK pipeline directly. Useful for testing without Supabase.
    """
    body = await req.json()
    failure_id = body.get("failure_id")
    if not failure_id:
        raise HTTPException(status_code=400, detail="failure_id is required")

    # Fire and forget — return 202 immediately, pipeline runs async
    asyncio.create_task(
        _run_async_pipeline(
            failure_id=failure_id,
            pipeline_id=body.get("pipeline_id"),
            project_id=str(body.get("project_id", "")),
            branch=body.get("branch", "main"),
            job_name=body.get("job_name"),
        )
    )

    return JSONResponse(
        status_code=202,
        content={"accepted": True, "failure_id": failure_id, "message": "Pipeline initiated"},
    )


async def _run_async_pipeline(
    failure_id: str,
    pipeline_id: Optional[int],
    project_id: Optional[str],
    branch: str,
    job_name: Optional[str],
) -> None:
    """Background task used by /webhook/trigger."""
    try:
        req = RunRequest(
            failure_id=failure_id,
            pipeline_id=pipeline_id,
            project_id=project_id,
            branch=branch,
            job_name=job_name,
        )
        await run_pipeline(req)
    except Exception as exc:
        logger.exception(f"Background pipeline error for {failure_id}: {exc}")
