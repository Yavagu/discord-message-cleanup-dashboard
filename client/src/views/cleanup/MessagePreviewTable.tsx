import React, { useState } from 'react';
import { ScannedMessage } from '../../types';
import {
  Search,
  CheckSquare,
  Square,
  Eye,
  Trash2,
  Paperclip,
  Clock,
  Zap,
  ArrowRight
} from 'lucide-react';

interface MessagePreviewTableProps {
  scannedMessages: ScannedMessage[];
  selectedMessageIds: Set<string>;
  scanSummary: {
    scannedCount: number;
    matchedCount: number;
    channelsCount: number;
    durationMs: number;
  } | null;
  onToggleMessage: (msgId: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onInspectMessage: (message: ScannedMessage) => void;
  onOpenConfirmModal: () => void;
}

export const MessagePreviewTable: React.FC<MessagePreviewTableProps> = ({
  scannedMessages,
  selectedMessageIds,
  scanSummary,
  onToggleMessage,
  onSelectAll,
  onDeselectAll,
  onInspectMessage,
  onOpenConfirmModal
}) => {
  const [tableSearch, setTableSearch] = useState('');
  const [tableChannelFilter, setTableChannelFilter] = useState('all');
  const [tableSort, setTableSort] = useState<'newest' | 'oldest'>('newest');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  // Extract unique channel list from scanned messages
  const scannedChannels = Array.from(
    new Map(scannedMessages.map(m => [m.channelId, m.channelName])).entries()
  ).map(([id, name]) => ({ id, name }));

  const filteredMessages = scannedMessages.filter(msg => {
    if (tableChannelFilter !== 'all' && msg.channelId !== tableChannelFilter) return false;
    if (tableSearch.trim()) {
      const s = tableSearch.toLowerCase();
      return (
        msg.content.toLowerCase().includes(s) ||
        msg.id.includes(s) ||
        msg.channelName.toLowerCase().includes(s)
      );
    }
    return true;
  }).sort((a, b) => {
    if (tableSort === 'newest') {
      return new Date(b.timestampUtc).getTime() - new Date(a.timestampUtc).getTime();
    }
    return new Date(a.timestampUtc).getTime() - new Date(b.timestampUtc).getTime();
  });

  const totalPages = Math.ceil(filteredMessages.length / pageSize) || 1;
  const paginatedMessages = filteredMessages.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const bulkEligibleCount = scannedMessages.filter(m => selectedMessageIds.has(m.id) && m.isBulkDeletable).length;
  const individualCount = selectedMessageIds.size - bulkEligibleCount;

  return (
    <div className="space-y-4">
      {/* Scan Summary Banner */}
      {scanSummary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-3xl bg-discord-blurple/5 border border-discord-blurple/20 dark:bg-discord-blurple/10 text-xs">
          <div>
            <span className="text-gray-400 block text-[10px] uppercase font-bold">Channels Scanned</span>
            <span className="text-sm font-bold text-gray-900 dark:text-white">{scanSummary.channelsCount}</span>
          </div>
          <div>
            <span className="text-gray-400 block text-[10px] uppercase font-bold">Total Messages Read</span>
            <span className="text-sm font-bold text-gray-900 dark:text-white">{scanSummary.scannedCount.toLocaleString()}</span>
          </div>
          <div>
            <span className="text-gray-400 block text-[10px] uppercase font-bold">Matches Filter</span>
            <span className="text-sm font-bold text-discord-blurple">{scanSummary.matchedCount.toLocaleString()}</span>
          </div>
          <div>
            <span className="text-gray-400 block text-[10px] uppercase font-bold">Scan Duration</span>
            <span className="text-sm font-mono font-bold text-gray-700 dark:text-gray-300">{scanSummary.durationMs}ms</span>
          </div>
        </div>
      )}

      {/* Main Table Card */}
      <div className="rounded-3xl border border-gray-200 dark:border-discord-dark-accent bg-white dark:bg-discord-dark-card shadow-sm p-6 space-y-4">
        {/* Table Header & Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 dark:border-discord-dark-accent pb-4">
          <div>
            <h3 className="font-extrabold text-base text-gray-900 dark:text-white">
              Review Scanned Messages ({filteredMessages.length.toLocaleString()})
            </h3>
            <p className="text-xs text-gray-400">
              Verify message payloads and select items to include in the deletion batch.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onSelectAll}
              className="text-xs font-semibold text-discord-blurple hover:underline cursor-pointer"
            >
              Select All
            </button>
            <span className="text-gray-300 dark:text-gray-600">•</span>
            <button
              type="button"
              onClick={onDeselectAll}
              className="text-xs font-semibold text-gray-500 hover:underline cursor-pointer"
            >
              Deselect All
            </button>
          </div>
        </div>

        {/* Filters Toolbar */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="relative w-full md:w-72">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-3" />
            <input
              type="text"
              value={tableSearch}
              onChange={e => {
                setTableSearch(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search content or ID..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-gray-200 dark:border-discord-dark-accent bg-gray-50 dark:bg-discord-dark-bg text-gray-900 dark:text-white focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
            {scannedChannels.length > 1 && (
              <select
                value={tableChannelFilter}
                onChange={e => {
                  setTableChannelFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="px-3 py-2 text-xs rounded-xl border border-gray-200 dark:border-discord-dark-accent bg-gray-50 dark:bg-discord-dark-bg text-gray-900 dark:text-white focus:outline-none"
              >
                <option value="all">All Channels</option>
                {scannedChannels.map(c => (
                  <option key={c.id} value={c.id}>#{c.name}</option>
                ))}
              </select>
            )}

            <select
              value={tableSort}
              onChange={e => setTableSort(e.target.value as 'newest' | 'oldest')}
              className="px-3 py-2 text-xs rounded-xl border border-gray-200 dark:border-discord-dark-accent bg-gray-50 dark:bg-discord-dark-bg text-gray-900 dark:text-white focus:outline-none"
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
            </select>
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-gray-200 dark:border-discord-dark-accent text-gray-400 font-bold uppercase">
                <th className="py-3 px-3 w-10">Select</th>
                <th className="py-3 px-3">Channel</th>
                <th className="py-3 px-3">Message Snippet</th>
                <th className="py-3 px-3">Timestamp (Local)</th>
                <th className="py-3 px-3">Method</th>
                <th className="py-3 px-3 text-right">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-discord-dark-accent/40">
              {paginatedMessages.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-gray-400">
                    No scanned messages match the active search.
                  </td>
                </tr>
              ) : (
                paginatedMessages.map(msg => {
                  const isSelected = selectedMessageIds.has(msg.id);
                  return (
                    <tr
                      key={msg.id}
                      onClick={() => onToggleMessage(msg.id)}
                      className={`hover:bg-gray-50 dark:hover:bg-discord-dark-hover/30 transition-colors cursor-pointer ${
                        isSelected ? 'bg-discord-blurple/[0.03]' : 'opacity-60'
                      }`}
                    >
                      <td className="py-3 px-3" onClick={e => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => onToggleMessage(msg.id)}
                          className="text-discord-blurple hover:scale-110 transition-transform"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4" />
                          ) : (
                            <Square className="w-4 h-4 text-gray-400" />
                          )}
                        </button>
                      </td>

                      <td className="py-3 px-3 font-semibold text-gray-800 dark:text-gray-200 whitespace-nowrap">
                        #{msg.channelName}
                      </td>

                      <td className="py-3 px-3 max-w-xs md:max-w-md truncate">
                        <span className="text-gray-900 dark:text-discord-dark-text">
                          {msg.content || <em className="text-gray-400">No text content</em>}
                        </span>
                        {(msg.hasAttachments || msg.hasEmbeds) && (
                          <span className="inline-flex items-center gap-1 ml-2 px-1.5 py-0.5 rounded text-[10px] bg-gray-100 dark:bg-discord-dark-bg text-gray-500">
                            <Paperclip className="w-2.5 h-2.5" />
                            {msg.attachmentCount + msg.embedCount} media
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-3 font-mono text-gray-500 whitespace-nowrap">
                        {msg.timestampLocalFormatted}
                      </td>

                      <td className="py-3 px-3 whitespace-nowrap">
                        {msg.isBulkDeletable ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
                            <Zap className="w-2.5 h-2.5" /> Bulk Fast ({msg.ageDays.toFixed(1)}d)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20">
                            <Clock className="w-2.5 h-2.5" /> Single Paced ({msg.ageDays.toFixed(1)}d)
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-3 text-right" onClick={e => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => onInspectMessage(msg)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-discord-blurple hover:bg-discord-blurple/10 transition-colors"
                          title="Inspect Message Details"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination & Deletion Commit CTA */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-gray-100 dark:border-discord-dark-accent text-xs">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 rounded-xl border border-gray-200 dark:border-discord-dark-accent disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-discord-dark-hover cursor-pointer"
            >
              Previous
            </button>
            <span className="px-2 font-mono font-bold text-gray-900 dark:text-white">
              Page {currentPage} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 rounded-xl border border-gray-200 dark:border-discord-dark-accent disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-discord-dark-hover cursor-pointer"
            >
              Next
            </button>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-gray-400">
              Selected: <strong className="text-discord-blurple">{selectedMessageIds.size}</strong> messages
              <span className="text-[11px] text-gray-400 ml-1">
                ({bulkEligibleCount} bulk, {individualCount} single)
              </span>
            </span>

            <button
              type="button"
              onClick={onOpenConfirmModal}
              disabled={selectedMessageIds.size === 0}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold text-xs shadow-md shadow-rose-600/25 transition-all cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              <span>Proceed to Purge ({selectedMessageIds.size})</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
