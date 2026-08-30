import React from 'react';
import {
  DiscordChannel,
  GuildMember,
  DateFilterMode,
  TimeFilterMode
} from '../../types';
import {
  Filter,
  User,
  Hash,
  Volume2,
  Megaphone,
  Mic,
  MessageSquare,
  ChevronDown,
  X,
  Loader2,
  Calendar,
  Clock,
  Search,
  CheckCircle2
} from 'lucide-react';

interface FilterBuilderCardProps {
  selectedMember: GuildMember | null;
  targetUserId: string;
  userSearchQuery: string;
  setUserSearchQuery: (query: string) => void;
  searchedMembers: GuildMember[];
  isSearchingMembers: boolean;
  isUserDropdownOpen: boolean;
  setIsUserDropdownOpen: (open: boolean) => void;
  memberSearchWarning: string | null;
  onSelectMember: (member: GuildMember) => void;
  onClearMember: () => void;
  onManualUserIdChange: (id: string) => void;

  channels: DiscordChannel[];
  selectedChannelIds: string[];
  channelSearch: string;
  setChannelSearch: (search: string) => void;
  isChannelDropdownOpen: boolean;
  setIsChannelDropdownOpen: (open: boolean) => void;
  onToggleChannel: (channelId: string) => void;

  dateMode: DateFilterMode;
  setDateMode: (mode: DateFilterMode) => void;
  startDate: string;
  setStartDate: (date: string) => void;
  endDate: string;
  setEndDate: (date: string) => void;

  timeMode: TimeFilterMode;
  setTimeMode: (mode: TimeFilterMode) => void;
  startTime: string;
  setStartTime: (time: string) => void;
  endTime: string;
  setEndTime: (time: string) => void;

  isScanning: boolean;
  onScan: () => void;
}

export const FilterBuilderCard: React.FC<FilterBuilderCardProps> = ({
  selectedMember,
  targetUserId,
  userSearchQuery,
  setUserSearchQuery,
  searchedMembers,
  isSearchingMembers,
  isUserDropdownOpen,
  setIsUserDropdownOpen,
  memberSearchWarning,
  onSelectMember,
  onClearMember,
  onManualUserIdChange,
  channels,
  selectedChannelIds,
  channelSearch,
  setChannelSearch,
  isChannelDropdownOpen,
  setIsChannelDropdownOpen,
  onToggleChannel,
  dateMode,
  setDateMode,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  timeMode,
  setTimeMode,
  startTime,
  setStartTime,
  endTime,
  setEndTime,
  isScanning,
  onScan
}) => {
  const getChannelIcon = (type?: number) => {
    switch (type) {
      case 2:
        return <Volume2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />;
      case 13:
        return <Mic className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />;
      case 5:
        return <Megaphone className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />;
      case 15:
        return <MessageSquare className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />;
      default:
        return <Hash className="w-3.5 h-3.5 text-discord-blurple flex-shrink-0" />;
    }
  };

  const filteredDropdownChannels = channels.filter(c =>
    c.name.toLowerCase().includes(channelSearch.toLowerCase())
  );

  return (
    <div className="rounded-3xl border border-gray-200 dark:border-discord-dark-accent bg-white dark:bg-discord-dark-card p-6 shadow-sm space-y-6">
      <div className="border-b border-gray-100 dark:border-discord-dark-accent pb-4 flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
          <Filter className="w-4 h-4 text-discord-blurple" />
          Filter Criteria
        </span>
        <span className="text-xs font-medium text-discord-blurple">
          Targeted Snowflake User ID Matching
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Target Discord User */}
        <div className="space-y-2 lg:col-span-1">
          <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
            Target User
          </label>

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
                type="button"
                onClick={onClearMember}
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
                  placeholder="Search username or enter User ID..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-discord-dark-accent bg-gray-50 dark:bg-discord-dark-bg text-sm text-gray-900 dark:text-white focus:outline-none focus:border-discord-blurple"
                />
                {isSearchingMembers && (
                  <Loader2 className="w-4 h-4 text-discord-blurple animate-spin absolute right-3 top-3" />
                )}
              </div>

              {isUserDropdownOpen && (
                <div className="absolute left-0 right-0 mt-1 rounded-2xl border border-gray-200 dark:border-discord-dark-accent bg-white dark:bg-discord-dark-card p-2 shadow-2xl z-50 max-h-56 overflow-y-auto space-y-1">
                  {searchedMembers.length === 0 ? (
                    <div className="p-3 text-xs text-gray-400 text-center">
                      No members found. You can enter an exact 17–20 digit Discord Snowflake ID below.
                    </div>
                  ) : (
                    searchedMembers.map(m => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => onSelectMember(m)}
                        className="flex w-full items-center gap-3 p-2 rounded-xl text-left hover:bg-gray-100 dark:hover:bg-discord-dark-hover transition-colors"
                      >
                        <img src={m.avatarUrl} alt="" className="w-7 h-7 rounded-full flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-gray-900 dark:text-white truncate">
                            {m.displayName}
                          </div>
                          <div className="text-[10px] text-gray-400 font-mono truncate">
                            @{m.username} • ID: {m.id}
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}

              <div className="pt-1">
                <input
                  type="text"
                  value={targetUserId}
                  onChange={e => onManualUserIdChange(e.target.value)}
                  placeholder="Direct User ID (17–20 digits)"
                  className="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-gray-200 dark:border-discord-dark-accent bg-gray-50 dark:bg-discord-dark-bg text-gray-900 dark:text-white focus:outline-none focus:border-discord-blurple"
                />
              </div>

              {memberSearchWarning && (
                <p className="text-[11px] text-amber-500/90 leading-tight">
                  {memberSearchWarning}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Channels Scope */}
        <div className="space-y-2 lg:col-span-1">
          <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
            Channel Scope ({selectedChannelIds.includes('all') ? 'All Accessible' : `${selectedChannelIds.length} Selected`})
          </label>

          <div className="relative">
            <button
              type="button"
              onClick={() => setIsChannelDropdownOpen(!isChannelDropdownOpen)}
              className="flex w-full items-center justify-between px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-discord-dark-accent bg-gray-50 dark:bg-discord-dark-bg text-sm text-gray-900 dark:text-white hover:border-discord-blurple/50 transition-colors"
            >
              <div className="flex items-center gap-2 truncate">
                <Hash className="w-4 h-4 text-discord-blurple" />
                <span className="truncate">
                  {selectedChannelIds.includes('all')
                    ? `All Channels (${channels.length})`
                    : `${selectedChannelIds.length} channels selected`}
                </span>
              </div>
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </button>

            {isChannelDropdownOpen && (
              <div className="absolute left-0 right-0 mt-2 rounded-2xl border border-gray-200 dark:border-discord-dark-accent bg-white dark:bg-discord-dark-card p-3 shadow-2xl z-50 space-y-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={channelSearch}
                    onChange={e => setChannelSearch(e.target.value)}
                    placeholder="Filter channels..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-discord-dark-accent bg-gray-50 dark:bg-discord-dark-bg text-gray-900 dark:text-white focus:outline-none"
                  />
                </div>

                <div className="max-h-56 overflow-y-auto space-y-1">
                  <button
                    type="button"
                    onClick={() => onToggleChannel('all')}
                    className={`flex w-full items-center justify-between p-2 rounded-xl text-xs font-bold transition-colors ${
                      selectedChannelIds.includes('all')
                        ? 'bg-discord-blurple text-white'
                        : 'hover:bg-gray-100 dark:hover:bg-discord-dark-hover text-gray-800 dark:text-discord-dark-text'
                    }`}
                  >
                    <span>All Channels ({channels.length})</span>
                    {selectedChannelIds.includes('all') && <CheckCircle2 className="w-4 h-4" />}
                  </button>

                  {filteredDropdownChannels.map(c => {
                    const isSelected = selectedChannelIds.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => onToggleChannel(c.id)}
                        className={`flex w-full items-center justify-between p-2 rounded-xl text-xs transition-colors ${
                          isSelected && !selectedChannelIds.includes('all')
                            ? 'bg-discord-blurple/15 text-discord-blurple font-bold'
                            : 'hover:bg-gray-100 dark:hover:bg-discord-dark-hover text-gray-700 dark:text-discord-dark-text'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          {getChannelIcon(c.type)}
                          <span className="truncate">{c.name}</span>
                          {c.parentName && (
                            <span className="text-[10px] text-gray-400 font-normal">({c.parentName})</span>
                          )}
                        </div>
                        {isSelected && !selectedChannelIds.includes('all') && (
                          <CheckCircle2 className="w-3.5 h-3.5 text-discord-blurple" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Date & Time Filters */}
        <div className="space-y-4 lg:col-span-1">
          {/* Date Filter */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-discord-blurple" />
              Date Filter
            </label>
            <select
              value={dateMode}
              onChange={e => setDateMode(e.target.value as DateFilterMode)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-gray-200 dark:border-discord-dark-accent bg-gray-50 dark:bg-discord-dark-bg text-gray-900 dark:text-white focus:outline-none focus:border-discord-blurple"
            >
              <option value="ALL_TIME">All Time (Full Message History)</option>
              <option value="BETWEEN_DATES">Date Range (Between Start &amp; End)</option>
              <option value="SPECIFIC_DATE">Specific Date</option>
              <option value="BEFORE_DATE">Before Date</option>
              <option value="AFTER_DATE">After Date</option>
              <option value="TODAY">Today</option>
              <option value="YESTERDAY">Yesterday</option>
              <option value="LAST_7_DAYS">Last 7 Days</option>
              <option value="LAST_30_DAYS">Last 30 Days</option>
            </select>

            {['BETWEEN_DATES', 'CUSTOM_RANGE'].includes(dateMode) && (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="px-2 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-discord-dark-accent bg-gray-50 dark:bg-discord-dark-bg text-gray-900 dark:text-white"
                />
                <input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  className="px-2 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-discord-dark-accent bg-gray-50 dark:bg-discord-dark-bg text-gray-900 dark:text-white"
                />
              </div>
            )}

            {['SPECIFIC_DATE', 'BEFORE_DATE', 'AFTER_DATE'].includes(dateMode) && (
              <div className="pt-1">
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="w-full px-2 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-discord-dark-accent bg-gray-50 dark:bg-discord-dark-bg text-gray-900 dark:text-white"
                />
              </div>
            )}
          </div>

          {/* Time Filter */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-indigo-400" />
              Time Filter
            </label>
            <select
              value={timeMode}
              onChange={e => setTimeMode(e.target.value as TimeFilterMode)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-gray-200 dark:border-discord-dark-accent bg-gray-50 dark:bg-discord-dark-bg text-gray-900 dark:text-white focus:outline-none focus:border-discord-blurple"
            >
              <option value="ANY_TIME">Any Time (24 Hours)</option>
              <option value="AFTER_TIME">After Time</option>
              <option value="BEFORE_TIME">Before Time</option>
              <option value="BETWEEN_TIMES">Time Window</option>
            </select>

            {['AFTER_TIME', 'BEFORE_TIME'].includes(timeMode) && (
              <div className="pt-1">
                <input
                  type="time"
                  value={startTime}
                  onChange={e => setStartTime(e.target.value)}
                  className="w-full px-2 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-discord-dark-accent bg-gray-50 dark:bg-discord-dark-bg text-gray-900 dark:text-white font-mono"
                />
              </div>
            )}

            {timeMode === 'BETWEEN_TIMES' && (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <input
                  type="time"
                  value={startTime}
                  onChange={e => setStartTime(e.target.value)}
                  className="px-2 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-discord-dark-accent bg-gray-50 dark:bg-discord-dark-bg text-gray-900 dark:text-white font-mono"
                />
                <input
                  type="time"
                  value={endTime}
                  onChange={e => setEndTime(e.target.value)}
                  className="px-2 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-discord-dark-accent bg-gray-50 dark:bg-discord-dark-bg text-gray-900 dark:text-white font-mono"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="pt-4 border-t border-gray-100 dark:border-discord-dark-accent flex justify-end">
        <button
          type="button"
          onClick={onScan}
          disabled={isScanning || !targetUserId}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-discord-blurple hover:bg-discord-blurple-hover disabled:opacity-50 text-white font-bold text-xs shadow-md shadow-discord-blurple/25 transition-all cursor-pointer"
        >
          {isScanning ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Scanning Messages...</span>
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
  );
};
