import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api, setCsrfToken } from '../services/api';
import { BotStatus, DiscordGuild } from '../types';

export interface ToastItem {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
  duration?: number;
}

interface AppContextType {
  // Auth
  authenticated: boolean;
  adminUser: string | null;
  isDemo: boolean;
  csrfToken: string | null;
  login: (password: string) => Promise<boolean>;
  demoLogin: () => Promise<boolean>;
  logout: () => Promise<void>;

  // Bot
  botStatus: BotStatus | null;
  refreshBotStatus: () => Promise<void>;
  connectBotToken: (token: string) => Promise<void>;
  enableDemoMode: () => Promise<void>;
  disconnectBot: () => Promise<void>;

  // Guilds
  guilds: DiscordGuild[];
  selectedGuild: DiscordGuild | null;
  setSelectedGuild: (guild: DiscordGuild | null) => void;
  refreshGuilds: () => Promise<void>;

  // Timezone
  timezone: string;
  setTimezone: (tz: string) => void;

  // Theme
  theme: 'dark' | 'light';
  toggleTheme: () => void;

  // Navigation
  activeTab: string;
  setActiveTab: (tab: string) => void;
  selectedReportJobId: string | null;
  viewJobReport: (jobId: string) => void;

  // Toasts
  toasts: ToastItem[];
  addToast: (toast: Omit<ToastItem, 'id'>) => void;
  removeToast: (id: string) => void;

  // Global loading
  isLoading: boolean;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

// Detect browser timezone
const defaultBrowserTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [authenticated, setAuthenticated] = useState<boolean>(false);
  const [adminUser, setAdminUser] = useState<string | null>(null);
  const [isDemo, setIsDemo] = useState<boolean>(false);
  const [csrfToken, setCsrfTokenState] = useState<string | null>(null);

  const [botStatus, setBotStatus] = useState<BotStatus | null>(null);
  const [guilds, setGuilds] = useState<DiscordGuild[]>([]);
  const [selectedGuild, setSelectedGuild] = useState<DiscordGuild | null>(null);

  const [timezone, setTimezone] = useState<string>(() => {
    return localStorage.getItem('cleanup_timezone') || defaultBrowserTz;
  });

  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('cleanup_theme') as 'dark' | 'light') || 'dark';
  });

  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [selectedReportJobId, setSelectedReportJobId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Sync theme to document element
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('cleanup_theme', theme);
  }, [theme]);

  // Sync timezone
  useEffect(() => {
    localStorage.setItem('cleanup_timezone', timezone);
  }, [timezone]);

  // Check existing session on load
  useEffect(() => {
    checkSession();
  }, []);

  const checkSession = async () => {
    try {
      setIsLoading(true);
      const res = await api.getSession();
      if (res.authenticated && res.session) {
        setAuthenticated(true);
        setAdminUser(res.session.adminUser);
        setIsDemo(res.session.isDemo);
        setCsrfTokenState(res.session.csrfToken);
        setCsrfToken(res.session.csrfToken);

        await refreshBotStatus();
        await refreshGuilds();
      } else {
        setAuthenticated(false);
      }
    } catch {
      setAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  };

  const addToast = (t: Omit<ToastItem, 'id'>) => {
    const id = Math.random().toString(36).substring(2, 9);
    const item: ToastItem = { ...t, id };
    setToasts(prev => [...prev, item]);

    setTimeout(() => {
      removeToast(id);
    }, t.duration || 4500);
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  const refreshBotStatus = async () => {
    try {
      const status = await api.getBotStatus();
      setBotStatus(status);
    } catch (err: any) {
      console.error('Failed to get bot status', err);
    }
  };

  const refreshGuilds = async () => {
    try {
      const list = await api.getGuilds();
      setGuilds(list);
      if (list.length > 0 && !selectedGuild) {
        setSelectedGuild(list[0]);
      }
    } catch (err: any) {
      console.error('Failed to fetch guilds', err);
    }
  };

  const login = async (password: string): Promise<boolean> => {
    try {
      const res = await api.login(password);
      if (res.success) {
        setAuthenticated(true);
        setAdminUser(res.session.adminUser);
        setIsDemo(res.session.isDemo);
        setCsrfTokenState(res.session.csrfToken);
        setCsrfToken(res.session.csrfToken);
        addToast({ type: 'success', title: 'Logged In', message: 'Welcome to the Administrator Dashboard' });
        await refreshBotStatus();
        await refreshGuilds();
        return true;
      }
      return false;
    } catch (err: any) {
      addToast({ type: 'error', title: 'Login Failed', message: err.message });
      return false;
    }
  };

  const demoLogin = async (): Promise<boolean> => {
    try {
      const res = await api.demoLogin();
      if (res.success) {
        setAuthenticated(true);
        setAdminUser(res.session.adminUser);
        setIsDemo(true);
        setCsrfTokenState(res.session.csrfToken);
        setCsrfToken(res.session.csrfToken);
        addToast({ type: 'info', title: 'Demo Mode Active', message: 'Loaded sample Discord servers, channels, and users.' });
        await refreshBotStatus();
        await refreshGuilds();
        return true;
      }
      return false;
    } catch (err: any) {
      addToast({ type: 'error', title: 'Demo Access Failed', message: err.message });
      return false;
    }
  };

  const logout = async () => {
    try {
      await api.logout();
      setAuthenticated(false);
      setAdminUser(null);
      setIsDemo(false);
      setCsrfTokenState(null);
      setCsrfToken('');
      setBotStatus(null);
      setGuilds([]);
      setSelectedGuild(null);
      addToast({ type: 'info', title: 'Logged Out', message: 'Session successfully ended.' });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Logout Error', message: err.message });
    }
  };

  const connectBotToken = async (token: string) => {
    try {
      const res = await api.connectBot(token, false);
      if (res.success) {
        setIsDemo(false);
        setBotStatus(res.status);
        await refreshGuilds();
        addToast({ type: 'success', title: 'Bot Connected', message: `Connected as @${res.status.botUser?.username || 'Bot'}` });
      }
    } catch (err: any) {
      addToast({ type: 'error', title: 'Connection Failed', message: err.message });
      throw err;
    }
  };

  const enableDemoMode = async () => {
    try {
      const res = await api.connectBot('', true);
      if (res.success) {
        setIsDemo(true);
        setBotStatus(res.status);
        await refreshGuilds();
        addToast({ type: 'info', title: 'Demo Simulation Enabled', message: 'Switched to realistic mock Discord data' });
      }
    } catch (err: any) {
      addToast({ type: 'error', title: 'Demo Mode Error', message: err.message });
    }
  };

  const disconnectBot = async () => {
    try {
      await api.disconnectBot();
      setBotStatus(null);
      setGuilds([]);
      setSelectedGuild(null);
      addToast({ type: 'info', title: 'Bot Disconnected', message: 'Discord bot connection cleared' });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Disconnect Error', message: err.message });
    }
  };

  const viewJobReport = (jobId: string) => {
    setSelectedReportJobId(jobId);
    setActiveTab('report');
  };

  return (
    <AppContext.Provider
      value={{
        authenticated,
        adminUser,
        isDemo,
        csrfToken,
        login,
        demoLogin,
        logout,
        botStatus,
        refreshBotStatus,
        connectBotToken,
        enableDemoMode,
        disconnectBot,
        guilds,
        selectedGuild,
        setSelectedGuild,
        refreshGuilds,
        timezone,
        setTimezone,
        theme,
        toggleTheme,
        activeTab,
        setActiveTab,
        selectedReportJobId,
        viewJobReport,
        toasts,
        addToast,
        removeToast,
        isLoading
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = (): AppContextType => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
