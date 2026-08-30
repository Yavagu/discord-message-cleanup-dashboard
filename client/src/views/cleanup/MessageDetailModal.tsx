import React from 'react';
import { ScannedMessage } from '../../types';
import { X, User, Clock, Hash, FileCode, Zap } from 'lucide-react';

interface MessageDetailModalProps {
  message: ScannedMessage | null;
  onClose: () => void;
}

export const MessageDetailModal: React.FC<MessageDetailModalProps> = ({ message, onClose }) => {
  if (!message) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-xl rounded-3xl border border-gray-200 dark:border-discord-dark-accent bg-white dark:bg-discord-dark-card p-6 shadow-2xl space-y-6">
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-discord-dark-accent pb-4">
          <div className="flex items-center gap-2">
            <FileCode className="w-5 h-5 text-discord-blurple" />
            <h3 className="font-bold text-base text-gray-900 dark:text-white">
              Message Payload Details
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
          <div className="flex items-center gap-3 p-3 rounded-2xl bg-gray-50 dark:bg-discord-dark-bg">
            <img src={message.authorAvatarUrl} alt="" className="w-9 h-9 rounded-full" />
            <div>
              <div className="font-bold text-sm text-gray-900 dark:text-white">
                {message.authorDisplayName}
              </div>
              <div className="text-gray-400 font-mono text-[11px]">
                @{message.authorUsername} (ID: {message.authorId})
              </div>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-gray-50 dark:bg-discord-dark-bg space-y-1">
            <span className="text-[10px] uppercase font-bold text-gray-400">Content</span>
            <p className="text-gray-900 dark:text-discord-dark-text whitespace-pre-wrap font-sans text-sm">
              {message.content || <em>No text content</em>}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 text-[11px] font-mono">
            <div className="p-3 rounded-xl bg-gray-50 dark:bg-discord-dark-bg space-y-1">
              <span className="text-gray-400 block text-[9px] uppercase font-bold">Message ID</span>
              <span className="text-gray-800 dark:text-gray-200">{message.id}</span>
            </div>
            <div className="p-3 rounded-xl bg-gray-50 dark:bg-discord-dark-bg space-y-1">
              <span className="text-gray-400 block text-[9px] uppercase font-bold">Channel</span>
              <span className="text-gray-800 dark:text-gray-200">#{message.channelName}</span>
            </div>
            <div className="p-3 rounded-xl bg-gray-50 dark:bg-discord-dark-bg space-y-1">
              <span className="text-gray-400 block text-[9px] uppercase font-bold">UTC Timestamp</span>
              <span className="text-gray-800 dark:text-gray-200">{message.timestampUtc}</span>
            </div>
            <div className="p-3 rounded-xl bg-gray-50 dark:bg-discord-dark-bg space-y-1">
              <span className="text-gray-400 block text-[9px] uppercase font-bold">Deletion Method</span>
              <span className={message.isBulkDeletable ? 'text-indigo-400' : 'text-amber-400'}>
                {message.isBulkDeletable ? 'Bulk Fast API' : 'Single Paced API'} ({message.ageDays.toFixed(2)}d)
              </span>
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-gray-100 dark:bg-discord-dark-bg hover:bg-gray-200 dark:hover:bg-discord-dark-hover text-gray-700 dark:text-gray-300 font-bold text-xs"
          >
            Close Viewer
          </button>
        </div>
      </div>
    </div>
  );
};
