import { useState } from 'react';
import { Copy, Check, ExternalLink, GitMerge, Terminal, Webhook, Zap, ChevronDown, ChevronRight, AlertTriangle, Server } from 'lucide-react';

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }
  return { copied, copy };
}

function CodeBlock({ code, language = 'bash', copyKey, copied, onCopy }: {
  code: string; language?: string; copyKey: string;
  copied: string | null; onCopy: (text: string, key: string) => void;
}) {
  return (
    <div className="relative rounded-lg bg-slate-900/90 border border-slate-700/50 group">
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-700/50">
        <span className="text-[10px] text-slate-500 font-mono">{language}</span>
        <button onClick={() => onCopy(code, copyKey)} className="flex items-center gap-1.5 text-[10px] text-slate-500 hover:text-white transition-colors">
          {copied === copyKey ? <><Check className="w-3 h-3 text-emerald-400" /><span className="text-emerald-400">Copied</span></> : <><Copy className="w-3 h-3" />Copy</>}
        </button>
      </div>
      <pre className="px-4 py-3 text-xs text-slate-200 font-mono overflow-x-auto whitespace-pre-wrap">{code}</pre>
    </div>
  );
}

function Section({ num, title, icon: Icon, children, defaultOpen = false }: {
  num: number; title: string; icon: React.ElementType;
  children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-slate-700/40 bg-navy-900/60 overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-3 p-5 text-left hover:bg-slate-800/30 transition-colors">
        <span className="w-7 h-7 rounded-lg bg-accent-orange/10 border border-accent-orange/20 text-accent-orange text-xs font-bold flex items-center justify-center shrink-0">{num}</span>
        <Icon className="w-4 h-4 text-slate-300 shrink-0" />
        <span className="text-sm font-semibold text-white flex-1">{title}</span>
        {open ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
      </button>
      {open && <div className="px-5 pb-5 space-y-4 border-t border-slate-700/30 pt-4">{children}</div>}
    </div>
  );
}

export default function TestingGuide() {
  const { copied, copy } = useCopy();

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'YOUR_SUPABASE_URL';
  const webhookUrl = `${supabaseUrl}/functions/v1/gitlab-webhook`;
  const githubWebhookUrl = `${supabaseUrl}/functions/v1/github-webhook`;

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <header className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-cyan-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
          <Zap className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Testing Guide</h1>
          <p className="text-slate-400 text-sm">Connect a real repo, trigger a real failure, watch PipelineGuardian fix it</p>
        </div>
      </header>

      {/* Quick overview */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'GitLab Webhook', desc: 'Pipeline Hook → agent pipeline', color: 'orange' },
          { label: 'GitLab MCP Server', desc: 'Real API calls via MCP protocol', color: 'blue' },
          { label: 'GitHub Actions', desc: 'workflow_run → agent pipeline', color: 'slate' },
        ].map((item) => (
          <div key={item.label} className="p-4 rounded-xl border border-slate-700/40 bg-navy-900/60 flex items-center gap-3">
            <div className={`w-2 h-8 rounded-full bg-${item.color}-500`} />
            <div>
              <p className="text-sm font-medium text-white">{item.label}</p>
              <p className="text-xs text-slate-500">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── PART 1: GitLab ─────────────────────────────────────────── */}
      <div className="space-y-3">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <GitMerge className="w-4 h-4 text-orange-400" /> Part 1: GitLab Real Pipeline
        </h2>

        <Section num={1} title="Create a GitLab Personal Access Token" icon={Server} defaultOpen>
          <ol className="space-y-2 text-xs text-slate-300 list-decimal list-inside">
            <li>Go to <strong className="text-white">gitlab.com → User menu → Edit profile → Access tokens</strong></li>
            <li>Click <strong className="text-white">Add new token</strong></li>
            <li>Name it <code className="text-accent-orange bg-accent-orange/10 px-1 rounded">pipelineguardian</code>, no expiry</li>
            <li>Select scopes: <code className="text-emerald-400">api</code>, <code className="text-emerald-400">read_repository</code>, <code className="text-emerald-400">write_repository</code></li>
            <li>Copy the token — you'll need it in the next step</li>
          </ol>
          <div className="mt-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            For the MCP Server to work from external tools, also go to <strong>User Settings → GitLab Duo → set a default namespace</strong>.
          </div>
        </Section>

        <Section num={2} title="Register your project in PipelineGuardian" icon={GitMerge}>
          <p className="text-xs text-slate-400">Go to <strong className="text-white">GitLab Integration</strong> in the sidebar, then fill in:</p>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
            {[
              { field: 'GitLab Instance URL', val: 'https://gitlab.com', note: 'or your self-hosted URL' },
              { field: 'Project ID', val: 'Settings → General → Project ID', note: 'numeric, e.g. 58421367' },
              { field: 'Namespace', val: 'your-group or username', note: '' },
              { field: 'Project Name', val: 'your-repo-name', note: '' },
              { field: 'Access Token', val: 'glpat-xxxx from step 1', note: 'stored encrypted' },
            ].map(({ field, val, note }) => (
              <div key={field} className="p-2 rounded bg-slate-800/40 border border-slate-700/30">
                <p className="text-slate-400 text-[10px]">{field}</p>
                <p className="text-white font-mono text-[10px]">{val}</p>
                {note && <p className="text-slate-600 text-[10px]">{note}</p>}
              </div>
            ))}
          </div>
        </Section>

        <Section num={3} title="Add the webhook on GitLab" icon={Webhook}>
          <p className="text-xs text-slate-400 mb-3">Go to your project → <strong className="text-white">Settings → Webhooks → Add new webhook</strong></p>
          <div className="space-y-3">
            <div>
              <p className="text-xs text-slate-400 mb-1.5">URL (copy this exactly)</p>
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900/80 border border-slate-700/50">
                <span className="font-mono text-xs text-slate-200 flex-1 break-all">{webhookUrl}</span>
                <button onClick={() => copy(webhookUrl, 'gl-wh')} className="shrink-0">
                  {copied === 'gl-wh' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400 hover:text-white" />}
                </button>
              </div>
            </div>
            <ul className="space-y-1 text-xs text-slate-300">
              <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />Check <strong className="text-white">Pipeline events</strong></li>
              <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-slate-500 shrink-0" />Secret token: copy from the registered project row (auto-generated)</li>
              <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-slate-500 shrink-0" />SSL Verification: <strong className="text-white">enabled</strong></li>
              <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-slate-500 shrink-0" />Click <strong className="text-white">Add webhook</strong> → GitLab will show a test ping result</li>
            </ul>
          </div>
        </Section>

        <Section num={4} title="Trigger a real pipeline failure" icon={AlertTriangle}>
          <p className="text-xs text-slate-400 mb-3">You need a repo with a <code className="text-slate-300">.gitlab-ci.yml</code>. Here's the fastest way to create a failing pipeline:</p>
          <CodeBlock copyKey="bad-ci" copied={copied} onCopy={copy} language=".gitlab-ci.yml — intentional failure" code={`# .gitlab-ci.yml — push this to trigger a failure
stages:
  - test

unit-tests:
  stage: test
  image: python:3.11
  script:
    - pip install pytest
    - pytest tests/ -v
  # This will fail if tests/ folder doesn't exist or tests fail`} />
          <p className="text-xs text-slate-400 mt-3 mb-2">Or create a test that intentionally fails:</p>
          <CodeBlock copyKey="bad-test" copied={copied} onCopy={copy} language="tests/test_failing.py" code={`# tests/test_failing.py
def test_intentional_failure():
    result = 2 + 2
    assert result == 5, f"Expected 5, got {result}"  # will always fail`} />
          <p className="text-xs text-slate-400 mt-3">Push these files and create a pipeline. When it fails, PipelineGuardian will capture it automatically within 2–3 seconds.</p>
        </Section>

        <Section num={5} title="Connect the GitLab MCP Server" icon={Server}>
          <p className="text-xs text-slate-400 mb-3">This wires the MCP server into your AI tools so PipelineGuardian can call real GitLab tools (create MR, retry pipeline, semantic search).</p>

          <p className="text-xs font-medium text-white mb-2">Option A — Claude Code (recommended)</p>
          <CodeBlock copyKey="mcp-claude" copied={copied} onCopy={copy} language="terminal" code={`claude mcp add --transport http GitLab https://gitlab.com/api/v4/mcp`} />

          <p className="text-xs font-medium text-white mt-4 mb-2">Option B — This project already has the config at <code className="text-slate-400">.claude/mcp.json</code></p>
          <CodeBlock copyKey="mcp-json" copied={copied} onCopy={copy} language=".claude/mcp.json" code={`{
  "mcpServers": {
    "GitLab": {
      "type": "http",
      "url": "https://gitlab.com/api/v4/mcp"
    }
  }
}`} />

          <p className="text-xs font-medium text-white mt-4 mb-2">Option C — Cursor / VS Code</p>
          <CodeBlock copyKey="mcp-cursor" copied={copied} onCopy={copy} language="mcp.json" code={`{
  "mcpServers": {
    "GitLab": {
      "type": "http",
      "url": "https://gitlab.com/api/v4/mcp"
    }
  }
}`} />

          <div className="mt-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300 space-y-1">
            <p className="font-medium text-blue-200">After connecting:</p>
            <p>• Your browser will open for OAuth — approve the GitLab permission request</p>
            <p>• Type <code className="bg-blue-500/20 px-1 rounded">/mcp</code> in Claude Code to verify the GitLab server shows as connected</p>
            <p>• PipelineGuardian's <code className="bg-blue-500/20 px-1 rounded">gitlab-mcp-client</code> function will use the token you stored</p>
          </div>
        </Section>

        <Section num={6} title="Verify it's working" icon={Zap}>
          <p className="text-xs text-slate-400 mb-3">After a pipeline fails, check these in order:</p>
          <ol className="space-y-3 text-xs">
            {[
              { step: 'Failures page', desc: 'Should show a new row within ~3 seconds of the GitLab pipeline failing', link: '/failures' },
              { step: 'Trace Viewer', desc: 'Click the failure → see all 6 agent steps. "watcher" step metadata shows via_mcp: true when MCP is live', link: '/trace' },
              { step: 'GitLab MRs', desc: 'For auto_applied failures, a merge request should appear in your GitLab project', link: null },
              { step: 'Dashboard', desc: 'Stats update: Failures Caught, Auto-Fixed count, Avg Fix Time', link: '/' },
            ].map(({ step, desc, link }) => (
              <li key={step} className="flex items-start gap-3">
                <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">✓</span>
                <div>
                  <p className="text-slate-200 font-medium">{step} {link && <a href={link} className="text-accent-orange hover:underline ml-1 text-[10px]">(open →)</a>}</p>
                  <p className="text-slate-500">{desc}</p>
                </div>
              </li>
            ))}
          </ol>
        </Section>
      </div>

      {/* ── PART 2: GitHub Actions ─────────────────────────────────── */}
      <div className="space-y-3">
        <h2 className="text-base font-bold text-white flex items-center gap-2 mt-4">
          <Terminal className="w-4 h-4 text-slate-300" /> Part 2: GitHub Actions (GITHUB_TOKEN is set)
        </h2>

        <Section num={7} title="Add GitHub Actions webhook" icon={Webhook}>
          <p className="text-xs text-slate-400 mb-3">Your <code className="text-white">GITHUB_TOKEN</code> secret is already configured. Now add a webhook to your GitHub repo:</p>
          <div className="space-y-3">
            <ol className="space-y-2 text-xs text-slate-300 list-decimal list-inside">
              <li>Go to your repo → <strong className="text-white">Settings → Webhooks → Add webhook</strong></li>
              <li>Paste this URL:</li>
            </ol>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900/80 border border-slate-700/50">
              <span className="font-mono text-xs text-slate-200 flex-1 break-all">{githubWebhookUrl}</span>
              <button onClick={() => copy(githubWebhookUrl, 'gh-wh')}>
                {copied === 'gh-wh' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400 hover:text-white" />}
              </button>
            </div>
            <ul className="space-y-1 text-xs text-slate-300">
              <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />Content type: <strong className="text-white">application/json</strong></li>
              <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />Events: select <strong className="text-white">Workflow runs</strong> (under "Let me select individual events")</li>
            </ul>
          </div>
        </Section>

        <Section num={8} title="Trigger a GitHub Actions failure" icon={AlertTriangle}>
          <p className="text-xs text-slate-400 mb-3">Create this workflow in your repo to get a fast, reproducible failure:</p>
          <CodeBlock copyKey="gh-wf" copied={copied} onCopy={copy} language=".github/workflows/ci.yml" code={`.github/workflows/ci.yml
name: CI

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run tests
        run: |
          echo "Running tests..."
          exit 1  # intentional failure — remove this line for real CI`} />
          <p className="text-xs text-slate-500 mt-2">Push this file. The workflow will fail and PipelineGuardian will capture it within seconds.</p>
        </Section>
      </div>

      {/* ── PART 3: Direct MCP testing ─────────────────────────────── */}
      <div className="space-y-3">
        <h2 className="text-base font-bold text-white flex items-center gap-2 mt-4">
          <Server className="w-4 h-4 text-blue-400" /> Part 3: Test MCP Server Directly
        </h2>

        <Section num={9} title="Test the GitLab MCP client edge function" icon={Terminal}>
          <p className="text-xs text-slate-400 mb-3">Use <code className="text-slate-300">curl</code> to verify the MCP integration end-to-end:</p>
          <CodeBlock copyKey="mcp-test" copied={copied} onCopy={copy} language="terminal — list MCP tools" code={`curl -X POST \\
  ${supabaseUrl}/functions/v1/gitlab-mcp-client \\
  -H "Content-Type: application/json" \\
  -d '{
    "action": "list_tools",
    "instance_url": "https://gitlab.com",
    "token": "glpat-YOUR_TOKEN_HERE"
  }'`} />
          <CodeBlock copyKey="mcp-direct" copied={copied} onCopy={copy} language="terminal — call a tool directly" code={`curl -X POST \\
  ${supabaseUrl}/functions/v1/gitlab-mcp-client \\
  -H "Content-Type: application/json" \\
  -d '{
    "tool": "manage_pipeline",
    "instance_url": "https://gitlab.com",
    "token": "glpat-YOUR_TOKEN_HERE",
    "args": {
      "id": "your-namespace/your-project",
      "list": true
    }
  }'`} />
          <div className="mt-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300">
            <p className="font-medium mb-1">Expected response from list_tools:</p>
            <code className="text-[10px]">{"{ \"success\": true, \"tools\": [{ \"name\": \"manage_pipeline\", ... }, ...] }"}</code>
          </div>
        </Section>

        <Section num={10} title="Connect Claude Code to GitLab MCP + run this project" icon={Terminal}>
          <p className="text-xs text-slate-400 mb-3">This project has <code className="text-slate-300">.claude/mcp.json</code> already configured. Just run:</p>
          <CodeBlock copyKey="claude-run" copied={copied} onCopy={copy} language="terminal" code={`# In the project root — Claude Code will pick up .claude/mcp.json automatically
claude

# First run: browser opens for GitLab OAuth
# After approval, verify with:
/mcp
# → GitLab should show as "connected"

# Now ask Claude Code to use GitLab MCP tools:
# "List the last 5 pipelines for project my-team/payments-service"
# "Create a merge request to fix the failing test in pipeline #891234"`} />
          <div className="mt-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300">
            <p>The <code className="text-blue-200">gitlab-mcp-client</code> edge function is called by the orchestrator with your stored PAT. Claude Code uses OAuth. Both paths work independently.</p>
          </div>
        </Section>
      </div>

      {/* Endpoints reference */}
      <div className="rounded-xl border border-slate-700/40 bg-navy-900/60 p-5">
        <h3 className="text-sm font-semibold text-white mb-3">All Live Endpoints</h3>
        <div className="space-y-2">
          {[
            { label: 'GitLab Webhook', url: `${supabaseUrl}/functions/v1/gitlab-webhook`, method: 'POST', note: 'Receives Pipeline Hook events' },
            { label: 'GitHub Webhook', url: `${supabaseUrl}/functions/v1/github-webhook`, method: 'POST', note: 'Receives workflow_run events' },
            { label: 'GitLab MCP Client', url: `${supabaseUrl}/functions/v1/gitlab-mcp-client`, method: 'POST', note: 'Wraps all MCP tool calls' },
            { label: 'GitLab MR Creator', url: `${supabaseUrl}/functions/v1/gitlab-mr-creator`, method: 'POST', note: 'Direct GitLab REST API fallback' },
            { label: 'Agent Orchestrator', url: `${supabaseUrl}/functions/v1/agent-orchestrator`, method: 'POST', note: '6-agent pipeline runner' },
          ].map(({ label, url, method, note }) => (
            <div key={label} className="flex items-center gap-3 p-2.5 rounded-lg bg-slate-800/30">
              <span className="text-[10px] font-mono bg-blue-500/10 text-blue-300 px-1.5 py-0.5 rounded">{method}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-white">{label}</p>
                <p className="text-[10px] font-mono text-slate-500 truncate">{url}</p>
              </div>
              <span className="text-[10px] text-slate-600 shrink-0">{note}</span>
              <button onClick={() => copy(url, `ep-${label}`)} className="shrink-0">
                {copied === `ep-${label}` ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-slate-500 hover:text-white" />}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
