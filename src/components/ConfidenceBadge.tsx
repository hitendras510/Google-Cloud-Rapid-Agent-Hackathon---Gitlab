interface ConfidenceBadgeProps {
  score: number;
  size?: 'sm' | 'md';
}

export default function ConfidenceBadge({ score, size = 'md' }: ConfidenceBadgeProps) {
  const tier = score >= 0.85 ? 'high' : score >= 0.6 ? 'medium' : 'low';
  const config = {
    high: { label: 'AUTO-APPLY', bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30' },
    medium: { label: 'ELICIT', bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/30' },
    low: { label: 'COMMENT', bg: 'bg-red-500/15', text: 'text-red-400', border: 'border-red-500/30' },
  };
  const { label, bg, text, border } = config[tier];
  const sizeClasses = size === 'sm' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-1';

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border font-mono font-medium ${bg} ${text} ${border} ${sizeClasses}`}>
      <span className="font-semibold">{(score * 100).toFixed(0)}%</span>
      <span className="opacity-70">{label}</span>
    </span>
  );
}
