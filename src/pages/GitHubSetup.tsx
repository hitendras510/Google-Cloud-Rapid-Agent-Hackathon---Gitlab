import { useState, useEffect } from 'react';
import { Github, Copy, Check, Webhook, Zap, Shield, ArrowRight, ExternalLink, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Installation {
  id: string;
  github_owner: string;
  github_repo: string;
  is_active: boolean;
  events_received: number;
  last_event_at: string | null;
  created_at: string;
}

export default function GitHubSetup() {
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [owner, setOwner] = useState('');
  const [repo, setRepo] = useState('');
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/github-webhook`;

  useEffect(() => {
    loadInstallations();
  }, []);

  async function loadInstallations() {
    const { data } = await supabase.from('installations').select('*').order('created_at', { ascending: false });
    if (data) setInstallations(data);
  }

  async function handleSetup() {
    if (!owner || !repo) {
      setError('Owner and repo are required');
      return;
    }
    setLoading(true);
    setError('');
    setSuccess('');

    const { error: insertError } = await supabase.from('installations').upsert({
      github_owner: owner,
      github_repo: repo,
      github_token_encrypted: token || null,
      is_active: true,
    }, { onConflict: 'github_owner,github_repo' });

    if (insertError) {
      setError(insertError.message);
    } else {
      setSuccess(`Registered ${owner}/${repo}! Now configure the webhook on GitHub.`);
      setOwner('');
      setRepo('');
      setToken('');
      loadInstallations();
    }
    setLoading(false);
  }

  function copyWebhookUrl() {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <header>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center">
            <Github className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Connect GitHub</h1>
            <p className="text-slate-400 text-sm">Install PipelineGuardian on your GitHub repos in 3 steps</p>
          </div>
        </div>
      </header>

      {/* Steps Guide */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-700/40 bg-navy-900/60 p-5 relative">
          <div className="absolute -top-3 left-4 px-2 py-0.5 bg-accent-orange rounded text-xs font-bold text-white">Step 1</div>
          <Webhook className="w-5 h-5 text-accent-orange mt-2 mb-3" />
          <h3 className="text-sm font-semibold text-white mb-1">Register Your Repo</h3>
          <p className="text-xs text-slate-400 leading-relaxed">Enter your GitHub owner/repo below. We'll generate a unique webhook secret for signature verification.</p>
        </div>
        <div className="rounded-xl border border-slate-700/40 bg-navy-900/60 p-5 relative">
          <div className="absolute -top-3 left-4 px-2 py-0.5 bg-accent-orange rounded text-xs font-bold text-white">Step 2</div>
          <Github className="w-5 h-5 text-accent-orange mt-2 mb-3" />
          <h3 className="text-sm font-semibold text-white mb-1">Configure Webhook on GitHub</h3>
          <p className="text-xs text-slate-400 leading-relaxed">Go to Repo Settings &gt; Webhooks &gt; Add webhook. Paste the URL below and select <code className="text-accent-orange">workflow_run</code> events.</p>
        </div>
        <div className="rounded-xl border border-slate-700/40 bg-navy-900/60 p-5 relative">
          <div className="absolute -top-3 left-4 px-2 py-0.5 bg-accent-orange rounded text-xs font-bold text-white">Step 3</div>
          <Zap className="w-5 h-5 text-accent-orange mt-2 mb-3" />
          <h3 className="text-sm font-semibold text-white mb-1">Push a Failing Workflow</h3>
          <p className="text-xs text-slate-400 leading-relaxed">Push code that breaks your CI. PipelineGuardian will capture it, analyze the failure, and create a fix PR automatically.</p>
        </div>
      </div>

      {/* Webhook URL */}
      <div className="rounded-xl border border-accent-orange/30 bg-accent-orange/5 p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white mb-1">Your Webhook URL</h3>
            <p className="text-xs text-slate-400">Paste this in GitHub &gt; Repo &gt; Settings &gt; Webhooks &gt; Payload URL</p>
          </div>
          <button
            onClick={copyWebhookUrl}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent-orange/10 border border-accent-orange/30 text-accent-orange text-xs font-medium hover:bg-accent-orange/20 transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied!' : 'Copy URL'}
          </button>
        </div>
        <div className="mt-3 px-4 py-2.5 rounded-lg bg-navy-900/80 border border-slate-700/50 font-mono text-xs text-slate-200 break-all">
          {webhookUrl}
        </div>
        <div className="mt-3 flex items-center gap-4 text-xs text-slate-500">
          <span>Content type: <code className="text-slate-300">application/json</code></span>
          <span>Events: <code className="text-slate-300">workflow_run</code></span>
        </div>
      </div>

      {/* Register Repo Form */}
      <div className="rounded-xl border border-slate-700/40 bg-navy-900/60 p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Register a Repository</h3>

        {error && (
          <div className="mb-4 flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
            <AlertCircle className="w-3.5 h-3.5" />
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs">
            <Check className="w-3.5 h-3.5" />
            {success}
          </div>
        )}

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-slate-400 block mb-1.5">GitHub Owner</label>
            <input
              type="text"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              placeholder="your-username"
              className="w-full px-3 py-2.5 rounded-lg bg-slate-800/60 border border-slate-700/50 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-accent-orange/50 transition-colors"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1.5">Repository Name</label>
            <input
              type="text"
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
              placeholder="my-project"
              className="w-full px-3 py-2.5 rounded-lg bg-slate-800/60 border border-slate-700/50 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-accent-orange/50 transition-colors"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1.5">GitHub PAT (optional)</label>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="ghp_xxxxxxxxxxxx"
              className="w-full px-3 py-2.5 rounded-lg bg-slate-800/60 border border-slate-700/50 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-accent-orange/50 transition-colors"
            />
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          PAT is needed to fetch logs and create PRs. Required scopes: <code className="text-slate-400">repo</code>, <code className="text-slate-400">actions:read</code>
        </p>
        <button
          onClick={handleSetup}
          disabled={loading || !owner || !repo}
          className="mt-4 flex items-center gap-2 px-5 py-2.5 rounded-lg bg-accent-orange text-white text-sm font-medium hover:bg-orange-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Shield className="w-4 h-4" />
          {loading ? 'Registering...' : 'Register Repository'}
        </button>
      </div>

      {/* Connected Repos */}
      {installations.length > 0 && (
        <div className="rounded-xl border border-slate-700/40 bg-navy-900/60 p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Connected Repositories</h3>
          <div className="space-y-2">
            {installations.map((inst) => (
              <div key={inst.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-800/30 border border-slate-700/30">
                <div className="flex items-center gap-3">
                  <Github className="w-4 h-4 text-slate-400" />
                  <div>
                    <p className="text-sm font-medium text-white">{inst.github_owner}/{inst.github_repo}</p>
                    <p className="text-xs text-slate-500">
                      {inst.events_received} events received
                      {inst.last_event_at && ` | Last: ${new Date(inst.last_event_at).toLocaleDateString()}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`flex items-center gap-1.5 text-xs ${inst.is_active ? 'text-emerald-400' : 'text-slate-500'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${inst.is_active ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                    {inst.is_active ? 'Active' : 'Inactive'}
                  </span>
                  <a
                    href={`https://github.com/${inst.github_owner}/${inst.github_repo}/settings/hooks`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-slate-400 hover:text-white"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* GitHub Webhook Config Guide */}
      <div className="rounded-xl border border-slate-700/40 bg-navy-900/60 p-5">
        <h3 className="text-sm font-semibold text-white mb-3">GitHub Webhook Configuration Guide</h3>
        <div className="space-y-3">
          {[
            { step: 1, text: 'Go to your GitHub repo', detail: 'Settings > Webhooks > Add webhook' },
            { step: 2, text: 'Set Payload URL', detail: 'Paste the webhook URL shown above' },
            { step: 3, text: 'Set Content type', detail: 'application/json' },
            { step: 4, text: 'Select events', detail: 'Choose "Let me select individual events" > check "Workflow runs"' },
            { step: 5, text: 'Activate', detail: 'Click "Add webhook" - GitHub will send a ping event to verify' },
          ].map(({ step, text, detail }) => (
            <div key={step} className="flex items-start gap-3">
              <span className="w-5 h-5 rounded-full bg-accent-orange/20 text-accent-orange text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                {step}
              </span>
              <div>
                <p className="text-sm text-slate-200">{text}</p>
                <p className="text-xs text-slate-500">{detail}</p>
              </div>
            </div>
          ))}
        </div>
        <a
          href="https://docs.github.com/en/webhooks/using-webhooks/creating-webhooks"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 mt-4 text-xs text-accent-orange hover:text-orange-300"
        >
          GitHub Webhooks Documentation <ArrowRight className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
}
