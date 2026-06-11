import { Shield, Zap, Search, GitMerge, CheckCircle2, Activity, ArrowRight, Server, Cpu, Database } from 'lucide-react';

const agents = [
  { id: 1, name: 'Pipeline Watcher', icon: Activity, color: 'from-blue-500 to-blue-600', desc: 'Receives GitLab Pipeline Hook. Extracts job, stage, exit code, commit metadata. Fetches job trace via MCP get_pipeline_jobs.', tool: 'get_pipeline_jobs', time: '420ms' },
  { id: 2, name: 'Failure Classifier', icon: Zap, color: 'from-amber-500 to-orange-500', desc: 'Sends log signal to Gemini 2.5 Flash. Classifies into: syntax, dependency, test, config_env, infra_runner, or flaky_test.', tool: 'Gemini 2.5 Flash', time: '810ms' },
  { id: 3, name: 'Memory Searcher', icon: Search, color: 'from-cyan-500 to-blue-600', desc: 'Queries Supabase vector embeddings for similar past failures. Retrieves top matches and historical fix patterns.', tool: 'semantic_code_search', time: '220ms' },
  { id: 4, name: 'Fix Generator', icon: GitMerge, color: 'from-emerald-500 to-green-600', desc: 'Generates patch diff using Gemini + best-matched historical fix. Computes weighted confidence score.', tool: 'Gemini 2.5 Flash', time: '1240ms' },
  { id: 5, name: 'Pre-Flight Validator', icon: CheckCircle2, color: 'from-violet-500 to-purple-600', desc: 'Validates patch via GitLab CI Lint API. Runs OSV security scan. Confirms no regressions.', tool: 'lint_ci + OSV', time: '350ms' },
  { id: 6, name: 'Action Agent', icon: Shield, color: 'from-accent-orange to-red-500', desc: 'confidence ≥ 0.85 → creates MR via MCP + retries pipeline. 0.60–0.84 → sends for approval. <0.60 → escalates on-call.', tool: 'create_merge_request', time: '3900ms' },
];

export default function Architecture() {
  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <header className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-orange to-red-600 flex items-center justify-center shadow-lg shadow-accent-orange/20">
          <Cpu className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Architecture</h1>
          <p className="text-slate-400 text-sm">6-Agent autonomous pipeline · webhook → merge request in ~7s</p>
        </div>
      </header>

      {/* Flow strip */}
      <div className="rounded-2xl border border-slate-700/40 bg-navy-900/60 p-6 overflow-x-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-white">Agent Pipeline Flow</h2>
          <div className="flex items-center gap-4 text-xs text-slate-500">
            <span>Total avg: <span className="text-accent-orange font-bold">~6.94s</span></span>
            <span>vs manual: <span className="text-red-400 font-bold">~45 min</span></span>
          </div>
        </div>
        <div className="flex items-center gap-2 min-w-max">
          <div className="shrink-0 p-3 rounded-xl border border-slate-600/50 bg-slate-800/50 min-w-[130px]">
            <p className="text-[10px] text-slate-500 uppercase mb-1">Trigger</p>
            <p className="text-xs font-medium text-white">GitLab Pipeline Hook</p>
            <p className="text-[10px] text-red-400 mt-1">status: failed</p>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-600 shrink-0" />
          {agents.map((agent, i) => (
            <div key={agent.id} className="flex items-center gap-2 shrink-0">
              <div className="p-3 rounded-xl border border-slate-600/50 bg-slate-800/50 min-w-[130px] hover:border-accent-orange/30 transition-colors">
                <div className={`w-6 h-6 rounded-md bg-gradient-to-br ${agent.color} flex items-center justify-center mb-2`}>
                  <agent.icon className="w-3 h-3 text-white" />
                </div>
                <p className="text-[10px] text-slate-500">Agent {agent.id}</p>
                <p className="text-xs font-medium text-white">{agent.name}</p>
                <p className="text-[10px] text-accent-orange mt-1">{agent.time}</p>
              </div>
              {i < agents.length - 1 && <ArrowRight className="w-3 h-3 text-slate-700 shrink-0" />}
            </div>
          ))}
          <ArrowRight className="w-4 h-4 text-slate-600 shrink-0" />
          <div className="shrink-0 p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 min-w-[130px]">
            <p className="text-[10px] text-emerald-500 uppercase mb-1">Output</p>
            <p className="text-xs font-medium text-white">Merge Request</p>
            <p className="text-[10px] text-emerald-400 mt-1">+ pipeline retry</p>
          </div>
        </div>
      </div>

      {/* Agent cards */}
      <div className="grid grid-cols-2 gap-4">
        {agents.map((agent) => (
          <div key={agent.id} className="rounded-xl border border-slate-700/40 bg-navy-900/60 p-4 hover:border-accent-orange/20 transition-colors">
            <div className="flex items-start gap-3">
              <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${agent.color} flex items-center justify-center shadow-md shrink-0`}>
                <agent.icon className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white"><span className="text-slate-500 font-normal mr-1">#{agent.id}</span>{agent.name}</h3>
                  <span className="text-[10px] text-accent-orange bg-accent-orange/10 px-1.5 py-0.5 rounded">{agent.time}</span>
                </div>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">{agent.desc}</p>
                <div className="mt-2 flex items-center gap-1.5">
                  <span className="text-[10px] text-slate-500">MCP Tool:</span>
                  <code className="text-[10px] text-blue-300 bg-blue-500/10 px-1.5 py-0.5 rounded">{agent.tool}</code>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Decision logic */}
        <div className="rounded-xl border border-slate-700/40 bg-navy-900/60 p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Action Agent Decision Logic</h2>
          <div className="space-y-3">
            {[
              { range: 'confidence ≥ 0.85', label: 'Auto-Apply', color: 'emerald', action: 'Creates MR via MCP, retries pipeline, notifies author' },
              { range: '0.60 ≤ confidence < 0.85', label: 'Fix Pending', color: 'amber', action: 'Sends fix to author via Slack with approve/reject buttons' },
              { range: 'confidence < 0.60', label: 'Escalated', color: 'red', action: 'Pages on-call engineer with full diagnostic context + trace' },
            ].map((d) => (
              <div key={d.label} className={`p-3 rounded-lg border border-${d.color}-500/20 bg-${d.color}-500/5`}>
                <div className="flex items-center gap-2 mb-1">
                  <div className={`w-2 h-2 rounded-full bg-${d.color}-400`} />
                  <span className={`text-xs font-medium text-${d.color}-400`}>{d.label}</span>
                  <code className="text-[10px] text-slate-400 ml-auto">{d.range}</code>
                </div>
                <p className="text-[10px] text-slate-500 ml-4">{d.action}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Confidence formula + integrations */}
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-700/40 bg-navy-900/60 p-5">
            <h2 className="text-sm font-semibold text-white mb-3">Confidence Score Formula</h2>
            <div className="px-3 py-3 rounded-lg bg-slate-900/80 border border-slate-700/50 font-mono text-xs leading-relaxed">
              <span className="text-accent-orange">score</span><span className="text-slate-400"> = </span>
              <span className="text-blue-300">0.40</span><span className="text-slate-500"> × </span><span className="text-emerald-300">similarity</span>
              <span className="text-slate-500"> + </span><span className="text-blue-300">0.30</span><span className="text-slate-500"> × </span><span className="text-emerald-300">classifier</span>
              <span className="text-slate-500"> + </span><span className="text-blue-300">0.20</span><span className="text-slate-500"> × </span><span className="text-emerald-300">validation</span>
              <span className="text-slate-500"> + </span><span className="text-blue-300">0.10</span><span className="text-slate-500"> × </span><span className="text-emerald-300">frequency</span>
            </div>
          </div>
          <div className="rounded-xl border border-slate-700/40 bg-navy-900/60 p-5">
            <h2 className="text-sm font-semibold text-white mb-3">Core Integrations</h2>
            <div className="space-y-2">
              {[
                { icon: Server, name: 'GitLab MCP Server', desc: '8 tools: pipeline, MR, search' },
                { icon: Cpu, name: 'Gemini 2.5 Flash', desc: 'Classification + fix generation' },
                { icon: Database, name: 'Supabase Vector', desc: 'Semantic similarity search' },
                { icon: Zap, name: 'Duo Agent Platform', desc: 'Custom agents + custom flows' },
              ].map(({ icon: Icon, name, desc }) => (
                <div key={name} className="flex items-center gap-3 p-2 rounded-lg bg-slate-800/30">
                  <div className="w-7 h-7 rounded-md bg-slate-700/50 flex items-center justify-center shrink-0"><Icon className="w-3.5 h-3.5 text-slate-300" /></div>
                  <div><p className="text-xs font-medium text-white">{name}</p><p className="text-[10px] text-slate-500">{desc}</p></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
