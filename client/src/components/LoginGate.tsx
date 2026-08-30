import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Shield, KeyRound, Sparkles, ArrowRight, Lock, CheckCircle2 } from 'lucide-react';

export const LoginGate: React.FC = () => {
  const { login, demoLogin } = useApp();
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setIsSubmitting(true);
    await login(password);
    setIsSubmitting(false);
  };

  const handleDemo = async () => {
    setIsSubmitting(true);
    await demoLogin();
    setIsSubmitting(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-100 dark:bg-discord-dark-bg text-gray-900 dark:text-white selection:bg-discord-blurple selection:text-white">
      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-discord-blurple to-indigo-600 shadow-2xl text-white shadow-discord-blurple/30">
            <Shield className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight">Discord Sentinel</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Professional Message Cleanup & Audit Suite
          </p>
        </div>

        {/* Login Card */}
        <div className="rounded-3xl border border-gray-200 dark:border-discord-dark-accent bg-white dark:bg-discord-dark-card p-6 shadow-2xl space-y-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300 mb-2">
                Administrator Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter administrator password..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-discord-dark-accent bg-gray-50 dark:bg-discord-dark-bg text-sm text-gray-900 dark:text-white focus:outline-none focus:border-discord-blurple focus:ring-2 focus:ring-discord-blurple/20 transition-all font-mono"
                  autoFocus
                />
              </div>
              <p className="mt-1.5 text-[11px] text-gray-400">
                Default local password is <code className="text-discord-blurple font-bold">admin123</code> or <code className="text-discord-blurple font-bold">admin</code>
              </p>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !password}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-discord-blurple hover:bg-discord-blurple-hover disabled:opacity-50 text-white font-semibold text-sm shadow-lg shadow-discord-blurple/20 transition-all cursor-pointer"
            >
              <KeyRound className="w-4 h-4" />
              <span>{isSubmitting ? 'Authenticating...' : 'Sign In as Admin'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <div className="relative flex items-center justify-center">
            <div className="border-t border-gray-200 dark:border-discord-dark-accent w-full" />
            <span className="bg-white dark:bg-discord-dark-card px-3 text-[11px] font-bold uppercase text-gray-400 absolute">
              Or Try Instantly
            </span>
          </div>

          {/* Quick Demo Button */}
          <button
            type="button"
            onClick={handleDemo}
            disabled={isSubmitting}
            className="w-full flex items-center justify-between p-3.5 rounded-2xl border border-indigo-500/30 bg-indigo-500/5 hover:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 transition-all group text-left cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-500 group-hover:scale-110 transition-transform">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-bold">Launch Demo Simulation</div>
                <div className="text-[11px] text-gray-500 dark:text-gray-400">
                  Preloaded servers, channels, users & messages
                </div>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
          </button>
        </div>

        {/* Security badges */}
        <div className="flex items-center justify-center gap-4 text-xs text-gray-400">
          <div className="flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            <span>Secure Cookie Auth</span>
          </div>
          <div className="flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            <span>CSRF Protected</span>
          </div>
          <div className="flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            <span>Redacted Logs</span>
          </div>
        </div>
      </div>
    </div>
  );
};
