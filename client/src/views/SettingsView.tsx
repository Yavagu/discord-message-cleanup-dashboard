import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import {
  Settings,
  Shield,
  Clock,
  Database,
  CheckCircle2,
  Sliders,
  Layers,
  Save,
  Loader2
} from 'lucide-react';

export const SettingsView: React.FC = () => {
  const { settings, updateSettings, timezone } = useApp();

  const [pacingMs, setPacingMs] = useState(100);
  const [bulkCutoffHours, setBulkCutoffHours] = useState(332);
  const [requireDoubleConfirm, setRequireDoubleConfirm] = useState(true);
  const [maxMessagesPerChannel, setMaxMessagesPerChannel] = useState(1000);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (settings) {
      setPacingMs(settings.pacingMs);
      setBulkCutoffHours(settings.bulkCutoffHours);
      setRequireDoubleConfirm(settings.requireDoubleConfirm);
      setMaxMessagesPerChannel(settings.maxMessagesPerChannel);
    }
  }, [settings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await updateSettings({
        pacingMs,
        bulkCutoffHours,
        requireDoubleConfirm,
        maxMessagesPerChannel
      });
    } catch {
      // Error handled by context toast
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-16 max-w-4xl">
      <div>
        <h2 className="text-2xl font-black text-gray-900 dark:text-white flex items-center gap-2.5">
          <Settings className="w-7 h-7 text-discord-blurple" />
          Safety &amp; Application Settings
        </h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Configure real safety margins, Discord API request pacing, and persistent database thresholds.
        </p>
      </div>

      <form onSubmit={handleSave} className="rounded-3xl border border-gray-200 dark:border-discord-dark-accent bg-white dark:bg-discord-dark-card p-6 shadow-sm space-y-6">
        <div className="space-y-4">
          <h3 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-500" />
            Destructive Action Safeguards
          </h3>

          <div className="divide-y divide-gray-100 dark:divide-discord-dark-accent/50 text-xs">
            {/* Double Confirm */}
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
                className="rounded border-gray-300 text-discord-blurple focus:ring-discord-blurple h-4 w-4 cursor-pointer"
              />
            </div>

            {/* Pacing Ms */}
            <div className="py-3 flex items-center justify-between">
              <div>
                <div className="font-bold text-gray-900 dark:text-white">
                  Discord API Pacing Delay (Single Deletion)
                </div>
                <div className="text-gray-400">
                  Interval between individual delete HTTP requests to prevent 429 rate limits (25ms - 2000ms).
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="25"
                  max="2000"
                  step="25"
                  value={pacingMs}
                  onChange={e => setPacingMs(Number(e.target.value))}
                  className="w-24 px-2 py-1 text-xs font-mono rounded-lg border border-gray-200 dark:border-discord-dark-accent bg-gray-50 dark:bg-discord-dark-bg text-right text-gray-900 dark:text-white"
                />
                <span className="text-gray-400 font-mono">ms</span>
              </div>
            </div>

            {/* Bulk Cutoff Hours */}
            <div className="py-3 flex items-center justify-between">
              <div>
                <div className="font-bold text-gray-900 dark:text-white">
                  Bulk Delete Safety Threshold
                </div>
                <div className="text-gray-400">
                  Fallback to individual delete when message age exceeds this threshold (24h - 336h).
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="24"
                  max="336"
                  value={bulkCutoffHours}
                  onChange={e => setBulkCutoffHours(Number(e.target.value))}
                  className="w-24 px-2 py-1 text-xs font-mono rounded-lg border border-gray-200 dark:border-discord-dark-accent bg-gray-50 dark:bg-discord-dark-bg text-right text-gray-900 dark:text-white"
                />
                <span className="text-gray-400 font-mono">hours ({(bulkCutoffHours / 24).toFixed(1)}d)</span>
              </div>
            </div>

            {/* Channel Scan Ceiling */}
            <div className="py-3 flex items-center justify-between">
              <div>
                <div className="font-bold text-gray-900 dark:text-white">
                  Max Messages Scanned Per Channel
                </div>
                <div className="text-gray-400">
                  Maximum message history depth read per channel during a scan run (100 - 10,000).
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="100"
                  max="10000"
                  step="100"
                  value={maxMessagesPerChannel}
                  onChange={e => setMaxMessagesPerChannel(Number(e.target.value))}
                  className="w-24 px-2 py-1 text-xs font-mono rounded-lg border border-gray-200 dark:border-discord-dark-accent bg-gray-50 dark:bg-discord-dark-bg text-right text-gray-900 dark:text-white"
                />
                <span className="text-gray-400 font-mono">msgs</span>
              </div>
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-gray-100 dark:border-discord-dark-accent flex justify-end">
          <button
            type="submit"
            disabled={isSaving}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-discord-blurple hover:bg-discord-blurple-hover text-white font-bold text-xs shadow-md transition-colors cursor-pointer"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Saving to SQLite...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Save Safeguard Settings</span>
              </>
            )}
          </button>
        </div>
      </form>

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
