import React from 'react';
import { useApp } from '../context/AppContext';
import {
  LayoutDashboard,
  Eraser,
  History,
  Bot,
  Settings,
  Shield,
  FileText
} from 'lucide-react';

export const Sidebar: React.FC = () => {
  const { activeTab, setActiveTab, selectedReportJobId } = useApp();

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'cleanup', label: 'Message Cleanup', icon: Eraser, highlight: true },
    { id: 'history', label: 'Cleanup History', icon: History },
    { id: 'bot-config', label: 'Bot Configuration', icon: Bot },
    { id: 'settings', label: 'Safety & Settings', icon: Settings }
  ];

  return (
    <aside className="w-64 flex-shrink-0 flex flex-col justify-between border-r border-gray-200 dark:border-discord-dark-accent bg-white dark:bg-discord-dark-sidebar p-4 transition-colors">
      {/* Brand / Logo */}
      <div className="space-y-6">
        <div className="flex items-center gap-3 px-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-discord-blurple to-indigo-500 shadow-lg text-white font-black text-xl tracking-wider">
            <Eraser className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-extrabold text-sm text-gray-900 dark:text-white tracking-tight flex items-center gap-1.5">
              Discord Sentinel
            </h1>
            <span className="text-[10px] uppercase tracking-wider font-bold text-discord-blurple bg-discord-blurple/10 px-1.5 py-0.5 rounded">
              Cleanup Suite
            </span>
          </div>
        </div>

        {/* Navigation list */}
        <nav className="space-y-1">
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`group flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-all ${
                  isActive
                    ? 'bg-discord-blurple text-white shadow-md shadow-discord-blurple/20'
                    : 'text-gray-600 dark:text-discord-dark-muted hover:bg-gray-100 dark:hover:bg-discord-dark-card hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                <Icon className={`w-4 h-4 transition-transform group-hover:scale-110 ${isActive ? 'text-white' : 'text-gray-400 dark:text-discord-dark-muted'}`} />
                <span>{item.label}</span>
                {item.highlight && !isActive && (
                  <span className="ml-auto w-2 h-2 rounded-full bg-discord-blurple animate-pulse" />
                )}
              </button>
            );
          })}

          {selectedReportJobId && (
            <button
              onClick={() => setActiveTab('report')}
              className={`group flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-all ${
                activeTab === 'report'
                  ? 'bg-discord-blurple text-white shadow-md shadow-discord-blurple/20'
                  : 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/40'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>Current Report</span>
            </button>
          )}
        </nav>
      </div>

      {/* Safety Notice Footer Card */}
      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-3.5 text-xs text-emerald-800 dark:text-emerald-300">
        <div className="flex items-center gap-2 font-bold mb-1">
          <Shield className="w-4 h-4 text-emerald-500" />
          <span>Safety Active</span>
        </div>
        <p className="text-[11px] text-gray-500 dark:text-emerald-400/80 leading-relaxed">
          Two-step validation and Discord rate-limit pacing protected.
        </p>
      </div>
    </aside>
  );
};
