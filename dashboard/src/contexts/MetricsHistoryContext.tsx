import { createContext, useContext, useState, ReactNode } from 'react';

interface MetricsHistory {
  cpu: Array<{ time: string; value: number }>;
  memory: Array<{ time: string; used: number; available: number }>;
  network: Array<{ time: string; download: number; upload: number }>;
}

interface MetricsHistoryContextType {
  getHistory: (deviceUuid: string) => MetricsHistory;
  updateHistory: (deviceUuid: string, history: Partial<MetricsHistory>) => void;
  clearHistory: (deviceUuid: string) => void;
}

const MetricsHistoryContext = createContext<MetricsHistoryContextType | undefined>(undefined);

const MAX_POINTS = 60; // Keep last 60 points (30 minutes)

export function MetricsHistoryProvider({ children }: { children: ReactNode }) {
  // Store metrics history per device UUID
  const [historyCache, setHistoryCache] = useState<Map<string, MetricsHistory>>(new Map());

  const getHistory = (deviceUuid: string): MetricsHistory => {
    return historyCache.get(deviceUuid) || { cpu: [], memory: [], network: [] };
  };

  const updateHistory = (deviceUuid: string, history: Partial<MetricsHistory>) => {
    setHistoryCache(prev => {
      const newCache = new Map(prev);
      const existing = newCache.get(deviceUuid) || { cpu: [], memory: [], network: [] };
      
      // Merge new history with existing, keeping last MAX_POINTS
      const updated: MetricsHistory = {
        cpu: history.cpu ? [...existing.cpu, ...history.cpu].slice(-MAX_POINTS) : existing.cpu,
        memory: history.memory ? [...existing.memory, ...history.memory].slice(-MAX_POINTS) : existing.memory,
        network: history.network ? [...existing.network, ...history.network].slice(-MAX_POINTS) : existing.network,
      };
      
      newCache.set(deviceUuid, updated);
      return newCache;
    });
  };

  const clearHistory = (deviceUuid: string) => {
    setHistoryCache(prev => {
      const newCache = new Map(prev);
      newCache.delete(deviceUuid);
      return newCache;
    });
  };

  return (
    <MetricsHistoryContext.Provider value={{ getHistory, updateHistory, clearHistory }}>
      {children}
    </MetricsHistoryContext.Provider>
  );
}

export function useMetricsHistory() {
  const context = useContext(MetricsHistoryContext);
  if (!context) {
    throw new Error('useMetricsHistory must be used within MetricsHistoryProvider');
  }
  return context;
}
