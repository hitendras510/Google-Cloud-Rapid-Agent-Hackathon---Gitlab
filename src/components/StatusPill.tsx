interface StatusPillProps {
  status: string;
}

const statusConfig: Record<string, { label: string; dot: string; bg: string; text: string }> = {
  diagnosing: { label: 'Diagnosing', dot: 'bg-blue-400', bg: 'bg-blue-500/10', text: 'text-blue-400' },
  fix_pending: { label: 'Fix Pending', dot: 'bg-amber-400', bg: 'bg-amber-500/10', text: 'text-amber-400' },
  auto_applied: { label: 'Auto-Applied', dot: 'bg-emerald-400', bg: 'bg-emerald-500/10', text: 'text-emerald-400' },
  escalated: { label: 'Escalated', dot: 'bg-red-400', bg: 'bg-red-500/10', text: 'text-red-400' },
  reverted: { label: 'Reverted', dot: 'bg-orange-400', bg: 'bg-orange-500/10', text: 'text-orange-400' },
  resolved: { label: 'Resolved', dot: 'bg-slate-400', bg: 'bg-slate-500/10', text: 'text-slate-400' },
};

export default function StatusPill({ status }: StatusPillProps) {
  const config = statusConfig[status] || statusConfig.diagnosing;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}
