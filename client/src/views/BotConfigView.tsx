import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  Bot,
  KeyRound,
  Shield,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Sparkles,
  Zap,
  Sliders,
  Lock,
  XCircle,
  Eye,
  EyeOff
} from 'lucide-react';

export const BotConfigView: React.FC = () => {
  const {
    botStatus,
    connectBotToken,
    enableDemoMode,
    disconnectBot,
    isDemo,
    addToast
  } = useApp();

  const [tokenInput, setTokenInput] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleConnectToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenInput.trim()) return;

    setIsSubmitting(true);
    try {
      await connectBotToken(tokenInput);
      // Immediately clear raw token from component memory
      setTokenInput('');
    } catch {
      // Error handled in context toast
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDemoToggle = async () => {
    setIsSubmitting(true);
    await enableDemoMode();
    setIsSubmitting(false);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-16 max-w-5xl">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-black text-gray-900 dark:text-white flex items-center gap-2.5">
          <Bot className="w-7 h-7 text-discord-blurple" />
          Discord Bot Configuration &amp; Auditing
        </h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Connect your Discord Bot securely. Tokens are never persisted in the database or client-side storage.
        </p>
      </div>

      {/* Main Bot Card & Token Form */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Token Form */}
        <div className="lg:col-span-2 rounded-3xl border border-gray-200 dark:border-discord-dark-accent bg-white dark:bg-discord-dark-card p-6 shadow-sm space-y-6">
          <div className="flex items-center justify-between border-b border-gray-100 dark:border-discord-dark-accent pb-4">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-discord-blurple" />
              Bot Authentication Token
            </span>
            <span className="text-[11px] font-mono text-emerald-500 flex items-center gap-1">
              <Lock className="w-3 h-3" />
              Session-Memory Only
            </span>
          </div>

          <form onSubmit={handleConnectToken} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-2">
                Discord Bot Token
              </label>
              <div className="relative">
                <input
                  type={showToken ? 'text' : 'password'}
                  value={tokenInput}
                  onChange={e => setTokenInput(e.target.value)}
                  placeholder={botStatus?.connected ? '••••••••••••••••••••••••••••••••••••••••••••' : 'Paste Discord bot token (MTAx...)'}
                  className="w-full pl-4 pr-12 py-3 rounded-2xl border border-gray-200 dark:border-discord-dark-accent bg-gray-50 dark:bg-discord-dark-bg text-sm font-mono text-gray-900 dark:text-white focus:outline-none focus:border-discord-blurple"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-3.5 top-3.5 text-gray-400 hover:text-gray-600 dark:hover:text-white"
                >
                  {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="mt-2 text-[11px] text-gray-400">
                Created in the <a href="https://discord.com/developers/applications" target="_blank" rel="noreferrer" className="text-discord-blurple font-bold hover:underline inline-flex items-center gap-0.5">Discord Developer Portal <ExternalLink className="w-3 h-3" /></a> under Bot Settings.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={isSubmitting || !tokenInput.trim()}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-discord-blurple hover:bg-discord-blurple-hover disabled:opacity-50 text-white font-bold text-xs shadow-md shadow-discord-blurple/25 transition-all cursor-pointer"
              >
                <Bot className="w-4 h-4" />
                <span>{isSubmitting ? 'Verifying Token...' : 'Connect Discord Bot'}</span>
              </button>

              <button
                type="button"
                onClick={handleDemoToggle}
                disabled={isSubmitting}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-indigo-500/30 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/20 font-bold text-xs transition-all cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                <span>Switch to Demo Simulation</span>
              </button>

              {botStatus?.connected && (
                <button
                  type="button"
                  onClick={disconnectBot}
                  className="px-4 py-2.5 rounded-xl border border-rose-500/30 text-rose-500 hover:bg-rose-500/10 font-semibold text-xs transition-colors ml-auto"
                >
                  Disconnect
                </button>
              )}
            </div>
          </form>

          {/* Token Security Guarantee Box */}
          <div className="rounded-2xl border border-gray-200 dark:border-discord-dark-accent bg-gray-50 dark:bg-discord-dark-bg p-4 text-xs text-gray-500 dark:text-gray-400 space-y-2">
            <div className="flex items-center gap-2 font-bold text-gray-700 dark:text-gray-300">
              <Shield className="w-4 h-4 text-emerald-500" />
              <span>Token Security Policy</span>
            </div>
            <ul className="space-y-1 text-[11px] list-disc list-inside">
              <li>Transmitted once over HTTPS directly to backend session memory.</li>
              <li>Immediately zeroed out from frontend JavaScript state.</li>
              <li>Never written to database tables, logs, or persistent cookies.</li>
            </ul>
          </div>
        </div>

        {/* Live Bot Identity Card */}
        <div className="rounded-3xl border border-gray-200 dark:border-discord-dark-accent bg-white dark:bg-discord-dark-card p-6 shadow-sm space-y-4">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-400">
            Active Bot Identity
          </span>

          {botStatus?.connected ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <img
                  src={botStatus.botUser?.avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png'}
                  alt=""
                  className="w-14 h-14 rounded-2xl border border-discord-blurple/40 object-cover"
                />
                <div>
                  <h4 className="font-bold text-base text-gray-900 dark:text-white">
                    {botStatus.botUser?.username}
                  </h4>
                  <p className="text-xs text-gray-400 font-mono">
                    ID: {botStatus.botUser?.id}
                  </p>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 mt-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                    <CheckCircle2 className="w-3 h-3" /> Online &amp; Authorized
                  </span>
                </div>
              </div>

              <div className="divide-y divide-gray-100 dark:divide-discord-dark-accent/50 text-xs pt-2">
                <div className="py-2 flex justify-between">
                  <span className="text-gray-400">Environment:</span>
                  <span className="font-bold text-gray-800 dark:text-gray-200">
                    {isDemo ? 'Demo Mock Mode' : 'Live Discord REST API'}
                  </span>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="text-gray-400">Accessible Servers:</span>
                  <span className="font-bold text-gray-800 dark:text-gray-200">
                    {botStatus.guildCount}
                  </span>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="text-gray-400">Rate Limit Safety:</span>
                  <span className="font-mono text-emerald-500 font-bold">
                    {botStatus.rateLimitSafetyMs}ms pacing
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center space-y-2 text-gray-400">
              <XCircle className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600" />
              <div className="text-xs font-bold">No Bot Connected</div>
              <p className="text-[11px]">Enter a bot token or enable Demo mode.</p>
            </div>
          )}
        </div>
      </div>

      {/* Permissions vs Privileged Intents Split Audit */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 1. Channel Permissions Checklist */}
        <div className="rounded-3xl border border-gray-200 dark:border-discord-dark-accent bg-white dark:bg-discord-dark-card p-6 shadow-sm space-y-4">
          <div className="space-y-1">
            <h3 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              Channel Permissions Audit
            </h3>
            <p className="text-xs text-gray-400">
              Permissions required by the bot role in channels where cleanup will be performed.
            </p>
          </div>

          <div className="space-y-2">
            <div className="p-3 rounded-2xl bg-gray-50 dark:bg-discord-dark-bg flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-gray-900 dark:text-white">VIEW_CHANNEL</div>
                <div className="text-[10px] text-gray-400">Allows bot to see text channel</div>
              </div>
              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                Required
              </span>
            </div>

            <div className="p-3 rounded-2xl bg-gray-50 dark:bg-discord-dark-bg flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-gray-900 dark:text-white">READ_MESSAGE_HISTORY</div>
                <div className="text-[10px] text-gray-400">Allows scanner to retrieve past messages</div>
              </div>
              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                Required
              </span>
            </div>

            <div className="p-3 rounded-2xl bg-gray-50 dark:bg-discord-dark-bg flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-gray-900 dark:text-white">MANAGE_MESSAGES</div>
                <div className="text-[10px] text-gray-400">Allows bulk and single message deletion</div>
              </div>
              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                Required
              </span>
            </div>
          </div>
        </div>

        {/* 2. Privileged Gateway Intents Audit */}
        <div className="rounded-3xl border border-gray-200 dark:border-discord-dark-accent bg-white dark:bg-discord-dark-card p-6 shadow-sm space-y-4">
          <div className="space-y-1">
            <h3 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-2">
              <Zap className="w-4 h-4 text-indigo-400" />
              Privileged Gateway Intents Audit
            </h3>
            <p className="text-xs text-gray-400">
              Configured in the Discord Developer Portal &gt; Bot &gt; Privileged Gateway Intents.
            </p>
          </div>

          <div className="space-y-2">
            <div className="p-3 rounded-2xl bg-gray-50 dark:bg-discord-dark-bg space-y-1">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-gray-900 dark:text-white">
                  Server Members Intent (GUILD_MEMBERS)
                </div>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  Recommended
                </span>
              </div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
                Needed for listing and searching server members by username. If disabled, direct Discord User ID input continues to work seamlessly.
              </p>
            </div>

            <div className="p-3 rounded-2xl bg-gray-50 dark:bg-discord-dark-bg space-y-1">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-gray-900 dark:text-white">
                  Message Content Intent (MESSAGE_CONTENT)
                </div>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                  Active
                </span>
              </div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
                Enables reading message text content, attachment summaries, and embed metadata during scan previews.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
