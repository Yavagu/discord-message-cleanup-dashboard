import React from 'react';
import { JobProgressUpdate } from '../../types';
import { Loader2, Trash2, StopCircle, Clock, CheckCircle2 } from 'lucide-react';

interface DeletionProgressModalProps {
  isOpen: boolean;
  progress: JobProgressUpdate | null;
  onCancel: () => void;
}

export const DeletionProgressModal: React.FC<DeletionProgressModalProps> = ({
  isOpen,
  progress,
  onCancel
}) => {
  if (!isOpen) return null;

  const percent = progress?.percent || 0;
  const deleted = progress?.deleted || 0;
  const failed = progress?.failed || 0;
  const total = progress?.totalSelected || 1;
  const processed = progress?.processed || 0;
  const etaSec = progress?.etaSeconds !== undefined ? progress.etaSeconds : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in">
      <div className="w-full max-w-lg rounded-3xl border border-gray-200 dark:border-discord-dark-accent bg-white dark:bg-discord-dark-card p-6 shadow-2xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-discord-dark-accent pb-4">
          <div className="flex items-center gap-2.5">
            <Loader2 className="w-5 h-5 text-discord-blurple animate-spin" />
            <h3 className="font-extrabold text-base text-gray-900 dark:text-white">
              Executing Cleanup Operation...
            </h3>
          </div>
          <span className="text-xs font-mono font-bold text-discord-blurple px-2 py-0.5 rounded-full bg-discord-blurple/10 border border-discord-blurple/20">
            {percent}% Complete
          </span>
        </div>

        {/* Live Progress Bar */}
        <div className="space-y-2">
          <div className="w-full bg-gray-100 dark:bg-discord-dark-bg h-4 rounded-full overflow-hidden border border-gray-200 dark:border-discord-dark-accent p-0.5">
            <div
              className="bg-gradient-to-r from-discord-blurple via-indigo-500 to-emerald-500 h-full rounded-full transition-all duration-300 relative overflow-hidden"
              style={{ width: `${percent}%` }}
            >
              <div className="absolute inset-0 bg-white/20 animate-pulse" />
            </div>
          </div>

          <div className="flex justify-between text-xs text-gray-400 font-mono">
            <span>{processed.toLocaleString()} of {total.toLocaleString()} processed</span>
            {etaSec !== null && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3 text-indigo-400" />
                ETA: ~{etaSec}s remaining
              </span>
            )}
          </div>
        </div>

        {/* Deletion Metrics Grid */}
        <div className="grid grid-cols-3 gap-3 text-center text-xs">
          <div className="p-3.5 rounded-2xl bg-gray-50 dark:bg-discord-dark-bg border border-gray-100 dark:border-discord-dark-accent space-y-1">
            <span className="text-gray-400 block text-[10px] uppercase font-bold">Deleted</span>
            <span className="text-lg font-mono font-black text-emerald-500">{deleted.toLocaleString()}</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-gray-50 dark:bg-discord-dark-bg border border-gray-100 dark:border-discord-dark-accent space-y-1">
            <span className="text-gray-400 block text-[10px] uppercase font-bold">Failed</span>
            <span className="text-lg font-mono font-black text-rose-500">{failed.toLocaleString()}</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-gray-50 dark:bg-discord-dark-bg border border-gray-100 dark:border-discord-dark-accent space-y-1">
            <span className="text-gray-400 block text-[10px] uppercase font-bold">Pacing</span>
            <span className="text-lg font-mono font-black text-discord-blurple">
              {progress?.rateLimitPacingMs || 100}ms
            </span>
          </div>
        </div>

        {/* Current Channel & Message */}
        {progress?.currentChannelName && (
          <div className="p-3 rounded-xl bg-gray-50 dark:bg-discord-dark-bg text-xs flex items-center justify-between text-gray-400">
            <span>Current Channel: <strong className="text-gray-800 dark:text-gray-200">#{progress.currentChannelName}</strong></span>
            {progress.currentMessageId && (
              <span className="font-mono text-[10px] text-gray-400">Msg: {progress.currentMessageId}</span>
            )}
          </div>
        )}

        {/* Action Button */}
        <div className="pt-2 flex justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 font-bold text-xs transition-colors cursor-pointer"
          >
            <StopCircle className="w-4 h-4" />
            <span>Cancel Cleanup Operation</span>
          </button>
        </div>
      </div>
    </div>
  );
};
