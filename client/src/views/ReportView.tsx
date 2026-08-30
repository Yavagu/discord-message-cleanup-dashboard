import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import { DetailedCleanupReport } from '../types';
import {
  FileText,
  Download,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Hash,
  User,
  Calendar,
  Clock,
  Globe,
  ArrowLeft,
  Search,
  ExternalLink,
  Shield,
  Layers
} from 'lucide-react';

export const ReportView: React.FC = () => {
  const { selectedReportJobId, setActiveTab, addToast } = useApp();
  const [report, setReport] = useState<DetailedCleanupReport | null>(null);
  const [activeTab, setActiveTabLocal] = useState<'summary' | 'deleted' | 'failed' | 'details'>('summary');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Search within failed/deleted tabs
  const [tabSearch, setTabSearch] = useState('');

  useEffect(() => {
    if (selectedReportJobId) {
      loadReport(selectedReportJobId);
    }
  }, [selectedReportJobId]);

  const loadReport = async (jobId: string) => {
    try {
      setIsLoading(true);
      const data = await api.getJobReport(jobId);
      setReport(data);
    } catch (err: any) {
      addToast({ type: 'error', title: 'Failed to load report', message: err.message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportJson = () => {
    if (!selectedReportJobId) return;
    window.open(api.getJsonExportUrl(selectedReportJobId), '_blank');
  };

  const handleExportCsv = () => {
    if (!selectedReportJobId) return;
    window.open(api.getCsvExportUrl(selectedReportJobId), '_blank');
  };

  if (!selectedReportJobId || isLoading) {
    return (
      <div className="py-20 text-center space-y-3">
        <div className="w-8 h-8 border-2 border-discord-blurple border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-xs text-gray-400">Loading comprehensive cleanup report...</p>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="rounded-3xl border border-gray-200 dark:border-discord-dark-accent bg-white dark:bg-discord-dark-card p-12 text-center space-y-4">
        <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto" />
        <h3 className="text-lg font-bold text-gray-900 dark:text-white">Report Not Found</h3>
        <p className="text-xs text-gray-400">No report data found for Job ID: {selectedReportJobId}</p>
        <button
          onClick={() => setActiveTab('history')}
          className="px-4 py-2 rounded-xl bg-discord-blurple text-white font-semibold text-xs"
        >
          Return to History
        </button>
      </div>
    );
  }

  const { job, successRatePercent, channelBreakdown, failures, scannedSample } = report;

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-16">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveTab('history')}
            className="p-2 rounded-xl border border-gray-200 dark:border-discord-dark-accent bg-white dark:bg-discord-dark-card hover:bg-gray-100 dark:hover:bg-discord-dark-hover transition-colors"
            title="Back to History"
          >
            <ArrowLeft className="w-4 h-4 text-gray-600 dark:text-gray-300" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-black text-gray-900 dark:text-white">
                Cleanup Report
              </h2>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                job.status === 'COMPLETED'
                  ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                  : job.status === 'PARTIALLY_COMPLETED'
                  ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                  : 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
              }`}>
                {job.status.replace(/_/g, ' ')}
              </span>
            </div>
            <p className="text-xs text-gray-400 font-mono mt-0.5">
              Job ID: {job.id}
            </p>
          </div>
        </div>

        {/* Export Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-gray-200 dark:border-discord-dark-accent bg-white dark:bg-discord-dark-card hover:bg-gray-50 dark:hover:bg-discord-dark-hover text-xs font-bold text-gray-700 dark:text-gray-300 shadow-sm transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-emerald-500" />
            <span>Export CSV</span>
          </button>
          <button
            onClick={handleExportJson}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-gray-200 dark:border-discord-dark-accent bg-white dark:bg-discord-dark-card hover:bg-gray-50 dark:hover:bg-discord-dark-hover text-xs font-bold text-gray-700 dark:text-gray-300 shadow-sm transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-indigo-400" />
            <span>Export JSON</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* 1. Success Rate */}
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-950/20 p-5 space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            Success Rate
          </span>
          <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
            {successRatePercent}%
          </div>
          <p className="text-[10px] text-gray-400">
            {job.deletedCount} of {job.selectedCount || job.matchedCount} deleted
          </p>
        </div>

        {/* 2. Messages Found */}
        <div className="rounded-2xl border border-gray-200 dark:border-discord-dark-accent bg-white dark:bg-discord-dark-card p-5 space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
            Messages Found
          </span>
          <div className="text-2xl font-black text-gray-900 dark:text-white">
            {job.matchedCount.toLocaleString()}
          </div>
          <p className="text-[10px] text-gray-400">Satisfied all filters</p>
        </div>

        {/* 3. Selected for deletion */}
        <div className="rounded-2xl border border-gray-200 dark:border-discord-dark-accent bg-white dark:bg-discord-dark-card p-5 space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
            Selected
          </span>
          <div className="text-2xl font-black text-indigo-500">
            {(job.selectedCount || job.matchedCount).toLocaleString()}
          </div>
          <p className="text-[10px] text-gray-400">Moderator confirmed</p>
        </div>

        {/* 4. Successfully Deleted */}
        <div className="rounded-2xl border border-gray-200 dark:border-discord-dark-accent bg-white dark:bg-discord-dark-card p-5 space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
            Deleted
          </span>
          <div className="text-2xl font-black text-emerald-500">
            {job.deletedCount.toLocaleString()}
          </div>
          <p className="text-[10px] text-gray-400">Permanently purged</p>
        </div>

        {/* 5. Unable to Delete */}
        <div className="rounded-2xl border border-gray-200 dark:border-discord-dark-accent bg-white dark:bg-discord-dark-card p-5 space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
            Unable to Delete
          </span>
          <div className="text-2xl font-black text-rose-500">
            {job.failedCount.toLocaleString()}
          </div>
          <p className="text-[10px] text-gray-400">Logged with API codes</p>
        </div>
      </div>

      {/* Interactive Tabs */}
      <div className="rounded-3xl border border-gray-200 dark:border-discord-dark-accent bg-white dark:bg-discord-dark-card shadow-sm overflow-hidden">
        {/* Tab Headers */}
        <div className="flex items-center border-b border-gray-100 dark:border-discord-dark-accent px-6 pt-4 gap-6">
          <button
            onClick={() => setActiveTabLocal('summary')}
            className={`pb-4 text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
              activeTab === 'summary'
                ? 'border-discord-blurple text-discord-blurple'
                : 'border-transparent text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            Summary &amp; Channel Stats
          </button>
          <button
            onClick={() => setActiveTabLocal('failed')}
            className={`pb-4 text-xs font-bold uppercase tracking-wider border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'failed'
                ? 'border-rose-500 text-rose-500'
                : 'border-transparent text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <span>Failed Deletions</span>
            {failures.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-rose-500/10 text-rose-500 text-[10px] font-bold">
                {failures.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTabLocal('deleted')}
            className={`pb-4 text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
              activeTab === 'deleted'
                ? 'border-emerald-500 text-emerald-500'
                : 'border-transparent text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            Deleted Messages Sample
          </button>
          <button
            onClick={() => setActiveTabLocal('details')}
            className={`pb-4 text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
              activeTab === 'details'
                ? 'border-indigo-500 text-indigo-500'
                : 'border-transparent text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            Job Audit Details
          </button>
        </div>

        {/* Tab Body */}
        <div className="p-6">
          {/* 1. SUMMARY TAB */}
          {activeTab === 'summary' && (
            <div className="space-y-6">
              {/* Target & Filter info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-gray-50 dark:bg-discord-dark-bg border border-gray-100 dark:border-discord-dark-accent space-y-2 text-xs">
                  <div className="font-bold text-gray-900 dark:text-white uppercase tracking-wider text-[11px]">
                    Target Moderation Profile
                  </div>
                  <div className="flex items-center gap-3 pt-1">
                    <img
                      src={job.targetAvatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png'}
                      alt=""
                      className="w-10 h-10 rounded-full"
                    />
                    <div>
                      <div className="font-bold text-sm text-gray-900 dark:text-white">
                        {job.targetDisplayName || job.targetUsername}
                      </div>
                      <div className="text-gray-400">@{job.targetUsername}</div>
                      <div className="font-mono text-discord-blurple text-[10px] font-bold">
                        ID: {job.targetUserId}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-gray-50 dark:bg-discord-dark-bg border border-gray-100 dark:border-discord-dark-accent space-y-2 text-xs">
                  <div className="font-bold text-gray-900 dark:text-white uppercase tracking-wider text-[11px]">
                    Filter Parameters &amp; Timezone
                  </div>
                  <div className="space-y-1 text-gray-600 dark:text-discord-dark-text pt-1">
                    <div>
                      Server: <strong className="text-gray-900 dark:text-white">{job.guildName}</strong>
                    </div>
                    <div>
                      Evaluation Timezone: <strong className="text-discord-blurple font-mono">{job.timezone}</strong>
                    </div>
                    <div>
                      Date Mode: <strong className="text-gray-900 dark:text-white">{job.filterConfig.dateMode}</strong>
                      {job.filterConfig.startDate && ` (${job.filterConfig.startDate} ${job.filterConfig.endDate ? `to ${job.filterConfig.endDate}` : ''})`}
                    </div>
                    <div>
                      Time Mode: <strong className="text-gray-900 dark:text-white">{job.filterConfig.timeMode}</strong>
                      {job.filterConfig.startTime && ` (${job.filterConfig.startTime} ${job.filterConfig.endTime ? `to ${job.filterConfig.endTime}` : ''})`}
                    </div>
                  </div>
                </div>
              </div>

              {/* Channel Distribution Breakdown */}
              <div className="space-y-3">
                <h4 className="font-bold text-sm text-gray-900 dark:text-white">
                  Channel Deletion Distribution
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-discord-dark-accent text-gray-400 font-bold uppercase">
                        <th className="py-2.5 px-3">Channel Name</th>
                        <th className="py-2.5 px-3">Channel ID</th>
                        <th className="py-2.5 px-3 text-right">Found</th>
                        <th className="py-2.5 px-3 text-right">Deleted</th>
                        <th className="py-2.5 px-3 text-right">Failed</th>
                        <th className="py-2.5 px-3 text-right">Channel Success</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-discord-dark-accent/40">
                      {channelBreakdown.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-6 text-center text-gray-400">
                            No channel breakdown data recorded.
                          </td>
                        </tr>
                      ) : (
                        channelBreakdown.map(ch => {
                          const rate = ch.matched > 0 ? Math.round((ch.deleted / ch.matched) * 100) : 100;
                          return (
                            <tr key={ch.channelId} className="hover:bg-gray-50 dark:hover:bg-discord-dark-hover/30">
                              <td className="py-2.5 px-3 font-semibold text-gray-900 dark:text-white">
                                #{ch.channelName}
                              </td>
                              <td className="py-2.5 px-3 font-mono text-gray-400">{ch.channelId}</td>
                              <td className="py-2.5 px-3 text-right font-bold">{ch.matched}</td>
                              <td className="py-2.5 px-3 text-right font-bold text-emerald-500">{ch.deleted}</td>
                              <td className="py-2.5 px-3 text-right font-bold text-rose-500">{ch.failed}</td>
                              <td className="py-2.5 px-3 text-right">
                                <span className={`font-mono font-bold ${rate === 100 ? 'text-emerald-500' : 'text-amber-500'}`}>
                                  {rate}%
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* 2. FAILED TAB (With detailed Discord Error Codes) */}
          {activeTab === 'failed' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Detailed report for every message that could not be deleted with Discord API error codes.
                </p>
              </div>

              {failures.length === 0 ? (
                <div className="p-12 text-center rounded-2xl bg-emerald-500/5 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 space-y-2">
                  <CheckCircle2 className="w-8 h-8 mx-auto" />
                  <div className="font-bold text-sm">Zero Failures Encountered!</div>
                  <p className="text-xs text-gray-400">All selected messages were successfully deleted.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-discord-dark-accent text-gray-400 font-bold uppercase">
                        <th className="py-2.5 px-3">Message ID</th>
                        <th className="py-2.5 px-3">Channel</th>
                        <th className="py-2.5 px-3">Discord Error Code</th>
                        <th className="py-2.5 px-3 min-w-[200px]">Exact Failure Reason</th>
                        <th className="py-2.5 px-3">Actionable Suggestion</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-discord-dark-accent/40">
                      {failures.map(f => (
                        <tr key={f.id || f.messageId} className="hover:bg-rose-500/[0.03]">
                          <td className="py-3 px-3 font-mono text-gray-400">{f.messageId}</td>
                          <td className="py-3 px-3">
                            <span className="font-semibold text-gray-800 dark:text-gray-200">
                              #{f.channelName}
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            <span className="px-2 py-0.5 rounded font-mono font-bold text-[10px] bg-rose-500/10 text-rose-500 border border-rose-500/20">
                              {f.errorCode}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-rose-600 dark:text-rose-400 font-medium">
                            {f.failureReason}
                          </td>
                          <td className="py-3 px-3 text-gray-500 dark:text-gray-400 italic">
                            {f.suggestions || 'Check channel permissions.'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* 3. DELETED TAB */}
          {activeTab === 'deleted' && (
            <div className="space-y-4">
              <p className="text-xs text-gray-400">
                Sample preview of messages processed during this job.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-discord-dark-accent text-gray-400 font-bold uppercase">
                      <th className="py-2.5 px-3">Message ID</th>
                      <th className="py-2.5 px-3">Channel</th>
                      <th className="py-2.5 px-3">Timestamp ({job.timezone})</th>
                      <th className="py-2.5 px-3 min-w-[280px]">Content Snippet</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-discord-dark-accent/40">
                    {scannedSample.map(s => (
                      <tr key={s.id} className="hover:bg-gray-50 dark:hover:bg-discord-dark-hover/30">
                        <td className="py-2.5 px-3 font-mono text-gray-400">{s.id}</td>
                        <td className="py-2.5 px-3 font-semibold">#{s.channelName}</td>
                        <td className="py-2.5 px-3 font-mono text-gray-500">{s.timestampLocalFormatted}</td>
                        <td className="py-2.5 px-3 text-gray-800 dark:text-discord-dark-text truncate max-w-md">
                          {s.content}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 4. JOB DETAILS TAB */}
          {activeTab === 'details' && (
            <div className="space-y-3 font-mono text-xs text-gray-700 dark:text-discord-dark-text">
              <div className="p-4 rounded-2xl bg-gray-50 dark:bg-discord-dark-bg border border-gray-100 dark:border-discord-dark-accent space-y-2">
                <div>Job ID: <strong className="text-gray-900 dark:text-white">{job.id}</strong></div>
                <div>Status: <strong className="text-emerald-500">{job.status}</strong></div>
                <div>Server ID: {job.guildId} ({job.guildName})</div>
                <div>Target User ID: {job.targetUserId} (@{job.targetUsername})</div>
                <div>Initiated At: {job.startedAt || job.createdAt}</div>
                <div>Completed At: {job.completedAt || 'N/A'}</div>
                <div>Total Execution Time: {job.durationMs}ms</div>
                <div>Rate-Limit Safe Pacing: Active</div>
                <div>Token Persistence: <span className="text-emerald-500 font-bold">REDACTED (0 Tokens in Database)</span></div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
