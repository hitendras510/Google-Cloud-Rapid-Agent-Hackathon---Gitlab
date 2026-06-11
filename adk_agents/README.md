# PipelineGuardian — Google ADK Agent Layer

> Autonomous CI/CD repair using Google Agent Development Kit (ADK) + Gemini 2.5 Flash + GitLab MCP

---

## Architecture

```
GitLab Pipeline Failure
        ↓
 ┌──────────────────────────────────────────────────────────────┐
 │              SequentialAgent: pipeline_guardian               │
 │                                                              │
 │  1. pipeline_watcher    → GitLab MCP: get_pipeline_jobs     │
 │                           REST: fetch_job_log (last 500ch)  │
 │                                                              │
 │  2. failure_classifier  → Gemini 2.5 Flash (pure LLM)       │
 │                           6 categories + confidence score    │
 │                                                              │
 │  3. memory_searcher     → Supabase pgvector similarity      │
 │                           match_failures() RPC               │
 │                                                              │
 │  4. fix_generator       → Gemini 2.5 Flash (pure LLM)       │
 │                           .gitlab-ci.yml unified diff        │
 │                                                              │
 │  5. pre_flight_validator→ PyYAML + GitLab CI lint REST      │
 │                           secret-exposure check              │
 │                                                              │
 │  6. action_agent        → confidence >= 0.85: MR via MCP    │
 │                           0.60-0.85: notify author          │
 │                           < 0.60: GitLab issue via MCP      │
 └──────────────────────────────────────────────────────────────┘
        ↓
 Supabase DB: failures + failure_traces + audit_logs updated
```

---

## Setup

### 1. Install Dependencies

```bash
cd /path/to/project
pip install -r adk_agents/requirements.txt

# or with uv (recommended):
uv pip install -r adk_agents/requirements.txt
```

### 2. Configure Environment Variables

```bash
cp adk_agents/.env.example adk_agents/.env
# Edit adk_agents/.env with your real values
```

Required variables:
| Variable | Description |
|---|---|
| `GOOGLE_API_KEY` | Google AI API key (from [aistudio.google.com](https://aistudio.google.com)) |
| `GITLAB_TOKEN` | GitLab PAT with `api` + `read_repository` + `write_repository` scopes |
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key (from Settings > API) |

Optional:
| Variable | Default |
|---|---|
| `GEMINI_MODEL` | `gemini-2.5-flash` |
| `GITLAB_MCP_URL` | `https://gitlab.com/api/v4/mcp` |
| `GITLAB_INSTANCE_URL` | `https://gitlab.com` |

---

## Usage

### Option A: ADK Web UI (recommended for demos)

```bash
# From project root
export $(cat adk_agents/.env | xargs)
uv run adk web adk_agents
```

Opens `http://localhost:8000` — interactive chat UI with agent tracing.

### Option B: CLI Runner

```bash
export $(cat adk_agents/.env | xargs)

# Process a specific failure by UUID
python -m adk_agents.main --failure-id <uuid-from-supabase>

# With verbose agent step logging
python -m adk_agents.main --failure-id <uuid> --verbose
```

### Option C: ADK API Server

```bash
uv run adk api_server adk_agents
# POST http://localhost:8000/run
```

---

## MCP Connection

The agents connect to the GitLab MCP server over HTTP/SSE transport:

```python
SseConnectionParams(
    url="https://gitlab.com/api/v4/mcp",  # GITLAB_MCP_URL
    headers={"Authorization": f"Bearer {GITLAB_TOKEN}"}
)
```

Tools used per agent:
| Agent | MCP Tools | Custom Tools |
|---|---|---|
| pipeline_watcher | `get_pipeline_jobs` | `fetch_job_log` |
| failure_classifier | — | — |
| memory_searcher | — | `query_similar_failures` |
| fix_generator | — | — |
| pre_flight_validator | `lint_ci` | `validate_yaml`, `check_lint_ci` |
| action_agent | `create_merge_request`, `create_issue`, `manage_pipeline` | `notify_author`, `update_failure_record`, `write_audit_log` |

---

## File Structure

```
adk_agents/
├── __init__.py          # Exports root_agent for ADK discovery
├── agent.py             # SequentialAgent + 6 LlmAgents (main entry point)
├── config.py            # Environment variable loader + validation
├── prompts.py           # System prompts for all 6 agents
├── main.py              # CLI runner
├── requirements.txt     # Python dependencies
├── .env.example         # Environment variable template
├── README.md            # This file
└── tools/
    ├── __init__.py
    └── supabase_tools.py  # Function tools: DB reads/writes, YAML validation
```
