import { useState, useEffect } from 'react';
import { Copy, Check, Webhook, Zap, Shield, ExternalLink, AlertCircle, Server, GitMerge, Terminal, BookOpen, Cpu, Search } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface GitLabInstallation {
  id: string;
  gitlab_instance_url: string;
  gitlab_project_id: string;
  gitlab_project_name: string;
  gitlab_namespace: string;
  mcp_enabled: boolean;
  is_active: boolean;
  events_received: number;
  last_event_at: string | null;
}

export default function GitLabSetup() {
  const [installations, setInstallations] = useState<GitLabInstallation[]>([]);
  const [instanceUrl, setInstanceUrl] = useState('https://gitlab.com');
  const [projectId, setProjectId] = useState('');
  const [projectName, setProjectName] = useState('');
  const [namespace, setNamespace] = useState('');
  const [token, setToken] = useState('');
  const [mcpEnabled, setMcpEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activeTab, setActiveTab] = useState<'webhook' | 'mcp' | 'duo'>('webhook');

  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gitlab-webhook`;

  useEffect(() => { loadInstallations(); }, []);

  async function loadInstallations() {
    const { data } = await supabase.from('gitlab_installations').select('*').order('created_at', { ascending: false });
    if (data) setInstallations(data);
  }

  async function handleSetup() {
    if (!projectId || !projectName || !namespace) { setError('Project ID, name, and namespace are required'); return; }
    setLoading(true); setError(''); setSuccess('');
    const { error: err } = await supabase.from('gitlab_installations').upsert({
      gitlab_instance_url: instanceUrl, gitlab_project_id: projectId,
      gitlab_project_name: projectName, gitlab_namespace: namespace,
      access_token_encrypted: token || null, mcp_enabled: mcpEnabled, is_active: true,
    }, { onConflict: 'gitlab_instance_url,gitlab_project_id' });
    if (err) { setError(err.message); } else {
      setSuccess(`Registered ${namespace}/${projectName}! Configure the webhook on GitLab.`);
      setProjectId(''); setProjectName(''); setNamespace(''); setToken('');
      loadInstallations();
    }
    setLoading(false);
  }

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(null), 2000);
  }

  const mcpHttpConfig = JSON.stringify({ mcpServers: { GitLab: { type: "http", url: `${instanceUrl}/api/v4/mcp` } } }, null, 2);
  const mcpStdioConfig = JSON.stringify({ mcpServers: { GitLab: { command: "npx", args: ["mcp-remote", `${instanceUrl}/api/v4/mcp`] } } }, null, 2);

  const tabs = [
    { id: 'webhook' as const, icon: Webhook, label: 'Webhook' },
    { id: 'mcp' as const, icon: Server, label: 'MCP Server' },
    { id: 'duo' as const, icon: Cpu, label: 'Duo Agents' },
  ];

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <header className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center shadow-lg shadow-orange-500/20">
          <GitMerge className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">GitLab Integration</h1>
          <p className="text-slate-400 text-sm">Pipeline Webhooks · MCP Server · Duo Agent Platform</p>
        </div>
      </header>

      <div className="flex gap-1 p-1 rounded-xl bg-slate-800/60 border border-slate-700/30 w-fit">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${activeTab === t.id ? 'bg-accent-orange text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-slate-700/50'}`}>
            <t.icon className="w-3.5 h-3.5" />{t.label}
          </button>
        ))}
      </div>

      {activeTab === 'webhook' && (
        <>
          <div className="grid grid-cols-3 gap-4">
            {[
              { step: 1, icon: Shield, title: 'Register Project', desc: 'Enter your GitLab project ID and PAT. A webhook secret is auto-generated for HMAC-SHA256 verification.' },
              { step: 2, icon: Webhook, title: 'Add Webhook on GitLab', desc: 'Settings > Webhooks. Paste URL below. Select "Pipeline events". Paste the webhook secret token.' },
              { step: 3, icon: Zap, title: 'Auto-Repair Activated', desc: 'Failed pipelines trigger the 6-agent flow. MRs created via GitLab MCP create_merge_request in ~7s.' },
            ].map(({ step, icon: Icon, title, desc }) => (
              <div key={step} className="rounded-xl border border-slate-700/40 bg-navy-900/60 p-5 relative hover:border-accent-orange/30 transition-colors">
                <div className="absolute -top-3 left-4 px-2.5 py-0.5 bg-gradient-to-r from-accent-orange to-orange-600 rounded-md text-xs font-bold text-white">Step {step}</div>
                <Icon className="w-5 h-5 text-accent-orange mt-3 mb-3" />
                <h3 className="text-sm font-semibold text-white mb-1">{title}</h3>
                <p className="text-xs text-slate-400 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-accent-orange/30 bg-accent-orange/5 p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-white">Webhook Endpoint</h3>
                <p className="text-xs text-slate-400">GitLab · Project · Settings · Webhooks · URL</p>
              </div>
              <button onClick={() => copy(webhookUrl, 'wh')} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent-orange/10 border border-accent-orange/30 text-accent-orange text-xs font-medium hover:bg-accent-orange/20 transition-colors">
                {copied === 'wh' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied === 'wh' ? 'Copied!' : 'Copy URL'}
              </button>
            </div>
            <div className="px-4 py-2.5 rounded-lg bg-navy-900/80 border border-slate-700/50 font-mono text-xs text-slate-200 break-all">{webhookUrl}</div>
            <div className="mt-3 flex gap-6 text-xs text-slate-500">
              <span>Trigger: <code className="text-emerald-400">Pipeline events</code></span>
              <span>Content type: <code className="text-slate-300">application/json</code></span>
            </div>
          </div>

          <div className="rounded-xl border border-slate-700/40 bg-navy-900/60 p-5">
            <h3 className="text-sm font-semibold text-white mb-4">Register GitLab Project</h3>
            {error && <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs"><AlertCircle className="w-3.5 h-3.5 shrink-0" />{error}</div>}
            {success && <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs"><Check className="w-3.5 h-3.5 shrink-0" />{success}</div>}
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div><label className="text-xs text-slate-400 block mb-1.5">GitLab Instance</label>
                <input value={instanceUrl} onChange={(e) => setInstanceUrl(e.target.value)} className="w-full px-3 py-2.5 rounded-lg bg-slate-800/60 border border-slate-700/50 text-sm text-white focus:outline-none focus:border-accent-orange/50" /></div>
              <div><label className="text-xs text-slate-400 block mb-1.5">Project ID (numeric)</label>
                <input value={projectId} onChange={(e) => setProjectId(e.target.value)} placeholder="58421367" className="w-full px-3 py-2.5 rounded-lg bg-slate-800/60 border border-slate-700/50 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-accent-orange/50" /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><label className="text-xs text-slate-400 block mb-1.5">Namespace</label>
                <input value={namespace} onChange={(e) => setNamespace(e.target.value)} placeholder="my-team" className="w-full px-3 py-2.5 rounded-lg bg-slate-800/60 border border-slate-700/50 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-accent-orange/50" /></div>
              <div><label className="text-xs text-slate-400 block mb-1.5">Project Name</label>
                <input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="payments-service" className="w-full px-3 py-2.5 rounded-lg bg-slate-800/60 border border-slate-700/50 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-accent-orange/50" /></div>
              <div><label className="text-xs text-slate-400 block mb-1.5">Access Token (PAT)</label>
                <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="glpat-xxxxxxxxxxxx" className="w-full px-3 py-2.5 rounded-lg bg-slate-800/60 border border-slate-700/50 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-accent-orange/50" /></div>
            </div>
            <p className="mt-2 text-xs text-slate-500">PAT scopes: <code className="text-slate-400">api</code>, <code className="text-slate-400">read_repository</code>, <code className="text-slate-400">write_repository</code></p>
            <label className="mt-3 flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={mcpEnabled} onChange={(e) => setMcpEnabled(e.target.checked)} className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-accent-orange" />
              <span className="text-xs text-slate-300">Enable GitLab MCP Server tools (pipeline management, MR creation)</span>
            </label>
            <button onClick={handleSetup} disabled={loading || !projectId || !projectName || !namespace}
              className="mt-4 flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-accent-orange to-orange-600 text-white text-sm font-medium hover:from-orange-500 hover:to-orange-700 transition-all shadow-lg shadow-accent-orange/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none">
              <Shield className="w-4 h-4" />{loading ? 'Registering...' : 'Register Project'}
            </button>
          </div>

          {installations.length > 0 && (
            <div className="rounded-xl border border-slate-700/40 bg-navy-900/60 p-5">
              <h3 className="text-sm font-semibold text-white mb-3">Connected Projects</h3>
              <div className="space-y-2">
                {installations.map((inst) => (
                  <div key={inst.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-800/30 border border-slate-700/30">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center"><GitMerge className="w-4 h-4 text-orange-400" /></div>
                      <div>
                        <p className="text-sm font-medium text-white">{inst.gitlab_namespace}/{inst.gitlab_project_name}</p>
                        <p className="text-xs text-slate-500">{inst.events_received} events{inst.mcp_enabled && <span className="text-blue-400 ml-2">MCP</span>}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`flex items-center gap-1.5 text-xs ${inst.is_active ? 'text-emerald-400' : 'text-slate-500'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${inst.is_active ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                        {inst.is_active ? 'Active' : 'Inactive'}
                      </span>
                      <a href={`${inst.gitlab_instance_url}/${inst.gitlab_namespace}/${inst.gitlab_project_name}/-/hooks`} target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-white"><ExternalLink className="w-3.5 h-3.5" /></a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {activeTab === 'mcp' && (
        <>
          <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-5">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0"><Server className="w-4 h-4 text-blue-400" /></div>
              <div>
                <h3 className="text-sm font-semibold text-white mb-1">GitLab MCP Server</h3>
                <p className="text-xs text-slate-400 leading-relaxed">PipelineGuardian uses 8 MCP tools to manage pipelines, create fix MRs, fetch job traces, and search code — all via OAuth 2.0 through the GitLab MCP Server at <code className="text-blue-300">{instanceUrl}/api/v4/mcp</code>.</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-700/40 bg-navy-900/60 p-5">
            <h3 className="text-sm font-semibold text-white mb-4">Active MCP Tools</h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                { tool: 'manage_pipeline', desc: 'Retry failed pipelines, cancel, create', agent: 'Action Agent' },
                { tool: 'get_pipeline_jobs', desc: 'Retrieve jobs + traces for root cause', agent: 'Watcher' },
                { tool: 'create_merge_request', desc: 'Open auto-fix MRs with patches', agent: 'Action Agent' },
                { tool: 'create_issue', desc: 'Escalate failures for human review', agent: 'Action Agent' },
                { tool: 'semantic_code_search', desc: 'Find similar code patterns for context', agent: 'Memory Agent' },
                { tool: 'search', desc: 'Search past MRs/issues for patterns', agent: 'Memory Agent' },
                { tool: 'get_merge_request_diffs', desc: 'Analyze changes that caused failure', agent: 'Classifier' },
                { tool: 'get_merge_request_pipelines', desc: 'Correlate MR pipelines to failures', agent: 'Watcher' },
              ].map((t) => (
                <div key={t.tool} className="flex items-start gap-2.5 p-3 rounded-lg bg-slate-800/30 border border-slate-700/30 hover:border-blue-500/20 transition-colors">
                  <div className="w-1.5 h-1.5 rounded-full mt-1.5 bg-emerald-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <p className="text-xs font-mono text-blue-300 truncate">{t.tool}</p>
                      <span className="text-[9px] text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded shrink-0">{t.agent}</span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-0.5">{t.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-700/40 bg-navy-900/60 p-5 space-y-4">
            <h3 className="text-sm font-semibold text-white">Configuration</h3>
            {[
              { label: 'HTTP Transport (Claude Code / Cursor / VS Code)', config: mcpHttpConfig, key: 'http' },
              { label: 'stdio Transport (Claude Desktop / Zed)', config: mcpStdioConfig, key: 'stdio' },
            ].map(({ label, config, key }) => (
              <div key={key}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-slate-300 font-medium">{label}</p>
                  <button onClick={() => copy(config, key)} className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-700/50 text-xs text-slate-400 hover:text-white">
                    {copied === key ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}{copied === key ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <pre className="px-4 py-3 rounded-lg bg-slate-900/80 border border-slate-700/50 font-mono text-xs text-emerald-300 overflow-x-auto">{config}</pre>
              </div>
            ))}
            <div>
              <p className="text-xs text-slate-300 font-medium mb-2">Claude Code CLI</p>
              <div className="px-4 py-3 rounded-lg bg-slate-900/80 border border-slate-700/50 font-mono text-xs text-blue-300 flex items-center gap-2">
                <Terminal className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <span className="flex-1">claude mcp add --transport http GitLab {instanceUrl}/api/v4/mcp</span>
                <button onClick={() => copy(`claude mcp add --transport http GitLab ${instanceUrl}/api/v4/mcp`, 'cli')}>
                  {copied === 'cli' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-slate-500 hover:text-white" />}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {activeTab === 'duo' && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-700/40 bg-navy-900/60 p-5">
              <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><Cpu className="w-4 h-4 text-purple-400" /> Custom Agents (GA)</h3>
              <div className="space-y-2">
                {['Pipeline Watcher', 'Failure Classifier', 'Memory Searcher', 'Fix Generator', 'Pre-Flight Validator', 'Action Agent'].map((name, i) => (
                  <div key={name} className="flex items-center gap-2.5 p-2 rounded-lg bg-slate-800/30">
                    <span className="w-5 h-5 rounded-full bg-purple-500/20 text-purple-400 text-[10px] font-bold flex items-center justify-center">{i + 1}</span>
                    <span className="text-xs text-slate-200">{name}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-slate-700/40 bg-navy-900/60 p-5">
              <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><Search className="w-4 h-4 text-blue-400" /> Custom Flow</h3>
              <div className="rounded-lg bg-slate-800/50 border border-slate-700/30 p-3 font-mono text-[10px] text-slate-300 space-y-1">
                <p className="text-accent-orange">trigger: Pipeline Hook (status=failed)</p>
                <p className="text-slate-500 ml-2">↓</p>
                <p>1. watcher.capture_context()</p>
                <p>2. classifier.analyze_signal()</p>
                <p>3. memory.search_similar()</p>
                <p>4. fix_gen.generate_patch()</p>
                <p>5. validator.lint_and_scan()</p>
                <p className="text-slate-500">if confidence &gt;= 0.85:</p>
                <p className="text-emerald-400 ml-3">6a. action.create_mr()</p>
                <p className="text-slate-500">else:</p>
                <p className="text-amber-400 ml-3">6b. action.escalate()</p>
              </div>
              <p className="mt-3 text-xs text-slate-500">Total: ~7s avg · saves 45 min manual</p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-700/40 bg-navy-900/60 p-5">
            <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2"><BookOpen className="w-4 h-4 text-accent-orange" /> Resources</h3>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Get Started with Agent Platform', url: 'https://docs.gitlab.com/user/get_started/get_started_agent_platform/' },
                { label: 'Custom Agents (GA)', url: 'https://docs.gitlab.com/user/duo_agent_platform/agents/custom/' },
                { label: 'Custom Flows (Beta)', url: 'https://docs.gitlab.com/user/duo_agent_platform/flows/custom/' },
                { label: 'AI Catalog', url: 'https://docs.gitlab.com/user/duo_agent_platform/ai_catalog/' },
                { label: 'MCP Server Docs', url: 'https://docs.gitlab.com/user/gitlab_duo/model_context_protocol/mcp_server/' },
                { label: 'Start 30-Day Ultimate Trial', url: 'https://about.gitlab.com/free-trial/' },
              ].map((link) => (
                <a key={link.label} href={link.url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-between p-3 rounded-lg bg-slate-800/30 border border-slate-700/30 hover:border-accent-orange/30 transition-all group">
                  <p className="text-xs text-slate-300 group-hover:text-white">{link.label}</p>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-600 group-hover:text-accent-orange shrink-0" />
                </a>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
