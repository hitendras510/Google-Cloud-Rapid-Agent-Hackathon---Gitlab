import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Filter, ExternalLink } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Failure } from '../types/database';
import StatusPill from '../components/StatusPill';
import ConfidenceBadge from '../components/ConfidenceBadge';
import ErrorTypeBadge from '../components/ErrorTypeBadge';

const ERROR_TYPES = ['all', 'syntax', 'dependency', 'test', 'config_env', 'infra_runner', 'flaky_test'];
const STATUSES = ['all', 'diagnosing', 'fix_pending', 'auto_applied', 'escalated', 'reverted', 'resolved'];

export default function Failures() {
  const [failures, setFailures] = useState<Failure[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [errorTypeFilter, setErrorTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    loadFailures();
  }, []);

  async function loadFailures() {
    const { data } = await supabase
      .from('failures')
      .select('*, projects(name, namespace)')
      .order('created_at', { ascending: false });

    if (data) setFailures(data as Failure[]);
    setLoading(false);
  }

  const filtered = failures.filter(f => {
    if (errorTypeFilter !== 'all' && f.error_type !== errorTypeFilter) return false;
    if (statusFilter !== 'all' && f.status !== statusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        f.job_name?.toLowerCase().includes(q) ||
        f.stage?.toLowerCase().includes(q) ||
        f.signal_excerpt?.toLowerCase().includes(q) ||
        f.commit_author?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="p-6 space-y-5 animate-fade-in">
      <header>
        <h1 className="text-2xl font-bold text-white">Pipeline Failures</h1>
        <p className="text-slate-400 text-sm mt-1">All captured CI/CD pipeline failures with agent diagnostics</p>
      </header>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search by job, stage, author, or error..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-navy-900/80 border border-slate-700/50 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-accent-orange/50 transition-colors"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-500" />
          <select
            value={errorTypeFilter}
            onChange={(e) => setErrorTypeFilter(e.target.value)}
            className="px-3 py-2.5 rounded-lg bg-navy-900/80 border border-slate-700/50 text-sm text-slate-300 focus:outline-none focus:border-accent-orange/50"
          >
            {ERROR_TYPES.map(t => (
              <option key={t} value={t}>{t === 'all' ? 'All Types' : t.replace('_', '/')}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2.5 rounded-lg bg-navy-900/80 border border-slate-700/50 text-sm text-slate-300 focus:outline-none focus:border-accent-orange/50"
          >
            {STATUSES.map(s => (
              <option key={s} value={s}>{s === 'all' ? 'All Statuses' : s.replace('_', ' ')}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="rounded-xl border border-slate-700/40 bg-navy-900/60 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700/40">
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Time</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Project</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Job / Stage</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Type</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Confidence</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Fix Time</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">MR</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/30">
              {loading ? (
                [...Array(8)].map((_, i) => (
                  <tr key={i}>
                    <td colSpan={8} className="px-4 py-3"><div className="h-5 bg-slate-800/50 rounded animate-pulse" /></td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-sm text-slate-500">
                    No failures match your filters
                  </td>
                </tr>
              ) : (
                filtered.map((f) => (
                  <tr key={f.id} className="hover:bg-slate-800/20 transition-colors group">
                    <td className="px-4 py-3 text-xs text-slate-400 font-mono">
                      {new Date(f.created_at).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300">
                      {(f as Failure & { projects?: { name: string } }).projects?.name || 'Unknown'}
                    </td>
                    <td className="px-4 py-3">
                      <Link to={`/trace/${f.id}`} className="text-sm text-slate-200 hover:text-accent-orange transition-colors">
                        {f.job_name}
                      </Link>
                      <p className="text-xs text-slate-500">{f.stage}</p>
                    </td>
                    <td className="px-4 py-3"><ErrorTypeBadge type={f.error_type} /></td>
                    <td className="px-4 py-3"><ConfidenceBadge score={f.confidence_score} size="sm" /></td>
                    <td className="px-4 py-3"><StatusPill status={f.status} /></td>
                    <td className="px-4 py-3 text-xs font-mono text-slate-400">
                      {f.time_to_fix_ms ? `${(f.time_to_fix_ms / 1000).toFixed(1)}s` : '--'}
                    </td>
                    <td className="px-4 py-3">
                      {f.fix_mr_url ? (
                        <a href={f.fix_mr_url} target="_blank" rel="noopener noreferrer" className="text-accent-orange hover:text-orange-300">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      ) : (
                        <span className="text-slate-600">--</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
