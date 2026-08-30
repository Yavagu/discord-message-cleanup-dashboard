import React from 'react';
import { useApp } from './context/AppContext';
import { LoginGate } from './components/LoginGate';
import { Sidebar } from './components/Sidebar';
import { Navbar } from './components/Navbar';
import { ToastContainer } from './components/ToastContainer';
import { DashboardView } from './views/DashboardView';
import { CleanupView } from './views/CleanupView';
import { HistoryView } from './views/HistoryView';
import { BotConfigView } from './views/BotConfigView';
import { ReportView } from './views/ReportView';
import { SettingsView } from './views/SettingsView';

export const AppContent: React.FC = () => {
  const { authenticated, activeTab, isLoading } = useApp();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-discord-dark-bg">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-3 border-discord-blurple border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">
            Initializing Discord Sentinel...
          </p>
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <>
        <LoginGate />
        <ToastContainer />
      </>
    );
  }

  const renderActiveView = () => {
    switch (activeTab) {
      case 'dashboard':
        return <DashboardView />;
      case 'cleanup':
        return <CleanupView />;
      case 'history':
        return <HistoryView />;
      case 'bot-config':
        return <BotConfigView />;
      case 'report':
        return <ReportView />;
      case 'settings':
        return <SettingsView />;
      default:
        return <DashboardView />;
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-gray-100 dark:bg-discord-dark-bg text-gray-900 dark:text-discord-dark-text antialiased">
      {/* Sidebar Navigation */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <Navbar />

        <main className="flex-1 overflow-y-auto p-6 md:p-8">
          <div className="mx-auto max-w-7xl">
            {renderActiveView()}
          </div>
        </main>
      </div>

      <ToastContainer />
    </div>
  );
};
