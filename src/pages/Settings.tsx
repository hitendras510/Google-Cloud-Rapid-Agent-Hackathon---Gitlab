import { useEffect, useState } from 'react';
import { Settings, Shield, Bell, Link2, Save, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { TeamPolicy } from '../types/database';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<'policies' | 'integrations' | 'notifications'>('policies');
  const [policy, setPolicy] = useState<TeamPolicy | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadPolicy();
  }, []);

  async function loadPolicy() {
    const { data } = await supabase
      .from('team_policies')
      .select('*')
      .eq('team_id', 'default')
      .maybeSingle();

    if (data) {
      setPolicy(data as TeamPolicy);
    } else {
      setPolicy({
        id: '',
        team_id: 'default',
        team_name: 'Default Team',
        auto_apply_threshold: 0.85,
        allowed_actions: 'mr_only',
        protected_branches: ['main', 'production'],
        blast_radius_cap: 5,
        locale: 'en',
        quiet_hours_start: '22:00',
        quiet_hours_end: '08:00',
        slack_channel: '#ci-failures',
        created_at: new Date().toISOString(),
      });
    }
  }

  async function savePolicy() {
    if (!policy) return;
    setSaving(true);

    const payload = {
      team_id: policy.team_id,
      team_name: policy.team_name,
      auto_apply_threshold: policy.auto_apply_threshold,
      allowed_actions: policy.allowed_actions,
      protected_branches: policy.protected_branches,
      blast_radius_cap: policy.blast_radius_cap,
      locale: policy.locale,
      quiet_hours_start: policy.quiet_hours_start,
      quiet_hours_end: policy.quiet_hours_end,
      slack_channel: policy.slack_channel,
    };

    if (policy.id) {
      await supabase.from('team_policies').update(payload).eq('id', policy.id);
    } else {
      await supabase.from('team_policies').insert(payload);
    }
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const tabs = [
    { id: 'policies' as const, label: 'Team Policies', icon: Shield },
    { id: 'integrations' as const, label: 'Integrations', icon: Link2 },
    { id: 'notifications' as const, label: 'Notifications', icon: Bell },
  ];

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <header className="flex items-center gap-3">
        <Settings className="w-6 h-6 text-slate-400" />
        <div>
          <h1 className="text-2xl font-bold text-white">Settings</h1>
          <p className="text-slate-400 text-sm">Configure agent behavior, integrations, and team policies</p>
        </div>
      </header>

      <div className="flex gap-1 border-b border-slate-700/40 pb-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-accent-orange text-accent-orange'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'policies' && policy && (
        <div className="max-w-2xl space-y-6">
          <div className="rounded-xl border border-slate-700/40 bg-navy-900/60 p-6 space-y-5">
            <h3 className="text-sm font-semibold text-white">Confidence Threshold</h3>
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-slate-400">Auto-apply threshold</label>
                <span className="text-sm font-mono text-accent-orange">{policy.auto_apply_threshold.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={policy.auto_apply_threshold}
                onChange={(e) => setPolicy({ ...policy, auto_apply_threshold: parseFloat(e.target.value) })}
                className="w-full h-1.5 rounded-full appearance-none bg-slate-700 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent-orange"
              />
              <div className="flex justify-between mt-1 text-[10px] text-slate-500">
                <span>0.0 (always comment)</span>
                <span>0.60 (elicit)</span>
                <span>0.85 (auto-apply)</span>
                <span>1.0</span>
              </div>
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-2">Allowed Actions</label>
              <div className="flex gap-2">
                {(['comment_only', 'mr_only', 'mr_and_merge'] as const).map(action => (
                  <button
                    key={action}
                    onClick={() => setPolicy({ ...policy, allowed_actions: action })}
                    className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                      policy.allowed_actions === action
                        ? 'bg-accent-orange/15 text-accent-orange border border-accent-orange/30'
                        : 'bg-slate-800/50 text-slate-400 border border-slate-700/50 hover:text-white'
                    }`}
                  >
                    {action.replace(/_/g, ' ')}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-2">Blast Radius Cap (max files)</label>
              <input
                type="number"
                min="1"
                max="20"
                value={policy.blast_radius_cap}
                onChange={(e) => setPolicy({ ...policy, blast_radius_cap: parseInt(e.target.value) || 5 })}
                className="w-24 px-3 py-2 rounded-lg bg-slate-800/60 border border-slate-700/50 text-sm text-white focus:outline-none focus:border-accent-orange/50"
              />
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-2">Protected Branches</label>
              <input
                type="text"
                value={policy.protected_branches.join(', ')}
                onChange={(e) => setPolicy({ ...policy, protected_branches: e.target.value.split(',').map(b => b.trim()) })}
                className="w-full px-3 py-2 rounded-lg bg-slate-800/60 border border-slate-700/50 text-sm text-white focus:outline-none focus:border-accent-orange/50"
                placeholder="main, production"
              />
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-2">Language/Locale</label>
              <select
                value={policy.locale}
                onChange={(e) => setPolicy({ ...policy, locale: e.target.value })}
                className="px-3 py-2 rounded-lg bg-slate-800/60 border border-slate-700/50 text-sm text-white focus:outline-none focus:border-accent-orange/50"
              >
                <option value="en">English</option>
                <option value="hinglish">Hinglish</option>
                <option value="hi">Hindi</option>
              </select>
            </div>
          </div>

          <button
            onClick={savePolicy}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-accent-orange text-white text-sm font-medium hover:bg-orange-500 transition-colors disabled:opacity-50"
          >
            {saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saved ? 'Saved!' : saving ? 'Saving...' : 'Save Policy'}
          </button>
        </div>
      )}

      {activeTab === 'integrations' && (
        <div className="max-w-2xl space-y-4">
          {[
            { name: 'GitHub Webhooks', desc: 'workflow_run events for CI/CD failure detection', status: 'connected', color: 'bg-emerald-400' },
            { name: 'GitHub API', desc: 'Fetch logs, create fix PRs, re-run workflows', status: 'connected', color: 'bg-emerald-400' },
            { name: 'Gemini 2.5 Flash', desc: 'Classification and fix generation', status: 'connected', color: 'bg-emerald-400' },
            { name: 'Supabase Vector', desc: 'Embeddings-based similarity search for past fixes', status: 'connected', color: 'bg-emerald-400' },
            { name: 'Slack', desc: 'Smart notifications with interactive buttons', status: 'configured', color: 'bg-amber-400' },
          ].map((integration) => (
            <div key={integration.name} className="flex items-center justify-between p-4 rounded-xl border border-slate-700/40 bg-navy-900/60">
              <div>
                <h3 className="text-sm font-medium text-white">{integration.name}</h3>
                <p className="text-xs text-slate-400 mt-0.5">{integration.desc}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${integration.color}`} />
                <span className="text-xs text-slate-400 capitalize">{integration.status}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'notifications' && policy && (
        <div className="max-w-2xl space-y-6">
          <div className="rounded-xl border border-slate-700/40 bg-navy-900/60 p-6 space-y-5">
            <h3 className="text-sm font-semibold text-white">Slack Configuration</h3>
            <div>
              <label className="text-xs text-slate-400 block mb-2">Failure Channel</label>
              <input
                type="text"
                value={policy.slack_channel || ''}
                onChange={(e) => setPolicy({ ...policy, slack_channel: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-slate-800/60 border border-slate-700/50 text-sm text-white focus:outline-none focus:border-accent-orange/50"
                placeholder="#ci-failures"
              />
            </div>
            <h3 className="text-sm font-semibold text-white pt-2">Quiet Hours</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-400 block mb-2">Start</label>
                <input
                  type="time"
                  value={policy.quiet_hours_start || '22:00'}
                  onChange={(e) => setPolicy({ ...policy, quiet_hours_start: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800/60 border border-slate-700/50 text-sm text-white focus:outline-none focus:border-accent-orange/50"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-2">End</label>
                <input
                  type="time"
                  value={policy.quiet_hours_end || '08:00'}
                  onChange={(e) => setPolicy({ ...policy, quiet_hours_end: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800/60 border border-slate-700/50 text-sm text-white focus:outline-none focus:border-accent-orange/50"
                />
              </div>
            </div>
            <p className="text-xs text-slate-500">During quiet hours, only on-call engineer gets notified for HIGH severity failures.</p>
          </div>
        </div>
      )}
    </div>
  );
}
