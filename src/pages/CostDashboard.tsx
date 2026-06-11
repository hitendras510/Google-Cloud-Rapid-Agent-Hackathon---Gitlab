import { useEffect, useState } from 'react';
import { DollarSign, TrendingUp, Zap, Clock } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts';
import { supabase } from '../lib/supabase';

interface CostSummary {
  totalCost: number;
  totalTokens: number;
  avgCostPerFailure: number;
  timeSavedHours: number;
  roi: number;
}

const dailyCosts = [
  { day: 'Jun 1', prompt: 12400, completion: 8200, cost: 0.041 },
  { day: 'Jun 2', prompt: 8900, completion: 5600, cost: 0.029 },
  { day: 'Jun 3', prompt: 15800, completion: 11200, cost: 0.054 },
  { day: 'Jun 4', prompt: 6200, completion: 4100, cost: 0.021 },
  { day: 'Jun 5', prompt: 19300, completion: 14500, cost: 0.067 },
  { day: 'Jun 6', prompt: 11000, completion: 7800, cost: 0.038 },
  { day: 'Jun 7', prompt: 9400, completion: 6200, cost: 0.031 },
  { day: 'Jun 8', prompt: 14100, completion: 9800, cost: 0.048 },
  { day: 'Jun 9', prompt: 7300, completion: 4900, cost: 0.024 },
  { day: 'Jun 10', prompt: 4200, completion: 2800, cost: 0.014 },
];

const agentBreakdown = [
  { name: 'Classifier', tokens: 45200, cost: 0.089, color: '#a855f7' },
  { name: 'Memory Searcher', tokens: 28400, cost: 0.056, color: '#06b6d4' },
  { name: 'Fix Generator', tokens: 78900, cost: 0.156, color: '#f59e0b' },
  { name: 'Validator', tokens: 12300, cost: 0.024, color: '#22c55e' },
  { name: 'Action Agent', tokens: 8700, cost: 0.017, color: '#e8713a' },
];

const roiTrend = [
  { week: 'W1', roi: 32, cost: 0.12, saved: 8.2 },
  { week: 'W2', roi: 38, cost: 0.09, saved: 11.4 },
  { week: 'W3', roi: 44, cost: 0.11, saved: 14.6 },
  { week: 'W4', roi: 47, cost: 0.10, saved: 16.8 },
];

export default function CostDashboard() {
  const [summary, setSummary] = useState<CostSummary>({
    totalCost: 0.42,
    totalTokens: 173500,
    avgCostPerFailure: 0.009,
    timeSavedHours: 31,
    roi: 47,
  });

  useEffect(() => {
    loadCosts();
  }, []);

  async function loadCosts() {
    const { data } = await supabase
      .from('cost_logs')
      .select('*')
      .order('created_at', { ascending: false });

    if (data && data.length > 0) {
      const totalCost = data.reduce((acc, log) => acc + Number(log.usd_cost), 0);
      const totalTokens = data.reduce((acc, log) => acc + log.prompt_tokens + log.completion_tokens, 0);
      setSummary({
        totalCost: totalCost || 0.42,
        totalTokens: totalTokens || 173500,
        avgCostPerFailure: (totalCost / data.length) || 0.009,
        timeSavedHours: 31,
        roi: 47,
      });
    }
  }

  const statCards = [
    { label: 'Total LLM Cost (Month)', value: `$${summary.totalCost.toFixed(2)}`, icon: DollarSign, color: 'text-emerald-400' },
    { label: 'ROI Ratio', value: `${summary.roi}:1`, icon: TrendingUp, color: 'text-accent-orange' },
    { label: 'Time Saved', value: `${summary.timeSavedHours}h`, icon: Clock, color: 'text-blue-400' },
    { label: 'Avg Cost / Failure', value: `$${summary.avgCostPerFailure.toFixed(3)}`, icon: Zap, color: 'text-purple-400' },
  ];

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <header>
        <h1 className="text-2xl font-bold text-white">Cost & ROI</h1>
        <p className="text-slate-400 text-sm mt-1">Token usage, LLM costs, and return on investment tracking</p>
      </header>

      <div className="grid grid-cols-4 gap-4">
        {statCards.map((card) => (
          <div key={card.label} className="rounded-xl border border-slate-700/40 bg-navy-900/60 p-5">
            <div className="flex items-center gap-2 mb-2">
              <card.icon className={`w-4 h-4 ${card.color}`} />
              <span className="text-xs text-slate-400 font-medium">{card.label}</span>
            </div>
            <p className="text-2xl font-bold text-white">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-emerald-400">ROI Summary</h3>
            <p className="text-sm text-slate-400 mt-1">47 failures auto-fixed this month | 31 hours saved | $0.42 LLM cost</p>
          </div>
          <div className="text-right">
            <p className="text-4xl font-bold text-emerald-400">47:1</p>
            <p className="text-xs text-slate-500">Return on Investment</p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-4 pt-3 border-t border-emerald-500/20">
          <div>
            <p className="text-xs text-slate-500">Dev hourly rate (assumed)</p>
            <p className="text-sm font-semibold text-white">$50/hr</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Manual debug time (avg)</p>
            <p className="text-sm font-semibold text-white">45 min/failure</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Value delivered</p>
            <p className="text-sm font-semibold text-emerald-400">$1,550 saved</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 rounded-xl border border-slate-700/40 bg-navy-900/60 p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Daily Token Usage</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={dailyCosts}>
              <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: '#1b2b4b', border: '1px solid #334155', borderRadius: 8 }}
                labelStyle={{ color: '#e2e8f0' }}
              />
              <Bar dataKey="prompt" stackId="a" fill="#3b82f6" radius={[0, 0, 0, 0]} name="Prompt tokens" />
              <Bar dataKey="completion" stackId="a" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="Completion tokens" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-xl border border-slate-700/40 bg-navy-900/60 p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Cost by Agent</h2>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie data={agentBreakdown} dataKey="cost" cx="50%" cy="50%" innerRadius={40} outerRadius={65}>
                {agentBreakdown.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ background: '#1b2b4b', border: '1px solid #334155', borderRadius: 8 }}
                labelStyle={{ color: '#e2e8f0' }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1.5 mt-2">
            {agentBreakdown.map(a => (
              <div key={a.name} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ background: a.color }} />
                  <span className="text-slate-400">{a.name}</span>
                </span>
                <span className="text-slate-300 font-mono">${a.cost.toFixed(3)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-700/40 bg-navy-900/60 p-5">
        <h2 className="text-sm font-semibold text-white mb-4">Weekly ROI Trend</h2>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={roiTrend}>
            <XAxis dataKey="week" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
            <Tooltip
              contentStyle={{ background: '#1b2b4b', border: '1px solid #334155', borderRadius: 8 }}
              labelStyle={{ color: '#e2e8f0' }}
            />
            <Line type="monotone" dataKey="roi" stroke="#22d3ae" strokeWidth={2.5} dot={{ r: 4, fill: '#22d3ae' }} name="ROI" />
            <Line type="monotone" dataKey="saved" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3, fill: '#3b82f6' }} name="Hours saved" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
