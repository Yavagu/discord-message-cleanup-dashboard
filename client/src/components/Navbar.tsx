import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  Server,
  Bot,
  Globe,
  Sun,
  Moon,
  LogOut,
  ChevronDown,
  ShieldCheck,
  Zap,
  CheckCircle2,
  XCircle,
  AlertCircle
} from 'lucide-react';

const COMMON_TIMEZONES = [
  'UTC',
  'Asia/Kolkata',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Australia/Sydney'
];

export const Navbar: React.FC = () => {
  const {
    adminUser,
    isDemo,
    botStatus,
    guilds,
    selectedGuild,
    setSelectedGuild,
    timezone,
    setTimezone,
    theme,
    toggleTheme,
    logout,
    setActiveTab
  } = useApp();

  const [isServerDropdownOpen, setIsServerDropdownOpen] = useState(false);
  const [isTzDropdownOpen, setIsTzDropdownOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-gray-200 dark:border-discord-dark-accent bg-white/90 dark:bg-discord-dark-sidebar/95 px-6 backdrop-blur-md transition-colors">
      {/* Left: Server Selector */}
      <div className="flex items-center gap-4">
        <div className="relative">
          <button
            onClick={() => setIsServerDropdownOpen(!isServerDropdownOpen)}
            className="flex items-center gap-2.5 rounded-xl border border-gray-200 dark:border-discord-dark-accent bg-gray-50 dark:bg-discord-dark-card px-3.5 py-2 text-sm font-medium hover:border-discord-blurple/50 hover:bg-gray-100 dark:hover:bg-discord-dark-hover transition-all"
          >
            {selectedGuild?.icon ? (
              <img src={selectedGuild.icon} alt="" className="w-5 h-5 rounded-full object-cover" />
            ) : (
              <Server className="w-4 h-4 text-discord-blurple" />
            )}
            <span className="max-w-[200px] truncate font-semibold text-gray-900 dark:text-white">
              {selectedGuild ? selectedGuild.name : 'Select Discord Server'}
            </span>
            <ChevronDown className="w-4 h-4 text-gray-400" />
          </button>

          {isServerDropdownOpen && (
            <div className="absolute left-0 mt-2 w-72 rounded-2xl border border-gray-200 dark:border-discord-dark-accent bg-white dark:bg-discord-dark-card p-2 shadow-2xl z-50 animate-in fade-in zoom-in-95">
              <div className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-gray-400">
                Connected Servers ({guilds.length})
              </div>
              <div className="max-h-60 overflow-y-auto space-y-1">
                {guilds.length === 0 ? (
                  <div className="p-3 text-xs text-gray-400 text-center">
                    No servers found. Please connect your bot first.
                  </div>
                ) : (
                  guilds.map(g => (
                    <button
                      key={g.id}
                      onClick={() => {
                        setSelectedGuild(g);
                        setIsServerDropdownOpen(false);
                      }}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${
                        selectedGuild?.id === g.id
                          ? 'bg-discord-blurple text-white'
                          : 'hover:bg-gray-100 dark:hover:bg-discord-dark-hover text-gray-800 dark:text-discord-dark-text'
                      }`}
                    >
                      {g.icon ? (
                        <img src={g.icon} alt="" className="w-6 h-6 rounded-full" />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-discord-blurple/20 flex items-center justify-center text-xs font-bold text-discord-blurple">
                          {g.name.substring(0, 1)}
                        </div>
                      )}
                      <div className="flex-1 truncate">
                        <div className="truncate font-medium">{g.name}</div>
                        {g.memberCount && (
                          <div className={`text-xs ${selectedGuild?.id === g.id ? 'text-white/80' : 'text-gray-400'}`}>
                            {g.memberCount.toLocaleString()} members
                          </div>
                        )}
                      </div>
                      {selectedGuild?.id === g.id && <CheckCircle2 className="w-4 h-4" />}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Bot Connection Indicator Pill */}
        <button
          onClick={() => setActiveTab('bot-config')}
          className={`flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-semibold border transition-all ${
            botStatus?.connected
              ? isDemo
                ? 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20'
                : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20'
              : 'border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20'
          }`}
        >
          <Bot className="w-3.5 h-3.5" />
          <span>
            {botStatus?.connected
              ? isDemo
                ? 'Demo Bot Active'
                : `@${botStatus.botUser?.username || 'Bot Connected'}`
              : 'Bot Disconnected'}
          </span>
          <span className={`w-2 h-2 rounded-full ${botStatus?.connected ? (isDemo ? 'bg-amber-400' : 'bg-emerald-400 animate-pulse') : 'bg-rose-400'}`} />
        </button>
      </div>

      {/* Right Controls: Timezone, Theme, Profile & Logout */}
      <div className="flex items-center gap-3">
        {/* Timezone Selector */}
        <div className="relative">
          <button
            onClick={() => setIsTzDropdownOpen(!isTzDropdownOpen)}
            className="flex items-center gap-1.5 rounded-xl border border-gray-200 dark:border-discord-dark-accent bg-gray-50 dark:bg-discord-dark-card px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-discord-dark-hover transition-colors"
            title="Active Cleanup Timezone"
          >
            <Globe className="w-3.5 h-3.5 text-discord-blurple" />
            <span className="font-mono">{timezone}</span>
            <ChevronDown className="w-3 h-3 text-gray-400" />
          </button>

          {isTzDropdownOpen && (
            <div className="absolute right-0 mt-2 w-60 rounded-2xl border border-gray-200 dark:border-discord-dark-accent bg-white dark:bg-discord-dark-card p-2 shadow-2xl z-50">
              <div className="px-3 py-1.5 text-xs font-semibold uppercase text-gray-400">
                Evaluation Timezone
              </div>
              <div className="max-h-56 overflow-y-auto space-y-0.5">
                {COMMON_TIMEZONES.map(tz => (
                  <button
                    key={tz}
                    onClick={() => {
                      setTimezone(tz);
                      setIsTzDropdownOpen(false);
                    }}
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-xs font-mono transition-colors ${
                      timezone === tz
                        ? 'bg-discord-blurple text-white font-bold'
                        : 'hover:bg-gray-100 dark:hover:bg-discord-dark-hover text-gray-700 dark:text-discord-dark-text'
                    }`}
                  >
                    <span>{tz}</span>
                    {timezone === tz && <CheckCircle2 className="w-3.5 h-3.5" />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Theme Toggle Button */}
        <button
          onClick={toggleTheme}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 dark:border-discord-dark-accent bg-gray-50 dark:bg-discord-dark-card text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-discord-dark-hover transition-colors"
          title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
        >
          {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-discord-blurple" />}
        </button>

        {/* Admin Badge & Logout */}
        <div className="flex items-center gap-2 pl-2 border-l border-gray-200 dark:border-discord-dark-accent">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-discord-blurple flex items-center justify-center text-white text-xs font-bold shadow-md">
              {adminUser ? adminUser.substring(0, 2).toUpperCase() : 'AD'}
            </div>
            <div className="hidden md:block text-left">
              <div className="text-xs font-semibold text-gray-900 dark:text-white leading-tight">
                {adminUser || 'Administrator'}
              </div>
              <div className="text-[10px] text-gray-400 font-mono flex items-center gap-1">
                <ShieldCheck className="w-2.5 h-2.5 text-emerald-400" />
                Auth Session
              </div>
            </div>
          </div>

          <button
            onClick={logout}
            className="p-1.5 rounded-lg text-gray-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors ml-1"
            title="Logout Admin Session"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
