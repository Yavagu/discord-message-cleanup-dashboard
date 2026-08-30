import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import {
  DiscordChannel,
  GuildMember,
  JobProgressUpdate,
  ScannedMessage,
  DateFilterMode,
  TimeFilterMode
} from '../types';
import { Eraser, Globe } from 'lucide-react';
import { FilterBuilderCard } from './cleanup/FilterBuilderCard';
import { MessagePreviewTable } from './cleanup/MessagePreviewTable';
import { MessageDetailModal } from './cleanup/MessageDetailModal';
import { DeleteConfirmationModal } from './cleanup/DeleteConfirmationModal';
import { DeletionProgressModal } from './cleanup/DeletionProgressModal';

export const CleanupView: React.FC = () => {
  const { selectedGuild, timezone, addToast, viewJobReport, settings } = useApp();

  // Channels & Members State
  const [channels, setChannels] = useState<DiscordChannel[]>([]);
  const [selectedChannelIds, setSelectedChannelIds] = useState<string[]>(['all']);
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
  const [dateMode, setDateMode] = useState<DateFilterMode>('BETWEEN_DATES');
  const [startDate, setStartDate] = useState('2026-08-01');
  const [endDate, setEndDate] = useState('2026-08-15');

  // Time Filter State
  const [timeMode, setTimeMode] = useState<TimeFilterMode>('AFTER_TIME');
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

  // Modals State
  const [previewModalMessage, setPreviewModalMessage] = useState<ScannedMessage | null>(null);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deletionProgress, setDeletionProgress] = useState<JobProgressUpdate | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Cleanup SSE on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

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
      if (res.members.length > 0 && !selectedMember) {
        const defaultMember = res.members.find(m => m.id === '987654321000000001') || res.members[0];
        handleSelectMember(defaultMember);
      }
    } catch (err) {
      console.error('Failed to load initial members', err);
    }
  };

  // Debounced search for members
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

  const handleClearMember = () => {
    setSelectedMember(null);
    setTargetUserId('');
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

  // Execute Scan
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

  // Open confirmation modal or execute directly if requireDoubleConfirm is disabled
  const handleOpenConfirmModal = () => {
    if (!settings || settings.requireDoubleConfirm) {
      setIsConfirmModalOpen(true);
    } else {
      handleConfirmDelete();
    }
  };

  // Start Deletion Execution
  const handleConfirmDelete = async () => {
    if (!activeJobId || selectedMessageIds.size === 0) return;

    setIsConfirmModalOpen(false);
    setIsDeleting(true);

    try {
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
            viewJobReport(activeJobId);
          }
        } catch (e) {
          console.error('Error parsing SSE progress', e);
        }
      };

      es.onerror = () => {
        // SSE error / close
      };

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

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-16">
      {/* View Header */}
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

        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-gray-200 dark:border-discord-dark-accent bg-white dark:bg-discord-dark-card text-xs font-mono text-gray-700 dark:text-gray-300 shadow-sm">
          <Globe className="w-3.5 h-3.5 text-discord-blurple" />
          <span>Timezone: <strong className="text-discord-blurple">{timezone}</strong></span>
        </div>
      </div>

      {/* 1. Filter Builder Card */}
      <FilterBuilderCard
        selectedMember={selectedMember}
        targetUserId={targetUserId}
        userSearchQuery={userSearchQuery}
        setUserSearchQuery={setUserSearchQuery}
        searchedMembers={searchedMembers}
        isSearchingMembers={isSearchingMembers}
        isUserDropdownOpen={isUserDropdownOpen}
        setIsUserDropdownOpen={setIsUserDropdownOpen}
        memberSearchWarning={memberSearchWarning}
        onSelectMember={handleSelectMember}
        onClearMember={handleClearMember}
        onManualUserIdChange={handleManualUserIdChange}
        channels={channels}
        selectedChannelIds={selectedChannelIds}
        channelSearch={channelSearch}
        setChannelSearch={setChannelSearch}
        isChannelDropdownOpen={isChannelDropdownOpen}
        setIsChannelDropdownOpen={setIsChannelDropdownOpen}
        onToggleChannel={handleToggleChannel}
        dateMode={dateMode}
        setDateMode={setDateMode}
        startDate={startDate}
        setStartDate={setStartDate}
        endDate={endDate}
        setEndDate={setEndDate}
        timeMode={timeMode}
        setTimeMode={setTimeMode}
        startTime={startTime}
        setStartTime={setStartTime}
        endTime={endTime}
        setEndTime={setEndTime}
        isScanning={isScanning}
        onScan={handleScanMessages}
      />

      {/* 2. Message Preview Table */}
      {scannedMessages.length > 0 && (
        <MessagePreviewTable
          scannedMessages={scannedMessages}
          selectedMessageIds={selectedMessageIds}
          scanSummary={scanSummary}
          onToggleMessage={handleToggleMessage}
          onSelectAll={handleSelectAll}
          onDeselectAll={handleDeselectAll}
          onInspectMessage={msg => setPreviewModalMessage(msg)}
          onOpenConfirmModal={handleOpenConfirmModal}
        />
      )}

      {/* Modals */}
      <MessageDetailModal
        message={previewModalMessage}
        onClose={() => setPreviewModalMessage(null)}
      />

      <DeleteConfirmationModal
        isOpen={isConfirmModalOpen}
        onClose={() => setIsConfirmModalOpen(false)}
        onConfirm={handleConfirmDelete}
        selectedMember={selectedMember}
        targetUserId={targetUserId}
        selectedMessageCount={selectedMessageIds.size}
        scannedMessages={scannedMessages}
        selectedMessageIds={selectedMessageIds}
        guildName={selectedGuild?.name || 'Discord Server'}
      />

      <DeletionProgressModal
        isOpen={isDeleting}
        progress={deletionProgress}
        onCancel={handleCancelDeletion}
      />
    </div>
  );
};
