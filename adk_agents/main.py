"""
main.py — CLI runner for PipelineGuardian ADK agents.
Lets you trigger the full 6-agent pipeline against a real failure_id
from the command line, without the ADK web UI.

Usage:
  python -m adk_agents.main --failure-id <uuid>
  python -m adk_agents.main --failure-id <uuid> --verbose
"""
import argparse
import asyncio
import json
import os
import sys
import time

# Load .env if python-dotenv is available (local dev convenience)
try:
    from dotenv import load_dotenv
    load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))
    load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))
except ImportError:
    pass  # python-dotenv is optional

from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types as genai_types

from .agent import build_root_agent
from .config import load_config


async def run_pipeline(failure_id: str, verbose: bool = False) -> dict:
    """
    Run the full 6-agent PipelineGuardian pipeline for a given failure_id.

    Args:
        failure_id: UUID of the failure record in Supabase.
        verbose: If True, print each agent step as it runs.

    Returns:
        Final result dict from the action_agent.
    """
    config = load_config()
    start_ms = int(time.time() * 1000)

    print(f"\n🔍 PipelineGuardian ADK — Processing failure {failure_id}")
    print(f"   Model  : {config.gemini_model}")
    print(f"   MCP    : {config.gitlab_mcp_url}")
    print(f"   Supabase: {config.supabase_url}\n")

    # Build the agent pipeline (MCPToolset connections are lazy)
    root_agent = build_root_agent()

    # ADK session + runner setup
    session_service = InMemorySessionService()
    session = await session_service.create_session(
        app_name="pipeline_guardian",
        user_id="system",
        session_id=failure_id,
    )

    runner = Runner(
        agent=root_agent,
        app_name="pipeline_guardian",
        session_service=session_service,
    )

    # Initial message — passes the failure_id into the pipeline context
    initial_message = genai_types.Content(
        role="user",
        parts=[
            genai_types.Part(
                text=json.dumps({
                    "failure_id": failure_id,
                    "task": (
                        "Analyse this CI/CD pipeline failure end-to-end. "
                        "Fetch the job log, classify the error, search memory for "
                        "similar past fixes, generate a patch, validate it, and "
                        "take the appropriate action (create MR / notify / escalate)."
                    ),
                })
            )
        ],
    )

    # Stream events from the runner
    final_result = {}
    async for event in runner.run_async(
        user_id="system",
        session_id=failure_id,
        new_message=initial_message,
    ):
        if verbose:
            agent_name = getattr(event, "author", "unknown")
            content = ""
            if hasattr(event, "content") and event.content:
                for part in event.content.parts:
                    if hasattr(part, "text") and part.text:
                        content = part.text[:200]
            if content:
                print(f"  [{agent_name}] {content[:120]}...")

        # Capture the final response (last text event)
        if hasattr(event, "content") and event.content and event.is_final_response():
            for part in event.content.parts:
                if hasattr(part, "text") and part.text:
                    try:
                        final_result = json.loads(part.text)
                    except json.JSONDecodeError:
                        final_result = {"raw_output": part.text}

    elapsed = int(time.time() * 1000) - start_ms

    print(f"\n✅ Pipeline complete in {elapsed}ms")
    print(f"   Status  : {final_result.get('final_status', 'unknown')}")
    print(f"   Action  : {final_result.get('action_taken', 'unknown')}")
    if final_result.get("action_url"):
        print(f"   URL     : {final_result['action_url']}")

    return {**final_result, "elapsed_ms": elapsed}


def main() -> None:
    parser = argparse.ArgumentParser(
        description="PipelineGuardian ADK — autonomous CI/CD repair agent"
    )
    parser.add_argument(
        "--failure-id",
        required=True,
        help="UUID of the failure record in Supabase to process",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Print each agent step as it runs",
    )
    args = parser.parse_args()

    result = asyncio.run(run_pipeline(args.failure_id, verbose=args.verbose))
    print("\nFinal result:")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
