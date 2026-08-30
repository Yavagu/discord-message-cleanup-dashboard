import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import { CleanupJob } from '../types';
import {
  History,
  Search,
  Filter,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Download,
  Server,
  User,
  Trash2,
  FileText
} from 'lucide-react';

export const HistoryView: React.FC = () => {
  const { viewJobReport, addToast } = useApp();
  const [jobs, setJobs] = useState<CleanupJob[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const limit = 20;

  useEffect(() => {
    fetchHistory();
  }, [statusFilter, currentPage]);

  const fetchHistory = async () => {
    try {
      setIsLoading(true);
      const offset = (currentPage - 1) * limit;
      const res = await api.getHistory({
        status: statusFilter,
        search: searchQuery,
        limit,
        offset
      });
      setJobs(res.jobs);
      setTotalCount(res.total);
    } catch (err: any) {
      addToast({ type: 'error', title: 'Failed to load history', message: err.message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(1);
    fetchHistory();
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

  const totalPages = Math.ceil(totalCount / limit) || 1;

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-gray-900 dark:text-white flex items-center gap-2.5">
            <History className="w-7 h-7 text-discord-blurple" />
            Cleanup Audit History
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Persistent log of all message cleanup and purge operations across server restarts.
          </p>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="rounded-3xl border border-gray-200 dark:border-discord-dark-accent bg-white dark:bg-discord-dark-card p-4 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <form onSubmit={handleSearchSubmit} className="relative w-full md:w-80">
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search user, server, or user ID..."
            className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-gray-200 dark:border-discord-dark-accent bg-gray-50 dark:bg-discord-dark-bg text-gray-900 dark:text-white focus:outline-none focus:border-discord-blurple"
          />
        </form>

        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto">
          {['ALL', 'COMPLETED', 'PARTIALLY_COMPLETED', 'FAILED', 'CANCELLED'].map(st => (
            <button
              key={st}
              onClick={() => {
                setStatusFilter(st);
                setCurrentPage(1);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors whitespace-nowrap cursor-pointer ${
                statusFilter === st
                  ? 'bg-discord-blurple text-white'
                  : 'bg-gray-50 dark:bg-discord-dark-bg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-discord-dark-hover'
              }`}
            >
              {st === 'ALL' ? 'All Operations' : st.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* History Table Card */}
      <div className="rounded-3xl border border-gray-200 dark:border-discord-dark-accent bg-white dark:bg-discord-dark-card shadow-sm overflow-hidden p-6 space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-gray-200 dark:border-discord-dark-accent text-gray-400 font-bold uppercase tracking-wider">
                <th className="py-3 px-3">Date / Time</th>
                <th className="py-3 px-3">Server</th>
                <th className="py-3 px-3">Target Moderation User</th>
                <th className="py-3 px-3">Filters Applied</th>
                <th className="py-3 px-3 text-right">Found</th>
                <th className="py-3 px-3 text-right">Deleted</th>
                <th className="py-3 px-3 text-right">Failed</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-discord-dark-accent/40">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-gray-400">
                    Loading history logs...
                  </td>
                </tr>
              ) : jobs.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-gray-400">
                    No cleanup operations match the selected filters.
                  </td>
                </tr>
              ) : (
                jobs.map(job => (
                  <tr
                    key={job.id}
                    onClick={() => viewJobReport(job.id)}
                    className="hover:bg-gray-50 dark:hover:bg-discord-dark-hover/40 transition-colors cursor-pointer group"
                  >
                    <td className="py-3 px-3 font-mono text-gray-500 whitespace-nowrap">
                      {new Date(job.createdAt).toLocaleString()}
                    </td>

                    <td className="py-3 px-3 font-semibold text-gray-900 dark:text-white">
                      {job.guildName}
                    </td>

                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <img
                          src={job.targetAvatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png'}
                          alt=""
                          className="w-6 h-6 rounded-full object-cover"
                        />
                        <div className="truncate max-w-[140px]">
                          <span className="font-bold text-gray-900 dark:text-white block truncate">
                            {job.targetDisplayName || job.targetUsername}
                          </span>
                          <span className="text-[10px] text-gray-400 font-mono block">
                            @{job.targetUsername}
                          </span>
                        </div>
                      </div>
                    </td>

                    <td className="py-3 px-3 text-gray-600 dark:text-gray-300">
                      <div className="space-y-0.5 max-w-[200px] truncate">
                        <div className="truncate text-[11px]">
                          Date: <span className="font-semibold">{job.filterConfig.dateMode}</span>
                        </div>
                        <div className="truncate text-[10px] text-gray-400 font-mono">
                          Time: {job.filterConfig.timeMode} ({job.timezone})
                        </div>
                      </div>
                    </td>

                    <td className="py-3 px-3 text-right font-mono font-bold text-gray-700 dark:text-gray-300">
                      {job.matchedCount.toLocaleString()}
                    </td>

                    <td className="py-3 px-3 text-right font-mono font-bold text-emerald-500">
                      {job.deletedCount.toLocaleString()}
                    </td>

                    <td className="py-3 px-3 text-right font-mono font-bold text-rose-500">
                      {job.failedCount.toLocaleString()}
                    </td>

                    <td className="py-3 px-3 whitespace-nowrap">
                      {getStatusBadge(job.status)}
                    </td>

                    <td className="py-3 px-3 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          viewJobReport(job.id);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-discord-blurple/10 text-discord-blurple font-bold text-xs group-hover:bg-discord-blurple group-hover:text-white transition-all"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>Report</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between pt-4 border-t border-gray-100 dark:border-discord-dark-accent text-xs">
          <span className="text-gray-400">
            Total operations: {totalCount}
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 rounded-xl border border-gray-200 dark:border-discord-dark-accent disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-discord-dark-hover"
            >
              Previous
            </button>
            <span className="px-2 font-mono font-bold text-gray-900 dark:text-white">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 rounded-xl border border-gray-200 dark:border-discord-dark-accent disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-discord-dark-hover"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
