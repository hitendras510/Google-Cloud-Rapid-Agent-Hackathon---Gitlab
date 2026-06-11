import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Eye, Brain, Database, Wrench, ShieldCheck, Rocket,
  Clock, ArrowRight, GitPullRequest, CheckCircle2, Copy
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Failure, FailureTrace } from '../types/database';
import ConfidenceBadge from '../components/ConfidenceBadge';
import StatusPill from '../components/StatusPill';
import ErrorTypeBadge from '../components/ErrorTypeBadge';

const STEP_CONFIG: Record<string, { icon: React.ElementType; label: string; color: string }> = {
  watcher: { icon: Eye, label: 'Pipeline Watcher', color: 'bg-blue-500' },
  classifier: { icon: Brain, label: 'Failure Classifier', color: 'bg-purple-500' },
  memory_search: { icon: Database, label: 'Memory Search', color: 'bg-cyan-500' },
  fix_generator: { icon: Wrench, label: 'Fix Generator', color: 'bg-amber-500' },
  validator: { icon: ShieldCheck, label: 'Pre-Flight Validator', color: 'bg-emerald-500' },
  action: { icon: Rocket, label: 'Action Agent', color: 'bg-accent-orange' },
};

export default function TraceViewer() {
  const { id } = useParams();
  const [failure, setFailure] = useState<Failure | null>(null);
  const [traces, setTraces] = useState<FailureTrace[]>([]);
  const [failures, setFailures] = useState<Failure[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      loadTrace(id);
    } else {
      loadFailuresList();
    }
  }, [id]);

  async function loadTrace(failureId: string) {
    setLoading(true);
    const [failureRes, tracesRes] = await Promise.all([
      supabase.from('failures').select('*, projects(name, namespace)').eq('id', failureId).maybeSingle(),
      supabase.from('failure_traces').select('*').eq('failure_id', failureId).order('step_order'),
    ]);
    if (failureRes.data) setFailure(failureRes.data as Failure);
    if (tracesRes.data) setTraces(tracesRes.data as FailureTrace[]);
    setLoading(false);
  }

  async function loadFailuresList() {
    const { data } = await supabase
      .from('failures')
      .select('*, projects(name)')
      .order('created_at', { ascending: false })
      .limit(20);
    if (data) setFailures(data as Failure[]);
    setLoading(false);
  }

  if (!id) {
    return (
      <div className="p-6 space-y-5 animate-fade-in">
        <header>
          <h1 className="text-2xl font-bold text-white">Trace Viewer</h1>
          <p className="text-slate-400 text-sm mt-1">Select a failure to view its full provenance timeline</p>
        </header>
        <div className="grid grid-cols-2 gap-3">
          {loading ? (
            [...Array(6)].map((_, i) => <div key={i} className="h-24 rounded-xl bg-slate-800/50 animate-pulse" />)
          ) : failures.length === 0 ? (
            <p className="col-span-2 text-center text-slate-500 py-12">No failures to display. Seed demo data first.</p>
          ) : (
            failures.map(f => (
              <Link
                key={f.id}
                to={`/trace/${f.id}`}
                className="p-4 rounded-xl border border-slate-700/40 bg-navy-900/60 hover:border-accent-orange/40 transition-all group"
              >
                <div className="flex items-center justify-between mb-2">
                  <ErrorTypeBadge type={f.error_type} />
                  <StatusPill status={f.status} />
                </div>
                <p className="text-sm font-medium text-slate-200 group-hover:text-white">{f.job_name} <span className="text-slate-500">/ {f.stage}</span></p>
                <div className="flex items-center gap-3 mt-2">
                  <ConfidenceBadge score={f.confidence_score} size="sm" />
                  {f.time_to_fix_ms && (
                    <span className="text-xs text-slate-500 font-mono">{(f.time_to_fix_ms / 1000).toFixed(1)}s fix</span>
                  )}
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="space-y-4">
          {[...Array(6)].map((_, i) => <div key={i} className="h-20 rounded-xl bg-slate-800/50 animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (!failure) {
    return (
      <div className="p-6 text-center py-20">
        <p className="text-slate-400">Failure not found</p>
        <Link to="/trace" className="text-accent-orange text-sm mt-2 inline-block">Back to list</Link>
      </div>
    );
  }

  const totalDuration = traces.reduce((acc, t) => acc + (t.duration_ms || 0), 0);

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex items-center gap-2 text-sm">
        <Link to="/trace" className="text-slate-400 hover:text-white">Traces</Link>
        <ArrowRight className="w-3 h-3 text-slate-600" />
        <span className="text-slate-200">{failure.job_name}</span>
      </div>

      <div className="rounded-xl border border-slate-700/40 bg-navy-900/60 p-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <ErrorTypeBadge type={failure.error_type} />
              <StatusPill status={failure.status} />
              <ConfidenceBadge score={failure.confidence_score} />
            </div>
            <h2 className="text-lg font-semibold text-white">
              {failure.job_name} <span className="text-slate-500 font-normal">on stage</span> {failure.stage}
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              Pipeline #{failure.pipeline_id} by <span className="text-slate-300">{failure.commit_author}</span> on <span className="text-slate-300">{failure.branch}</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-accent-teal font-mono">{(totalDuration / 1000).toFixed(1)}s</p>
            <p className="text-xs text-slate-500">Total fix time</p>
          </div>
        </div>

        {totalDuration > 0 && (
          <div className="mt-4 flex rounded-full overflow-hidden h-2 bg-slate-800">
            {traces.map((t) => {
              const pct = (t.duration_ms / totalDuration) * 100;
              const cfg = STEP_CONFIG[t.step_name];
              return (
                <div
                  key={t.id}
                  className={`${cfg?.color || 'bg-slate-600'} transition-all`}
                  style={{ width: `${pct}%` }}
                  title={`${cfg?.label}: ${t.duration_ms}ms`}
                />
              );
            })}
          </div>
        )}
      </div>

      {failure.signal_excerpt && (
        <div className="rounded-xl border border-slate-700/40 bg-navy-900/60 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-white">Signal Excerpt</h3>
            <button
              onClick={() => navigator.clipboard.writeText(failure.signal_excerpt || '')}
              className="text-slate-500 hover:text-white p-1"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
          <pre className="font-mono text-xs text-red-300 bg-slate-900/80 rounded-lg p-4 overflow-x-auto whitespace-pre-wrap">
            {failure.signal_excerpt}
          </pre>
        </div>
      )}

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-white">Agent Pipeline Trace</h3>
        {traces.length === 0 ? (
          <p className="text-sm text-slate-500 py-4">No trace data available for this failure.</p>
        ) : (
          traces.map((trace, i) => {
            const cfg = STEP_CONFIG[trace.step_name];
            const Icon = cfg?.icon || Eye;
            return (
              <div
                key={trace.id}
                className="rounded-xl border border-slate-700/40 bg-navy-900/60 p-4 animate-slide-up"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <div className="flex items-start gap-4">
                  <div className={`w-9 h-9 rounded-lg ${cfg?.color || 'bg-slate-600'} flex items-center justify-center shrink-0`}>
                    <Icon className="w-4.5 h-4.5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-medium text-white">{cfg?.label || trace.step_name}</h4>
                      <div className="flex items-center gap-2">
                        <Clock className="w-3 h-3 text-slate-500" />
                        <span className="text-xs font-mono text-slate-400">{trace.duration_ms}ms</span>
                      </div>
                    </div>
                    {trace.input_summary && (
                      <p className="text-xs text-slate-500 mt-1">{trace.input_summary}</p>
                    )}
                    {trace.output_summary && (
                      <div className="mt-2 px-3 py-2 rounded-md bg-slate-800/60 border border-slate-700/30">
                        <p className="text-xs text-slate-300">{trace.output_summary}</p>
                      </div>
                    )}
                    {trace.metadata && Object.keys(trace.metadata).length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {Object.entries(trace.metadata).map(([key, value]) => (
                          <span key={key} className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                            {key}: {String(value)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {failure.fix_diff && (
        <div className="rounded-xl border border-slate-700/40 bg-navy-900/60 p-5">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <GitPullRequest className="w-4 h-4 text-accent-orange" />
            Generated Fix Diff
          </h3>
          <pre className="font-mono text-xs bg-slate-900/80 rounded-lg p-4 overflow-x-auto whitespace-pre-wrap">
            {failure.fix_diff.split('\n').map((line, i) => (
              <span key={i} className={line.startsWith('+') ? 'text-emerald-400' : line.startsWith('-') ? 'text-red-400' : 'text-slate-400'}>
                {line}{'\n'}
              </span>
            ))}
          </pre>
          {failure.fix_mr_url && (
            <a
              href={failure.fix_mr_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 mt-3 px-4 py-2 rounded-lg bg-accent-orange/10 border border-accent-orange/30 text-accent-orange text-sm font-medium hover:bg-accent-orange/20 transition-colors"
            >
              <CheckCircle2 className="w-4 h-4" />
              View Merge Request
            </a>
          )}
        </div>
      )}
    </div>
  );
}
