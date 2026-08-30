import React from 'react';
import { GuildMember, ScannedMessage } from '../../types';
import { AlertTriangle, Trash2, X, ShieldAlert, Zap, Clock } from 'lucide-react';

interface DeleteConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  selectedMember: GuildMember | null;
  targetUserId: string;
  selectedMessageCount: number;
  scannedMessages: ScannedMessage[];
  selectedMessageIds: Set<string>;
  guildName: string;
}

export const DeleteConfirmationModal: React.FC<DeleteConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  selectedMember,
  targetUserId,
  selectedMessageCount,
  scannedMessages,
  selectedMessageIds,
  guildName
}) => {
  if (!isOpen) return null;

  const bulkCount = scannedMessages.filter(m => selectedMessageIds.has(m.id) && m.isBulkDeletable).length;
  const singleCount = selectedMessageCount - bulkCount;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-lg rounded-3xl border border-rose-500/30 bg-white dark:bg-discord-dark-card p-6 shadow-2xl space-y-6">
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-discord-dark-accent pb-4">
          <div className="flex items-center gap-2.5 text-rose-500">
            <ShieldAlert className="w-6 h-6" />
            <h3 className="font-extrabold text-base text-gray-900 dark:text-white">
              Confirm Destructive Message Purge
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4 text-xs">
          <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 space-y-1.5">
            <div className="font-bold flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" />
              <span>Warning: This action is permanent and cannot be undone</span>
            </div>
            <p className="text-[11px] leading-relaxed opacity-90">
              Messages will be permanently deleted from Discord servers via the Discord REST API.
            </p>
          </div>

          {/* Target Summary */}
          <div className="divide-y divide-gray-100 dark:divide-discord-dark-accent/60 rounded-2xl bg-gray-50 dark:bg-discord-dark-bg p-4 space-y-2">
            <div className="flex justify-between items-center pb-2">
              <span className="text-gray-400">Target Server:</span>
              <strong className="text-gray-900 dark:text-white">{guildName}</strong>
            </div>

            <div className="flex justify-between items-center py-2">
              <span className="text-gray-400">Target User:</span>
              <div className="text-right">
                <span className="font-bold text-gray-900 dark:text-white block">
                  {selectedMember?.displayName || targetUserId}
                </span>
                <span className="text-[10px] font-mono text-discord-blurple">
                  ID: {targetUserId}
                </span>
              </div>
            </div>

            <div className="flex justify-between items-center py-2">
              <span className="text-gray-400">Total To Delete:</span>
              <strong className="text-rose-500 text-sm font-mono font-black">
                {selectedMessageCount.toLocaleString()} Messages
              </strong>
            </div>

            <div className="flex justify-between items-center pt-2 text-[11px]">
              <span className="text-gray-400">Execution Strategy:</span>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 text-indigo-400 font-mono font-bold">
                  <Zap className="w-3 h-3" /> {bulkCount} Bulk
                </span>
                <span className="text-gray-400">•</span>
                <span className="inline-flex items-center gap-1 text-amber-400 font-mono font-bold">
                  <Clock className="w-3 h-3" /> {singleCount} Single
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl border border-gray-200 dark:border-discord-dark-accent bg-gray-50 dark:bg-discord-dark-bg text-gray-700 dark:text-gray-300 font-bold text-xs hover:bg-gray-100 dark:hover:bg-discord-dark-hover transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-lg shadow-rose-600/30 transition-all cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
            <span>Confirm &amp; Execute Deletion</span>
          </button>
        </div>
      </div>
    </div>
  );
};
