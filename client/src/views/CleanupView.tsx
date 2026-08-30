import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import {
  CleanupJob,
  DiscordChannel,
  GuildMember,
  JobProgressUpdate,
  ScannedMessage
} from '../types';
import {
  Eraser,
  Search,
  Calendar,
  Clock,
  User,
  Hash,
  Volume2,
  Megaphone,
  Mic,
  MessageSquare,
  Globe,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  X,
  ChevronDown,
  Filter,
  CheckSquare,
  Square,
  Eye,
  Loader2,
  ArrowRight,
  ShieldAlert,
  FileCode,
  Paperclip,
  Maximize2,
  StopCircle
} from 'lucide-react';

export const CleanupView: React.FC = () => {
  const { selectedGuild, timezone, addToast, viewJobReport, isDemo } = useApp();

  // Channels & Members State
  const [channels, setChannels] = useState<DiscordChannel[]>([]);
  const [selectedChannelIds, setSelectedChannelIds] = useState<string[]>([]);
  const [channelSearch, setChannelSearch] = useState('');
  const [isChannelDropdownOpen, setIsChannelDropdownOpen] = useState(false);

  // User Selection State
  const [targetUserId, setTargetUserId] = useState('');
  const [selectedMember, setSelectedMember] = useState<GuildMember | null>(null);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [searchedMembers, setSearchedMembers] = useState<GuildMember[]>([]);
  const [isSearchingMembers, setIsSearchingMembers] = useState(false);
  const [memberSearchWarning, setMemberSearchWarning] = useState<string | null>(null);
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);

  // Date Filter State
  const [dateMode, setDateMode] = useState<
    'ALL_TIME' | 'SPECIFIC_DATE' | 'BEFORE_DATE' | 'AFTER_DATE' | 'BETWEEN_DATES' | 'TODAY' | 'YESTERDAY' | 'LAST_7_DAYS' | 'LAST_30_DAYS'
  >('BETWEEN_DATES');
  const [startDate, setStartDate] = useState('2026-08-01');
  const [endDate, setEndDate] = useState('2026-08-15');

  // Time Filter State
  const [timeMode, setTimeMode] = useState<'ANY_TIME' | 'AFTER_TIME' | 'BEFORE_TIME' | 'BETWEEN_TIMES'>('AFTER_TIME');
  const [startTime, setStartTime] = useState('17:00');
  const [endTime, setEndTime] = useState('23:59');

  // Scan Results State
  const [isScanning, setIsScanning] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [scannedMessages, setScannedMessages] = useState<ScannedMessage[]>([]);
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(new Set());
  const [scanSummary, setScanSummary] = useState<{
    scannedCount: number;
    matchedCount: number;
    channelsCount: number;
    durationMs: number;
  } | null>(null);

  // Preview Table Filtering & Pagination
  const [tableSearch, setTableSearch] = useState('');
  const [tableChannelFilter, setTableChannelFilter] = useState('all');
  const [tableSort, setTableSort] = useState<'newest' | 'oldest'>('newest');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  // Modals State
  const [previewModalMessage, setPreviewModalMessage] = useState<ScannedMessage | null>(null);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deletionProgress, setDeletionProgress] = useState<JobProgressUpdate | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Load Channels when selectedGuild changes
  useEffect(() => {
    if (selectedGuild) {
      loadChannels(selectedGuild.id);
      loadInitialMembers(selectedGuild.id);
    }
  }, [selectedGuild]);

  const loadChannels = async (guildId: string) => {
    try {
      const data = await api.getChannels(guildId);
      setChannels(data);
      setSelectedChannelIds(['all']);
    } catch (err: any) {
      addToast({ type: 'error', title: 'Failed to load channels', message: err.message });
    }
  };

  const loadInitialMembers = async (guildId: string) => {
    try {
      const res = await api.searchMembers(guildId, '');
      setSearchedMembers(res.members);
      if (res.warning) {
        setMemberSearchWarning(res.warning);
      }
      // If we have members and no user selected, preselect first spammer or member in demo mode
      if (res.members.length > 0 && !selectedMember) {
        const defaultMember = res.members.find(m => m.id === '987654321000000001') || res.members[0];
        handleSelectMember(defaultMember);
      }
    } catch (err) {
      console.error('Failed to load members', err);
    }
  };

  // Search members debounced
  useEffect(() => {
    if (!selectedGuild) return;
    const timer = setTimeout(async () => {
      if (userSearchQuery.trim()) {
        setIsSearchingMembers(true);
        try {
          const res = await api.searchMembers(selectedGuild.id, userSearchQuery);
          setSearchedMembers(res.members);
          setMemberSearchWarning(res.warning || null);
        } catch (err) {
          console.error(err);
        } finally {
          setIsSearchingMembers(false);
        }
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [userSearchQuery, selectedGuild]);

  const handleSelectMember = (member: GuildMember) => {
    setSelectedMember(member);
    setTargetUserId(member.id);
    setIsUserDropdownOpen(false);
    setUserSearchQuery('');
  };

  const handleManualUserIdChange = (id: string) => {
    setTargetUserId(id);
    if (!selectedMember || selectedMember.id !== id) {
      const found = searchedMembers.find(m => m.id === id);
      if (found) {
        setSelectedMember(found);
      } else {
        setSelectedMember({
          id,
          username: `User_${id.slice(-4)}`,
          displayName: `Discord User (${id})`,
          avatarUrl: 'https://cdn.discordapp.com/embed/avatars/0.png',
          roles: []
        });
      }
    }
  };

  // Toggle Channels
  const handleToggleChannel = (channelId: string) => {
    if (channelId === 'all') {
      setSelectedChannelIds(['all']);
      return;
    }

    let newIds = selectedChannelIds.filter(id => id !== 'all');
    if (newIds.includes(channelId)) {
      newIds = newIds.filter(id => id !== channelId);
      if (newIds.length === 0) newIds = ['all'];
    } else {
      newIds.push(channelId);
    }
    setSelectedChannelIds(newIds);
  };

  // Run Message Scan
  const handleScanMessages = async () => {
    if (!selectedGuild) {
      addToast({ type: 'warning', title: 'No Server Selected', message: 'Please select a Discord server first.' });
      return;
    }

    if (!targetUserId || !targetUserId.trim()) {
      addToast({ type: 'warning', title: 'User Required', message: 'Please select or enter a target Discord User ID.' });
      return;
    }

    setIsScanning(true);
    setScannedMessages([]);
    setSelectedMessageIds(new Set());
    setScanSummary(null);

    try {
      const payload = {
        guildId: selectedGuild.id,
        guildName: selectedGuild.name,
        targetUserId: targetUserId.trim(),
        targetUsername: selectedMember?.username || 'Target User',
        targetDisplayName: selectedMember?.displayName || 'Target User',
        targetAvatarUrl: selectedMember?.avatarUrl || '',
        channelIds: selectedChannelIds,
        timezone,
        dateMode,
        startDate: ['BETWEEN_DATES', 'SPECIFIC_DATE', 'BEFORE_DATE', 'AFTER_DATE', 'CUSTOM_RANGE'].includes(dateMode) ? startDate : undefined,
        endDate: ['BETWEEN_DATES', 'CUSTOM_RANGE'].includes(dateMode) ? endDate : undefined,
        timeMode,
        startTime: ['AFTER_TIME', 'BEFORE_TIME', 'BETWEEN_TIMES'].includes(timeMode) ? startTime : undefined,
        endTime: ['BETWEEN_TIMES'].includes(timeMode) ? endTime : undefined
      };

      const res = await api.scanMessages(payload);

      setActiveJobId(res.jobId);
      setScannedMessages(res.messages);
      // Default select all matching messages
      setSelectedMessageIds(new Set(res.messages.map(m => m.id)));
      setScanSummary({
        scannedCount: res.scannedCount,
        matchedCount: res.matchedCount,
        channelsCount: res.channelsCount,
        durationMs: res.durationMs
      });

      addToast({
        type: 'success',
        title: 'Scan Complete',
        message: `Found ${res.matchedCount.toLocaleString()} matching messages from ${res.scannedCount.toLocaleString()} scanned.`
      });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Scan Failed', message: err.message });
    } finally {
      setIsScanning(false);
    }
  };

  // Filtered & Paginated Preview Table Items
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

  // Selection handlers
  const handleSelectAll = () => {
    setSelectedMessageIds(new Set(scannedMessages.map(m => m.id)));
  };

  const handleDeselectAll = () => {
    setSelectedMessageIds(new Set());
  };

  const handleToggleMessage = (msgId: string) => {
    const updated = new Set(selectedMessageIds);
    if (updated.has(msgId)) {
      updated.delete(msgId);
    } else {
      updated.add(msgId);
    }
    setSelectedMessageIds(updated);
  };

  // Start Safe Deletion
  const handleConfirmDelete = async () => {
    if (!activeJobId || selectedMessageIds.size === 0) return;

    setIsConfirmModalOpen(false);
    setIsDeleting(true);

    try {
      // Connect to SSE stream for live progress
      const sseUrl = `/api/jobs/${activeJobId}/progress`;
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      const es = new EventSource(sseUrl);
      eventSourceRef.current = es;

      es.onmessage = (event) => {
        try {
          const update = JSON.parse(event.data) as JobProgressUpdate;
          setDeletionProgress(update);

          if (['COMPLETED', 'PARTIALLY_COMPLETED', 'FAILED', 'CANCELLED'].includes(update.status)) {
            es.close();
            setIsDeleting(false);
            addToast({
              type: update.status === 'COMPLETED' ? 'success' : update.status === 'PARTIALLY_COMPLETED' ? 'warning' : 'info',
              title: `Cleanup ${update.status.replace(/_/g, ' ')}`,
              message: `Deleted ${update.deleted.toLocaleString()} messages (${update.failed} failed).`
            });
            // Automatically navigate to Detailed Report
            viewJobReport(activeJobId);
          }
        } catch (e) {
          console.error('Error parsing SSE progress', e);
        }
      };

      es.onerror = () => {
        // Fallback or retry
      };

      // Trigger deletion endpoint
      const idsToSend = Array.from(selectedMessageIds);
      await api.deleteJobMessages(activeJobId, idsToSend);
    } catch (err: any) {
      setIsDeleting(false);
      addToast({ type: 'error', title: 'Deletion Trigger Error', message: err.message });
    }
  };

  const handleCancelDeletion = async () => {
    if (!activeJobId) return;
    try {
      await api.cancelJob(activeJobId);
      addToast({ type: 'info', title: 'Cancellation Sent', message: 'Stopping cleanup worker safely...' });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Failed to cancel', message: err.message });
    }
  };

  // Channel icon and label helpers
  const getChannelIcon = (type?: number) => {
    switch (type) {
      case 2: // GUILD_VOICE
        return <Volume2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />;
      case 13: // GUILD_STAGE_VOICE
        return <Mic className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />;
      case 5: // GUILD_ANNOUNCEMENT
        return <Megaphone className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />;
      case 15: // GUILD_FORUM
        return <MessageSquare className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />;
      default:
        return <Hash className="w-3.5 h-3.5 text-discord-blurple flex-shrink-0" />;
    }
  };

  const getChannelTypeBadge = (type?: number) => {
    switch (type) {
      case 2:
        return (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
            VC Chat
          </span>
        );
      case 13:
        return (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            Stage
          </span>
        );
      case 5:
        return (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20">
            Announcement
          </span>
        );
      default:
        return (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-gray-500/10 text-gray-400 border border-gray-500/20">
            Text
          </span>
        );
    }
  };

  const voiceChannelsCount = channels.filter(c => c.type === 2 || c.type === 13).length;
  const textChannelsCount = channels.filter(c => c.type === 0 || c.type === 5 || c.type === 15).length;

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-gray-900 dark:text-white flex items-center gap-2.5">
            <Eraser className="w-7 h-7 text-discord-blurple" />
            Message Cleanup Builder
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Build multi-criteria deletion queries with safe two-step review across text and voice chat channels.
          </p>
        </div>

        {/* Timezone chip */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-gray-200 dark:border-discord-dark-accent bg-white dark:bg-discord-dark-card text-xs font-mono text-gray-700 dark:text-gray-300 shadow-sm">
          <Globe className="w-3.5 h-3.5 text-discord-blurple" />
          <span>Timezone: <strong className="text-discord-blurple">{timezone}</strong></span>
        </div>
      </div>

      {/* 1. QUERY BUILDER CARD */}
      <div className="rounded-3xl border border-gray-200 dark:border-discord-dark-accent bg-white dark:bg-discord-dark-card p-6 shadow-sm space-y-6">
        <div className="border-b border-gray-100 dark:border-discord-dark-accent pb-4 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
            <Filter className="w-4 h-4 text-discord-blurple" />
            Step 1: Define Filtering Criteria
          </span>
          <span className="text-xs font-medium text-discord-blurple">
            Strict Snowflake User ID Matching
          </span>
        </div>

        {/* Form Controls Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* A. User Selection (Immutable ID matching) */}
          <div className="space-y-2 lg:col-span-1">
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
              1. Target Discord User *
            </label>

            {/* Selected User Display Card */}
            {selectedMember ? (
              <div className="flex items-center justify-between p-3 rounded-2xl border border-discord-blurple/30 bg-discord-blurple/5 dark:bg-discord-blurple/10">
                <div className="flex items-center gap-3 min-w-0">
                  <img
                    src={selectedMember.avatarUrl}
                    alt=""
                    className="w-10 h-10 rounded-full border border-discord-blurple/40 flex-shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="font-bold text-sm text-gray-900 dark:text-white truncate">
                      {selectedMember.displayName}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      @{selectedMember.username}
                    </div>
                    <div className="text-[10px] font-mono text-discord-blurple font-bold">
                      ID: {selectedMember.id}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setSelectedMember(null);
                    setTargetUserId('');
                  }}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                  title="Change User"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="relative space-y-2">
                <div className="relative">
                  <User className="w-4 h-4 text-gray-400 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    value={userSearchQuery}
                    onChange={e => {
                      setUserSearchQuery(e.target.value);
                      setIsUserDropdownOpen(true);
                    }}
                    onFocus={() => setIsUserDropdownOpen(true)}
                    placeholder="Search username or paste User ID..."
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-discord-dark-accent bg-gray-50 dark:bg-discord-dark-bg text-sm text-gray-900 dark:text-white focus:outline-none focus:border-discord-blurple"
                  />
                  {isSearchingMembers && (
                    <Loader2 className="w-4 h-4 text-discord-blurple animate-spin absolute right-3 top-3" />
                  )}
                </div>

                {/* Dropdown for searched members */}
                {isUserDropdownOpen && (
                  <div className="absolute left-0 right-0 mt-1 rounded-2xl border border-gray-200 dark:border-discord-dark-accent bg-white dark:bg-discord-dark-card p-2 shadow-2xl z-50 max-h-56 overflow-y-auto space-y-1">
                    {searchedMembers.length === 0 ? (
                      <div className="p-3 text-xs text-gray-400 text-center">
                        {isSearchingMembers ? 'Searching members...' : 'No matching members found.'}
                      </div>
                    ) : (
                      searchedMembers.map(m => (
                        <button
                          key={m.id}
                          onClick={() => handleSelectMember(m)}
                          className="flex w-full items-center gap-3 p-2 rounded-xl text-left hover:bg-gray-100 dark:hover:bg-discord-dark-hover transition-colors"
                        >
                          <img src={m.avatarUrl} alt="" className="w-7 h-7 rounded-full" />
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-bold text-gray-900 dark:text-white truncate">
                              {m.displayName}
                            </div>
                            <div className="text-[10px] text-gray-400 font-mono truncate">
                              @{m.username} • {m.id}
                            </div>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Direct manual User ID input */}
            <div className="flex items-center gap-2 pt-1">
              <span className="text-[11px] text-gray-400">Manual ID:</span>
              <input
                type="text"
                value={targetUserId}
                onChange={e => handleManualUserIdChange(e.target.value)}
                placeholder="17-20 digit snowflake..."
                className="flex-1 px-2.5 py-1 rounded-lg border border-gray-200 dark:border-discord-dark-accent bg-gray-50 dark:bg-discord-dark-bg text-xs font-mono text-gray-800 dark:text-gray-200 focus:outline-none focus:border-discord-blurple"
              />
            </div>

            {memberSearchWarning && (
              <p className="text-[10px] text-amber-500 leading-tight">
                {memberSearchWarning}
              </p>
            )}
          </div>

          {/* B. Channel Selection (Text & Voice Channels) */}
          <div className="space-y-2 lg:col-span-1">
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
              2. Channel Scope (Text &amp; Voice Chat) *
            </label>

            <div className="relative">
              <button
                type="button"
                onClick={() => setIsChannelDropdownOpen(!isChannelDropdownOpen)}
                className="flex w-full items-center justify-between p-3 rounded-2xl border border-gray-200 dark:border-discord-dark-accent bg-gray-50 dark:bg-discord-dark-bg text-sm text-gray-900 dark:text-white hover:border-discord-blurple/50 transition-colors"
              >
                <div className="flex items-center gap-2 truncate">
                  <Hash className="w-4 h-4 text-discord-blurple flex-shrink-0" />
                  <span className="font-medium truncate">
                    {selectedChannelIds.includes('all')
                      ? `All Channels (${channels.length} text & VC)`
                      : `${selectedChannelIds.length} channel(s) selected`}
                  </span>
                </div>
                <ChevronDown className="w-4 h-4 text-gray-400" />
              </button>

              {isChannelDropdownOpen && (
                <div className="absolute left-0 right-0 mt-2 rounded-2xl border border-gray-200 dark:border-discord-dark-accent bg-white dark:bg-discord-dark-card p-3 shadow-2xl z-50 space-y-2">
                  <input
                    type="text"
                    value={channelSearch}
                    onChange={e => setChannelSearch(e.target.value)}
                    placeholder="Search text & VC channels..."
                    className="w-full px-3 py-1.5 text-xs rounded-xl border border-gray-200 dark:border-discord-dark-accent bg-gray-50 dark:bg-discord-dark-bg text-gray-900 dark:text-white focus:outline-none focus:border-discord-blurple"
                  />

                  <div className="max-h-56 overflow-y-auto space-y-1">
                    {/* All channels toggle */}
                    <button
                      type="button"
                      onClick={() => handleToggleChannel('all')}
                      className={`flex w-full items-center justify-between p-2 rounded-xl text-xs font-semibold transition-colors ${
                        selectedChannelIds.includes('all')
                          ? 'bg-discord-blurple text-white'
                          : 'hover:bg-gray-100 dark:hover:bg-discord-dark-hover text-gray-800 dark:text-gray-200'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Hash className="w-3.5 h-3.5" />
                        <span>All Channels ({channels.length})</span>
                      </div>
                      <span className="text-[10px] opacity-80">{textChannelsCount} text, {voiceChannelsCount} VC</span>
                    </button>

                    {channels
                      .filter(c => c.name.toLowerCase().includes(channelSearch.toLowerCase()))
                      .map(c => {
                        const isSelected = selectedChannelIds.includes(c.id);
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => handleToggleChannel(c.id)}
                            className={`flex w-full items-center justify-between p-2 rounded-xl text-xs transition-colors ${
                              isSelected
                                ? 'bg-discord-blurple/20 text-discord-blurple font-bold'
                                : 'hover:bg-gray-100 dark:hover:bg-discord-dark-hover text-gray-700 dark:text-gray-300'
                            }`}
                          >
                            <div className="flex items-center gap-2 truncate">
                              {getChannelIcon(c.type)}
                              <span className="truncate">{c.name}</span>
                              {c.parentName && (
                                <span className="text-[10px] text-gray-400 truncate">({c.parentName})</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              {getChannelTypeBadge(c.type)}
                              {isSelected ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5 text-gray-400" />}
                            </div>
                          </button>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>

            <p className="text-[11px] text-gray-400">
              Includes standard text channels, Voice Channel (VC) text chats, announcements, and stages.
            </p>
          </div>

          {/* C. Date & Time Conditions */}
          <div className="space-y-4 lg:col-span-1">
            {/* Date Mode */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                3. Date Condition
              </label>
              <select
                value={dateMode}
                onChange={e => setDateMode(e.target.value as any)}
                className="w-full p-2.5 rounded-xl border border-gray-200 dark:border-discord-dark-accent bg-gray-50 dark:bg-discord-dark-bg text-xs font-medium text-gray-900 dark:text-white focus:outline-none focus:border-discord-blurple"
              >
                <option value="ALL_TIME">All Time (No Date Limit)</option>
                <option value="BETWEEN_DATES">Between Two Dates</option>
                <option value="SPECIFIC_DATE">Specific Date</option>
                <option value="AFTER_DATE">After Date</option>
                <option value="BEFORE_DATE">Before Date</option>
                <option value="TODAY">Today</option>
                <option value="YESTERDAY">Yesterday</option>
                <option value="LAST_7_DAYS">Last 7 Days</option>
                <option value="LAST_30_DAYS">Last 30 Days</option>
              </select>

              {['BETWEEN_DATES', 'SPECIFIC_DATE', 'BEFORE_DATE', 'AFTER_DATE', 'CUSTOM_RANGE'].includes(dateMode) && (
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="date"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    className="w-full p-2 rounded-xl border border-gray-200 dark:border-discord-dark-accent bg-gray-50 dark:bg-discord-dark-bg text-xs text-gray-900 dark:text-white font-mono focus:outline-none focus:border-discord-blurple"
                  />
                  {dateMode === 'BETWEEN_DATES' && (
                    <>
                      <span className="text-xs text-gray-400">to</span>
                      <input
                        type="date"
                        value={endDate}
                        onChange={e => setEndDate(e.target.value)}
                        className="w-full p-2 rounded-xl border border-gray-200 dark:border-discord-dark-accent bg-gray-50 dark:bg-discord-dark-bg text-xs text-gray-900 dark:text-white font-mono focus:outline-none focus:border-discord-blurple"
                      />
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Time Mode */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                4. Time Condition
              </label>
              <select
                value={timeMode}
                onChange={e => setTimeMode(e.target.value as any)}
                className="w-full p-2.5 rounded-xl border border-gray-200 dark:border-discord-dark-accent bg-gray-50 dark:bg-discord-dark-bg text-xs font-medium text-gray-900 dark:text-white focus:outline-none focus:border-discord-blurple"
              >
                <option value="ANY_TIME">Any Time (All Day)</option>
                <option value="AFTER_TIME">After Time (e.g. After 5:00 PM)</option>
                <option value="BEFORE_TIME">Before Time (e.g. Before 12:00 PM)</option>
                <option value="BETWEEN_TIMES">Between Two Times</option>
              </select>

              {timeMode !== 'ANY_TIME' && (
                <div className="flex items-center gap-2 pt-1">
                  <div className="relative w-full">
                    <Clock className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-2.5" />
                    <input
                      type="time"
                      value={startTime}
                      onChange={e => setStartTime(e.target.value)}
                      className="w-full pl-8 pr-2 py-1.5 rounded-xl border border-gray-200 dark:border-discord-dark-accent bg-gray-50 dark:bg-discord-dark-bg text-xs text-gray-900 dark:text-white font-mono focus:outline-none focus:border-discord-blurple"
                    />
                  </div>
                  {timeMode === 'BETWEEN_TIMES' && (
                    <>
                      <span className="text-xs text-gray-400">to</span>
                      <div className="relative w-full">
                        <Clock className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-2.5" />
                        <input
                          type="time"
                          value={endTime}
                          onChange={e => setEndTime(e.target.value)}
                          className="w-full pl-8 pr-2 py-1.5 rounded-xl border border-gray-200 dark:border-discord-dark-accent bg-gray-50 dark:bg-discord-dark-bg text-xs text-gray-900 dark:text-white font-mono focus:outline-none focus:border-discord-blurple"
                        />
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Live Query Summary Banner */}
        <div className="rounded-2xl border border-discord-blurple/30 bg-discord-blurple/5 dark:bg-discord-blurple/10 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="text-xs font-bold text-discord-blurple uppercase tracking-wider">
              Live Query Summary
            </div>
            <p className="text-xs text-gray-700 dark:text-discord-dark-text leading-relaxed">
              Delete messages from{' '}
              <strong className="text-gray-900 dark:text-white">
                {selectedMember ? `@${selectedMember.username}` : targetUserId || 'Specified User'}
              </strong>{' '}
              across{' '}
              <strong className="text-gray-900 dark:text-white">
                {selectedChannelIds.includes('all') ? 'All Channels' : `${selectedChannelIds.length} Selected Channels`}
              </strong>
              {dateMode !== 'ALL_TIME' && (
                <>
                  {' '}where date is{' '}
                  <strong className="text-gray-900 dark:text-white">
                    {dateMode === 'BETWEEN_DATES' ? `${startDate} to ${endDate}` : dateMode.toLowerCase().replace(/_/g, ' ')}
                  </strong>
                </>
              )}
              {timeMode !== 'ANY_TIME' && (
                <>
                  {' '}and time is{' '}
                  <strong className="text-gray-900 dark:text-white">
                    {timeMode === 'AFTER_TIME' ? `After ${startTime}` : timeMode === 'BEFORE_TIME' ? `Before ${startTime}` : `${startTime} - ${endTime}`}
                  </strong>
                </>
              )}
              {' '}in <span className="font-mono text-discord-blurple font-bold">{timezone}</span>.
            </p>
          </div>

          <button
            onClick={handleScanMessages}
            disabled={isScanning || !targetUserId}
            className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-discord-blurple hover:bg-discord-blurple-hover disabled:opacity-50 text-white font-bold text-sm shadow-xl shadow-discord-blurple/25 transition-all flex-shrink-0 cursor-pointer"
          >
            {isScanning ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Scanning Channels...</span>
              </>
            ) : (
              <>
                <Search className="w-4 h-4" />
                <span>Scan Messages</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* 2. SCAN METRICS BANNER */}
      {scanSummary && (
        <div className="rounded-3xl border border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-950/20 p-5 shadow-sm flex flex-wrap items-center justify-between gap-4 animate-in fade-in slide-in-from-top-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-500">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-gray-900 dark:text-white">
                {scanSummary.matchedCount.toLocaleString()} Matching Messages Discovered
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Scanned {scanSummary.scannedCount.toLocaleString()} messages across {scanSummary.channelsCount} channels in {scanSummary.durationMs}ms
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsConfirmModalOpen(true)}
              disabled={selectedMessageIds.size === 0}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold text-xs shadow-lg shadow-rose-600/25 transition-all cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              <span>Delete {selectedMessageIds.size.toLocaleString()} Selected Messages</span>
            </button>
          </div>
        </div>
      )}

      {/* 3. INTERACTIVE MESSAGE PREVIEW TABLE */}
      {scannedMessages.length > 0 && (
        <div className="rounded-3xl border border-gray-200 dark:border-discord-dark-accent bg-white dark:bg-discord-dark-card shadow-sm overflow-hidden space-y-4 p-6">
          {/* Table Toolbar */}
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-gray-100 dark:border-discord-dark-accent pb-4">
            <div className="flex items-center gap-2">
              <button
                onClick={handleSelectAll}
                className="px-3 py-1.5 rounded-xl border border-gray-200 dark:border-discord-dark-accent bg-gray-50 dark:bg-discord-dark-bg text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-discord-dark-hover transition-colors"
              >
                Select All ({scannedMessages.length})
              </button>
              <button
                onClick={handleDeselectAll}
                className="px-3 py-1.5 rounded-xl border border-gray-200 dark:border-discord-dark-accent bg-gray-50 dark:bg-discord-dark-bg text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-discord-dark-hover transition-colors"
              >
                Deselect All
              </button>
              <span className="text-xs text-gray-400 font-mono ml-2">
                Selected: <strong className="text-discord-blurple">{selectedMessageIds.size}</strong> / {scannedMessages.length}
              </span>
            </div>

            {/* Search & Channel Filter within table */}
            <div className="flex items-center gap-3 w-full md:w-auto">
              <div className="relative flex-1 md:w-64">
                <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={tableSearch}
                  onChange={e => {
                    setTableSearch(e.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder="Filter preview text..."
                  className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-gray-200 dark:border-discord-dark-accent bg-gray-50 dark:bg-discord-dark-bg text-xs text-gray-900 dark:text-white focus:outline-none focus:border-discord-blurple"
                />
              </div>

              <select
                value={tableChannelFilter}
                onChange={e => {
                  setTableChannelFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="px-3 py-1.5 rounded-xl border border-gray-200 dark:border-discord-dark-accent bg-gray-50 dark:bg-discord-dark-bg text-xs text-gray-700 dark:text-gray-300 focus:outline-none"
              >
                <option value="all">All Channels</option>
                {channels.map(c => (
                  <option key={c.id} value={c.id}>#{c.name}</option>
                ))}
              </select>

              <select
                value={tableSort}
                onChange={e => setTableSort(e.target.value as any)}
                className="px-3 py-1.5 rounded-xl border border-gray-200 dark:border-discord-dark-accent bg-gray-50 dark:bg-discord-dark-bg text-xs text-gray-700 dark:text-gray-300 focus:outline-none"
              >
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
              </select>
            </div>
          </div>

          {/* Table Container */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-gray-200 dark:border-discord-dark-accent text-gray-400 font-bold uppercase tracking-wider">
                  <th className="py-3 px-3 w-10">
                    <input
                      type="checkbox"
                      checked={selectedMessageIds.size === scannedMessages.length && scannedMessages.length > 0}
                      onChange={e => e.target.checked ? handleSelectAll() : handleDeselectAll()}
                      className="rounded border-gray-300 text-discord-blurple focus:ring-discord-blurple"
                    />
                  </th>
                  <th className="py-3 px-3">Author</th>
                  <th className="py-3 px-3 min-w-[280px]">Message Preview</th>
                  <th className="py-3 px-3">Channel</th>
                  <th className="py-3 px-3">Local Timestamp ({timezone})</th>
                  <th className="py-3 px-3">Pacing Mode</th>
                  <th className="py-3 px-3">Message ID</th>
                  <th className="py-3 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-discord-dark-accent/40">
                {paginatedMessages.map(msg => {
                  const isSelected = selectedMessageIds.has(msg.id);
                  return (
                    <tr
                      key={msg.id}
                      className={`hover:bg-gray-50 dark:hover:bg-discord-dark-hover/40 transition-colors ${
                        isSelected ? 'bg-discord-blurple/[0.03]' : ''
                      }`}
                    >
                      <td className="py-3 px-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleMessage(msg.id)}
                          className="rounded border-gray-300 text-discord-blurple focus:ring-discord-blurple"
                        />
                      </td>

                      {/* Author */}
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <img
                            src={msg.authorAvatarUrl}
                            alt=""
                            className="w-6 h-6 rounded-full object-cover flex-shrink-0"
                          />
                          <div className="truncate max-w-[120px]">
                            <span className="font-bold text-gray-900 dark:text-white truncate block">
                              {msg.authorDisplayName}
                            </span>
                            <span className="text-[10px] text-gray-400 font-mono block">
                              @{msg.authorUsername}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Content Preview */}
                      <td className="py-3 px-3">
                        <div className="space-y-1">
                          <p className="text-gray-800 dark:text-discord-dark-text line-clamp-2 max-w-md font-sans">
                            {msg.content || <span className="italic text-gray-400">No text content</span>}
                          </p>
                          {(msg.hasAttachments || msg.hasEmbeds) && (
                            <div className="flex items-center gap-2">
                              {msg.hasAttachments && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-100 dark:bg-discord-dark-bg text-[10px] text-gray-500 font-mono">
                                  <Paperclip className="w-2.5 h-2.5" /> {msg.attachmentCount} file
                                </span>
                              )}
                              {msg.hasEmbeds && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-100 dark:bg-discord-dark-bg text-[10px] text-indigo-400 font-mono">
                                  <FileCode className="w-2.5 h-2.5" /> {msg.embedCount} embed
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Channel */}
                      <td className="py-3 px-3">
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-gray-100 dark:bg-discord-dark-bg font-mono text-[11px] text-gray-700 dark:text-gray-300">
                          {getChannelIcon(channels.find(c => c.id === msg.channelId)?.type)}
                          <span className="truncate max-w-[140px]">{msg.channelName}</span>
                        </span>
                      </td>

                      {/* Timestamp */}
                      <td className="py-3 px-3 font-mono text-[11px] text-gray-600 dark:text-gray-400 whitespace-nowrap">
                        {msg.timestampLocalFormatted}
                      </td>

                      {/* Age Mode */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        {msg.isBulkDeletable ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                            Bulk Delete (&lt;14d)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20">
                            Single Delete (&gt;14d)
                          </span>
                        )}
                      </td>

                      {/* Message ID */}
                      <td className="py-3 px-3 font-mono text-[10px] text-gray-400">
                        {msg.id}
                      </td>

                      {/* Action */}
                      <td className="py-3 px-3 text-right">
                        <button
                          onClick={() => setPreviewModalMessage(msg)}
                          className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-discord-dark-accent text-gray-400 hover:text-discord-blurple transition-colors"
                          title="View Full Message"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between pt-4 border-t border-gray-100 dark:border-discord-dark-accent text-xs">
            <span className="text-gray-400">
              Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, filteredMessages.length)} of {filteredMessages.length} messages
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
      )}

      {/* 4. MESSAGE DETAILS MODAL */}
      {previewModalMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-xl rounded-3xl border border-gray-200 dark:border-discord-dark-accent bg-white dark:bg-discord-dark-card p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-discord-dark-accent pb-3">
              <div className="flex items-center gap-3">
                <img
                  src={previewModalMessage.authorAvatarUrl}
                  alt=""
                  className="w-10 h-10 rounded-full"
                />
                <div>
                  <h4 className="font-bold text-sm text-gray-900 dark:text-white">
                    {previewModalMessage.authorDisplayName}
                  </h4>
                  <p className="text-xs text-gray-400 font-mono">
                    @{previewModalMessage.authorUsername} • ID: {previewModalMessage.authorId}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setPreviewModalMessage(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <span className="text-[10px] uppercase font-bold text-gray-400">Channel</span>
                <p className="text-xs font-mono text-gray-800 dark:text-gray-200">
                  #{previewModalMessage.channelName} ({previewModalMessage.channelId})
                </p>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-gray-400">Timestamp</span>
                <p className="text-xs font-mono text-gray-800 dark:text-gray-200">
                  {previewModalMessage.timestampLocalFormatted}
                </p>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-gray-400">Complete Message Content</span>
                <div className="mt-1 p-3.5 rounded-2xl bg-gray-50 dark:bg-discord-dark-bg text-sm text-gray-900 dark:text-discord-dark-text whitespace-pre-wrap font-sans border border-gray-200 dark:border-discord-dark-accent">
                  {previewModalMessage.content || <span className="italic text-gray-400">No message text</span>}
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setPreviewModalMessage(null)}
                className="px-4 py-2 rounded-xl bg-gray-100 dark:bg-discord-dark-accent font-semibold text-xs text-gray-700 dark:text-gray-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. SAFE TWO-STEP DELETE CONFIRMATION MODAL */}
      {isConfirmModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-lg rounded-3xl border border-rose-500/40 bg-white dark:bg-discord-dark-bg p-6 shadow-2xl space-y-6">
            <div className="flex items-center gap-3 text-rose-500">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/10">
                <ShieldAlert className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-lg font-black text-gray-900 dark:text-white">
                  Confirm Message Cleanup
                </h3>
                <p className="text-xs text-rose-500 font-semibold">
                  This action is destructive and irreversible.
                </p>
              </div>
            </div>

            {/* Criteria breakdown */}
            <div className="rounded-2xl border border-gray-200 dark:border-discord-dark-accent bg-gray-50 dark:bg-discord-dark-card p-4 space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-gray-200/50 dark:border-discord-dark-accent/50">
                <span className="text-gray-400">Target User:</span>
                <span className="font-bold text-gray-900 dark:text-white">
                  {selectedMember?.displayName || targetUserId} (@{selectedMember?.username || 'user'})
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-gray-200/50 dark:border-discord-dark-accent/50">
                <span className="text-gray-400">Discord User ID:</span>
                <span className="font-mono font-bold text-discord-blurple">{targetUserId}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-gray-200/50 dark:border-discord-dark-accent/50">
                <span className="text-gray-400">Total Selected:</span>
                <span className="font-bold text-rose-500 text-sm">
                  {selectedMessageIds.size.toLocaleString()} messages
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-gray-200/50 dark:border-discord-dark-accent/50">
                <span className="text-gray-400">Channel Scope:</span>
                <span className="font-bold text-gray-900 dark:text-white">
                  {selectedChannelIds.includes('all') ? `All Text Channels (${channels.length})` : `${selectedChannelIds.length} Channels`}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-gray-400">Timezone Context:</span>
                <span className="font-mono text-gray-900 dark:text-white">{timezone}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsConfirmModalOpen(false)}
                className="px-4 py-2.5 rounded-xl border border-gray-200 dark:border-discord-dark-accent font-semibold text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-discord-dark-hover"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs shadow-lg shadow-rose-600/30 transition-all cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>Confirm &amp; Delete {selectedMessageIds.size.toLocaleString()} Messages</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. LIVE DELETION PROGRESS MODAL */}
      {isDeleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-lg rounded-3xl border border-discord-blurple/40 bg-white dark:bg-discord-dark-bg p-8 shadow-2xl space-y-6 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-discord-blurple/10 text-discord-blurple animate-pulse">
              <Eraser className="w-8 h-8" />
            </div>

            <div className="space-y-1">
              <h3 className="text-2xl font-black text-gray-900 dark:text-white">
                Deleting Messages...
              </h3>
              <p className="text-xs text-gray-400">
                Respecting Discord rate limits, 14-day bulk delete windows, and channel permissions.
              </p>
            </div>

            {/* Progress Bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-gray-400">
                  Progress: {deletionProgress ? deletionProgress.processed : 0} / {deletionProgress ? deletionProgress.totalSelected : selectedMessageIds.size}
                </span>
                <span className="font-bold text-discord-blurple">
                  {deletionProgress ? `${deletionProgress.percent}%` : '0%'}
                </span>
              </div>
              <div className="w-full h-3.5 rounded-full bg-gray-100 dark:bg-discord-dark-card overflow-hidden border border-gray-200 dark:border-discord-dark-accent p-0.5">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-discord-blurple to-indigo-500 transition-all duration-300"
                  style={{ width: `${deletionProgress ? deletionProgress.percent : 0}%` }}
                />
              </div>
            </div>

            {/* Live Counters */}
            <div className="grid grid-cols-4 gap-2 pt-2 text-left">
              <div className="p-3 rounded-xl bg-gray-50 dark:bg-discord-dark-card border border-gray-100 dark:border-discord-dark-accent">
                <div className="text-[10px] text-gray-400 uppercase font-bold">Deleted</div>
                <div className="text-lg font-black text-emerald-500">
                  {deletionProgress?.deleted || 0}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-gray-50 dark:bg-discord-dark-card border border-gray-100 dark:border-discord-dark-accent">
                <div className="text-[10px] text-gray-400 uppercase font-bold">Failed</div>
                <div className="text-lg font-black text-rose-500">
                  {deletionProgress?.failed || 0}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-gray-50 dark:bg-discord-dark-card border border-gray-100 dark:border-discord-dark-accent">
                <div className="text-[10px] text-gray-400 uppercase font-bold">Remaining</div>
                <div className="text-lg font-black text-gray-700 dark:text-gray-300">
                  {deletionProgress?.remaining || selectedMessageIds.size}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-gray-50 dark:bg-discord-dark-card border border-gray-100 dark:border-discord-dark-accent">
                <div className="text-[10px] text-gray-400 uppercase font-bold">Channel</div>
                <div className="text-xs font-mono font-bold text-discord-blurple truncate">
                  #{deletionProgress?.currentChannelName || 'batch'}
                </div>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={handleCancelDeletion}
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-rose-500/30 text-rose-500 hover:bg-rose-500/10 font-bold text-xs transition-colors"
              >
                <StopCircle className="w-4 h-4" />
                <span>Cancel Cleanup Safely</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
