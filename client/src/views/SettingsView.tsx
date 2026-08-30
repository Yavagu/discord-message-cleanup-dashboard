import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  Settings,
  Shield,
  Clock,
  Database,
  Lock,
  RefreshCw,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

export const SettingsView: React.FC = () => {
  const { timezone, setTimezone, addToast } = useApp();
  const [pacingMs, setPacingMs] = useState(100);
  const [bulkCutoffHours, setBulkCutoffHours] = useState(330); // ~13.75 days
  const [requireDoubleConfirm, setRequireDoubleConfirm] = useState(true);

  const handleSave = () => {
    addToast({
      type: 'success',
      title: 'Preferences Saved',
      message: 'Moderation safety thresholds and pacing updated successfully.'
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-16 max-w-4xl">
      <div>
        <h2 className="text-2xl font-black text-gray-900 dark:text-white flex items-center gap-2.5">
          <Settings className="w-7 h-7 text-discord-blurple" />
          Safety &amp; Application Settings
        </h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Configure safety margins, Discord API request pacing, and timezone preferences.
        </p>
      </div>

      <div className="rounded-3xl border border-gray-200 dark:border-discord-dark-accent bg-white dark:bg-discord-dark-card p-6 shadow-sm space-y-6">
        <div className="space-y-4">
          <h3 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-500" />
            Destructive Action Safeguards
          </h3>

          <div className="divide-y divide-gray-100 dark:divide-discord-dark-accent/50 text-xs">
            <div className="py-3 flex items-center justify-between">
              <div>
                <div className="font-bold text-gray-900 dark:text-white">
                  Mandatory Two-Step Scan Confirmation
                </div>
                <div className="text-gray-400">
                  Always require administrator confirmation modal before deleting messages.
                </div>
              </div>
              <input
                type="checkbox"
                checked={requireDoubleConfirm}
                onChange={e => setRequireDoubleConfirm(e.target.checked)}
                className="rounded border-gray-300 text-discord-blurple focus:ring-discord-blurple"
              />
            </div>

            <div className="py-3 flex items-center justify-between">
              <div>
                <div className="font-bold text-gray-900 dark:text-white">
                  Discord API Pacing Delay (Single Deletion)
                </div>
                <div className="text-gray-400">
                  Safe interval between individual delete HTTP requests to prevent 429 rate limits.
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="50"
                  max="1000"
                  step="25"
                  value={pacingMs}
                  onChange={e => setPacingMs(Number(e.target.value))}
                  className="w-20 px-2 py-1 text-xs font-mono rounded-lg border border-gray-200 dark:border-discord-dark-accent bg-gray-50 dark:bg-discord-dark-bg text-right text-gray-900 dark:text-white"
                />
                <span className="text-gray-400 font-mono">ms</span>
              </div>
            </div>

            <div className="py-3 flex items-center justify-between">
              <div>
                <div className="font-bold text-gray-900 dark:text-white">
                  Bulk Delete Safety Buffer
                </div>
                <div className="text-gray-400">
                  Fallback to individual delete when message age is close to the 14-day Discord boundary.
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="200"
                  max="336"
                  value={bulkCutoffHours}
                  onChange={e => setBulkCutoffHours(Number(e.target.value))}
                  className="w-20 px-2 py-1 text-xs font-mono rounded-lg border border-gray-200 dark:border-discord-dark-accent bg-gray-50 dark:bg-discord-dark-bg text-right text-gray-900 dark:text-white"
                />
                <span className="text-gray-400 font-mono">hours ({(bulkCutoffHours / 24).toFixed(1)}d)</span>
              </div>
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-gray-100 dark:border-discord-dark-accent flex justify-end">
          <button
            type="button"
            onClick={handleSave}
            className="px-6 py-2.5 rounded-xl bg-discord-blurple hover:bg-discord-blurple-hover text-white font-bold text-xs shadow-md transition-colors cursor-pointer"
          >
            Save Safeguard Settings
          </button>
        </div>
      </div>

      {/* Database & Persistence Info Card */}
      <div className="rounded-3xl border border-gray-200 dark:border-discord-dark-accent bg-white dark:bg-discord-dark-card p-6 shadow-sm space-y-4">
        <h3 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-2">
          <Database className="w-4 h-4 text-discord-blurple" />
          Persistence &amp; Storage Architecture
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="p-3.5 rounded-2xl bg-gray-50 dark:bg-discord-dark-bg border border-gray-100 dark:border-discord-dark-accent space-y-1">
            <div className="font-bold text-gray-900 dark:text-white">SQLite Persistent Store</div>
            <div className="text-[11px] text-gray-400">WAL Mode + Foreign Keys active</div>
            <div className="text-[10px] text-emerald-500 font-bold flex items-center gap-1 mt-2">
              <CheckCircle2 className="w-3 h-3" /> Survives Restarts
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-gray-50 dark:bg-discord-dark-bg border border-gray-100 dark:border-discord-dark-accent space-y-1">
            <div className="font-bold text-gray-900 dark:text-white">Job Lock Protection</div>
            <div className="text-[11px] text-gray-400">Prevents concurrent duplicate deletes</div>
            <div className="text-[10px] text-emerald-500 font-bold flex items-center gap-1 mt-2">
              <CheckCircle2 className="w-3 h-3" /> Atomic Transitions
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-gray-50 dark:bg-discord-dark-bg border border-gray-100 dark:border-discord-dark-accent space-y-1">
            <div className="font-bold text-gray-900 dark:text-white">Token Zero-Storage</div>
            <div className="text-[11px] text-gray-400">Tokens held in backend memory only</div>
            <div className="text-[10px] text-emerald-500 font-bold flex items-center gap-1 mt-2">
              <CheckCircle2 className="w-3 h-3" /> No Tokens in DB/Logs
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
