import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  AlertTriangle,
  Search,
  DollarSign,
  Settings,
  Shield,
  Activity,
  GitMerge,
  Cpu,
  BookOpen,
} from 'lucide-react';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/failures', icon: AlertTriangle, label: 'Failures' },
  { to: '/trace', icon: Search, label: 'Trace Viewer' },
  { to: '/architecture', icon: Cpu, label: 'Architecture' },
  { to: '/cost', icon: DollarSign, label: 'Cost & ROI' },
  { to: '/gitlab', icon: GitMerge, label: 'GitLab Integration' },
  { to: '/testing-guide', icon: BookOpen, label: 'Testing Guide' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export default function Sidebar() {
  return (
    <aside className="w-64 bg-navy-900 border-r border-slate-700/30 flex flex-col h-screen fixed left-0 top-0">
      <div className="p-5 border-b border-slate-700/30">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-accent-orange to-orange-600 flex items-center justify-center shadow-lg shadow-accent-orange/20">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-white font-semibold text-sm tracking-tight">PipelineGuardian</h1>
            <p className="text-slate-500 text-[10px]">Autonomous CI/CD Repair Agent</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                isActive
                  ? 'bg-accent-orange/10 text-accent-orange border border-accent-orange/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50 border border-transparent'
              }`
            }
          >
            <item.icon className="w-4 h-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-slate-700/30 space-y-2">
        <div className="flex items-center gap-2 px-3 py-1.5">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs text-slate-400">6 Agents Online</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5">
          <GitMerge className="w-3.5 h-3.5 text-slate-500" />
          <span className="text-xs text-slate-500">GitLab MCP Active</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5">
          <Activity className="w-3.5 h-3.5 text-slate-500" />
          <span className="text-xs text-slate-500">Gemini 2.5 Flash</span>
        </div>
      </div>
    </aside>
  );
}
