import { AlertTriangle, Bug, Package, Wrench, Server, Shuffle } from 'lucide-react';

interface ErrorTypeBadgeProps {
  type: string;
}

const typeConfig: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  syntax: { label: 'Syntax', icon: AlertTriangle, color: 'text-red-400' },
  dependency: { label: 'Dependency', icon: Package, color: 'text-amber-400' },
  test: { label: 'Test', icon: Bug, color: 'text-purple-400' },
  config_env: { label: 'Config/Env', icon: Wrench, color: 'text-blue-400' },
  infra_runner: { label: 'Infra/Runner', icon: Server, color: 'text-cyan-400' },
  flaky_test: { label: 'Flaky', icon: Shuffle, color: 'text-orange-400' },
};

export default function ErrorTypeBadge({ type }: ErrorTypeBadgeProps) {
  const config = typeConfig[type] || typeConfig.syntax;
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${config.color}`}>
      <Icon className="w-3.5 h-3.5" />
      {config.label}
    </span>
  );
}
