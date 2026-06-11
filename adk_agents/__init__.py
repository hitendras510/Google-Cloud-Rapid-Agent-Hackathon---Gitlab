# adk_agents/__init__.py
"""
PipelineGuardian — Google ADK Agent Layer
==========================================
Exposes root_agent for `adk web` and `adk run` discovery.
"""
from .agent import root_agent

__all__ = ["root_agent"]
