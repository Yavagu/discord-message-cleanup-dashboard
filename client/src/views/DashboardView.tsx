import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import { DashboardMetrics } from '../types';
import {
  Bot,
  Search,
  Trash2,
  AlertTriangle,
  Briefcase,
  TrendingUp,
  ArrowRight,
  Eraser,
  Clock,
  CheckCircle2,
  XCircle,
  Server,
  Shield,
  Zap
} from 'lucide-react';

export const DashboardView: React.FC = () => {
  const { botStatus, selectedGuild, setActiveTab, viewJobReport, isDemo } = useApp();
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    fetchMetrics();
  }, []);

  const fetchMetrics = async () => {
    try {
      setIsLoading(true);
      const data = await api.getDashboardMetrics();
      setMetrics(data);
    } catch (err) {
      console.error('Failed to fetch dashboard metrics', err);
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3 h-3" /> Completed
          </span>
        );
      case 'PARTIALLY_COMPLETED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            <AlertTriangle className="w-3 h-3" /> Partial
          </span>
        );
      case 'DELETING':
      case 'SCANNING':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-discord-blurple/10 text-discord-blurple border border-discord-blurple/20 animate-pulse">
            <Clock className="w-3 h-3" /> In Progress
          </span>
        );
      case 'FAILED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
            <XCircle className="w-3 h-3" /> Failed
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-500/10 text-gray-500 border border-gray-500/20">
            Cancelled
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono bg-gray-100 dark:bg-discord-dark-card text-gray-400">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Welcome Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-discord-blurple/90 via-indigo-600 to-indigo-900 p-8 text-white shadow-2xl">
        <div className="relative z-10 max-w-2xl space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md text-xs font-semibold tracking-wide">
            <Shield className="w-3.5 h-3.5 text-emerald-300" />
            <span>Moderator Operations Center</span>
          </div>
          <h2 className="text-3xl font-black tracking-tight">
            Discord Message Cleanup Dashboard
          </h2>
          <p className="text-white/80 text-sm leading-relaxed">
            Secure, rate-limited, and timezone-accurate bulk moderation. Filter by target user, date ranges, and time cutoffs with safety previews.
          </p>

          <div className="pt-2 flex flex-wrap items-center gap-3">
            <button
              onClick={() => setActiveTab('cleanup')}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white text-discord-blurple font-bold text-sm shadow-lg hover:bg-gray-100 transition-all cursor-pointer"
            >
              <Eraser className="w-4 h-4" />
              <span>Start Message Cleanup</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              onClick={() => setActiveTab('bot-config')}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-md text-white font-semibold text-sm transition-all"
            >
              <Bot className="w-4 h-4" />
              <span>Bot Status & Permissions</span>
            </button>
          </div>
        </div>

        {/* Subtle decorative background icons */}
        <div className="absolute -right-6 -bottom-10 opacity-10 pointer-events-none">
          <Eraser className="w-64 h-64" />
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {/* 1. Bot Status */}
        <div className="rounded-2xl border border-gray-200 dark:border-discord-dark-accent bg-white dark:bg-discord-dark-card p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-gray-400">
            <span className="text-xs font-bold uppercase tracking-wider">Bot Status</span>
            <Bot className="w-4 h-4 text-discord-blurple" />
          </div>
          <div className="text-lg font-black truncate">
            {botStatus?.connected ? (
              <span className="text-emerald-500 flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                Connected
              </span>
            ) : (
              <span className="text-rose-500 flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                Offline
              </span>
            )}
          </div>
          <div className="text-[11px] text-gray-400 truncate">
            {botStatus?.isDemo ? 'Demo simulation mode' : botStatus?.botUser?.username || 'No token configured'}
          </div>
        </div>

        {/* 2. Messages Scanned */}
        <div className="rounded-2xl border border-gray-200 dark:border-discord-dark-accent bg-white dark:bg-discord-dark-card p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-gray-400">
            <span className="text-xs font-bold uppercase tracking-wider">Scanned</span>
            <Search className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-black text-gray-900 dark:text-white">
            {isLoading ? '...' : (metrics?.totalScanned || 0).toLocaleString()}
          </div>
          <div className="text-[11px] text-gray-400">Across searched channels</div>
        </div>

        {/* 3. Messages Deleted */}
        <div className="rounded-2xl border border-gray-200 dark:border-discord-dark-accent bg-white dark:bg-discord-dark-card p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-gray-400">
            <span className="text-xs font-bold uppercase tracking-wider">Deleted</span>
            <Trash2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
            {isLoading ? '...' : (metrics?.totalDeleted || 0).toLocaleString()}
          </div>
          <div className="text-[11px] text-gray-400">Successfully removed</div>
        </div>

        {/* 4. Failed Deletions */}
        <div className="rounded-2xl border border-gray-200 dark:border-discord-dark-accent bg-white dark:bg-discord-dark-card p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-gray-400">
            <span className="text-xs font-bold uppercase tracking-wider">Failed</span>
            <AlertTriangle className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-black text-rose-600 dark:text-rose-400">
            {isLoading ? '...' : (metrics?.totalFailed || 0).toLocaleString()}
          </div>
          <div className="text-[11px] text-gray-400">Permission / API errors</div>
        </div>

        {/* 5. Cleanup Jobs */}
        <div className="rounded-2xl border border-gray-200 dark:border-discord-dark-accent bg-white dark:bg-discord-dark-card p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-gray-400">
            <span className="text-xs font-bold uppercase tracking-wider">Cleanup Jobs</span>
            <Briefcase className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-black text-gray-900 dark:text-white">
            {isLoading ? '...' : (metrics?.totalJobs || 0).toLocaleString()}
          </div>
          <div className="text-[11px] text-gray-400">Total operations executed</div>
        </div>

        {/* 6. Success Rate */}
        <div className="rounded-2xl border border-gray-200 dark:border-discord-dark-accent bg-white dark:bg-discord-dark-card p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-gray-400">
            <span className="text-xs font-bold uppercase tracking-wider">Success Rate</span>
            <TrendingUp className="w-4 h-4 text-discord-green" />
          </div>
          <div className="text-2xl font-black text-gray-900 dark:text-white">
            {isLoading ? '...' : `${metrics?.successRate || 100}%`}
          </div>
          <div className="text-[11px] text-gray-400">Moderation reliability</div>
        </div>
      </div>

      {/* Main Content split: Recent Activity & Active Server status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Recent Cleanup Activity */}
        <div className="lg:col-span-2 rounded-3xl border border-gray-200 dark:border-discord-dark-accent bg-white dark:bg-discord-dark-card p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <h3 className="font-extrabold text-base text-gray-900 dark:text-white">
                Recent Cleanup Activity
              </h3>
              <p className="text-xs text-gray-400">
                Latest batch moderation and message purge runs
              </p>
            </div>
            <button
              onClick={() => setActiveTab('history')}
              className="text-xs font-semibold text-discord-blurple hover:underline flex items-center gap-1"
            >
              <span>View Full History</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="divide-y divide-gray-100 dark:divide-discord-dark-accent/50">
            {(!metrics?.recentJobs || metrics.recentJobs.length === 0) ? (
              <div className="py-12 text-center text-gray-400 text-sm">
                No recent cleanup jobs found. Configure a filter to begin.
              </div>
            ) : (
              metrics.recentJobs.map(job => (
                <div
                  key={job.id}
                  onClick={() => viewJobReport(job.id)}
                  className="py-3.5 flex items-center justify-between gap-4 hover:bg-gray-50 dark:hover:bg-discord-dark-hover/50 px-3 rounded-2xl transition-colors cursor-pointer group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <img
                      src={job.targetAvatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png'}
                      alt=""
                      className="w-10 h-10 rounded-full object-cover border border-gray-200 dark:border-discord-dark-accent flex-shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm truncate text-gray-900 dark:text-white group-hover:text-discord-blurple transition-colors">
                          {job.targetDisplayName || job.targetUsername}
                        </span>
                        <span className="text-xs text-gray-400 font-mono hidden sm:inline">
                          @{job.targetUsername}
                        </span>
                      </div>
                      <div className="text-xs text-gray-400 flex items-center gap-2 mt-0.5">
                        <span className="truncate">{job.guildName}</span>
                        <span>•</span>
                        <span>{new Date(job.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 flex-shrink-0">
                    <div className="text-right hidden sm:block">
                      <div className="text-xs font-bold text-gray-900 dark:text-white">
                        {job.deletedCount.toLocaleString()} deleted
                      </div>
                      {job.failedCount > 0 && (
                        <div className="text-[11px] text-rose-500 font-medium">
                          {job.failedCount} failed
                        </div>
                      )}
                    </div>
                    <div>{getStatusBadge(job.status)}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Col: Active Server & Permissions Card */}
        <div className="space-y-6">
          <div className="rounded-3xl border border-gray-200 dark:border-discord-dark-accent bg-white dark:bg-discord-dark-card p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-base text-gray-900 dark:text-white">
                Active Server
              </h3>
              <Server className="w-4 h-4 text-discord-blurple" />
            </div>

            {selectedGuild ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-3 rounded-2xl bg-gray-50 dark:bg-discord-dark-bg">
                  {selectedGuild.icon ? (
                    <img src={selectedGuild.icon} alt="" className="w-12 h-12 rounded-2xl object-cover" />
                  ) : (
                    <div className="w-12 h-12 rounded-2xl bg-discord-blurple flex items-center justify-center text-white font-bold text-lg">
                      {selectedGuild.name.substring(0, 1)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <h4 className="font-bold text-sm truncate text-gray-900 dark:text-white">{selectedGuild.name}</h4>
                    <p className="text-xs text-gray-400 font-mono">ID: {selectedGuild.id}</p>
                    {selectedGuild.memberCount && (
                      <p className="text-xs text-emerald-500 font-medium mt-0.5">
                        {selectedGuild.memberCount.toLocaleString()} members
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-bold uppercase tracking-wider text-gray-400">
                    Channel Permissions
                  </div>
                  <div className="space-y-1 text-xs">
                    <div className="flex items-center justify-between p-2 rounded-xl bg-gray-50 dark:bg-discord-dark-bg">
                      <span className="text-gray-600 dark:text-gray-300">View Channels</span>
                      <span className="text-emerald-500 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Granted
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-xl bg-gray-50 dark:bg-discord-dark-bg">
                      <span className="text-gray-600 dark:text-gray-300">Read Message History</span>
                      <span className="text-emerald-500 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Granted
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-xl bg-gray-50 dark:bg-discord-dark-bg">
                      <span className="text-gray-600 dark:text-gray-300">Manage Messages</span>
                      <span className="text-emerald-500 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Granted
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setActiveTab('cleanup')}
                  className="w-full py-2.5 rounded-xl bg-discord-blurple hover:bg-discord-blurple-hover text-white text-xs font-bold shadow-md transition-colors"
                >
                  Configure Server Cleanup
                </button>
              </div>
            ) : (
              <div className="py-6 text-center text-xs text-gray-400 space-y-3">
                <p>No server selected.</p>
                <button
                  onClick={() => setActiveTab('bot-config')}
                  className="px-3 py-2 rounded-xl bg-discord-blurple text-white font-semibold text-xs"
                >
                  Connect Discord Bot
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
