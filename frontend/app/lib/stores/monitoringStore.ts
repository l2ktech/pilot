/**
 * System Monitoring Store
 * Manages system metrics (CPU, memory, disk, PM2 processes) state and history
 */

import { create } from 'zustand';
import { logger } from '../logger';

// Types for system monitoring data
export interface CPUMetrics {
  percent: number;
  per_core: number[];
  temperature: number | null;
  count: number;
}

export interface MemoryMetrics {
  percent: number;
  used_mb: number;
  total_mb: number;
  available_mb: number;
}

export interface DiskMetrics {
  percent: number;
  used_gb: number;
  total_gb: number;
  free_gb: number;
}

export interface PM2Process {
  name: string;
  pid: number;
  status: string;
  cpu: number;
  memory: number;
  uptime: number;
  restarts: number;
}

export interface SystemMetrics {
  timestamp: string;
  cpu: CPUMetrics;
  memory: MemoryMetrics;
  disk: DiskMetrics;
  pm2_processes: PM2Process[];
  uptime_seconds: number;
}

export interface MetricsHistory {
  timestamps: string[];
  cpuPercent: number[];
  memoryPercent: number[];
  temperature: (number | null)[];
}

export interface MonitoringStore {
  // Current metrics
  currentMetrics: SystemMetrics | null;

  // Historical data (last 5 minutes)
  history: MetricsHistory;
  maxHistoryLength: number;

  // UI state
  isLoading: boolean;
  error: string | null;

  // Actions
  setCurrentMetrics: (metrics: SystemMetrics) => void;
  addMetricsToHistory: (metrics: SystemMetrics) => void;
  clearHistory: () => void;
  setError: (error: string | null) => void;

  // API actions
  restartProcess: (processName: string) => Promise<void>;
}

export const useMonitoringStore = create<MonitoringStore>((set, get) => ({
  // Initial state
  currentMetrics: null,

  history: {
    timestamps: [],
    cpuPercent: [],
    memoryPercent: [],
    temperature: [],
  },

  maxHistoryLength: 300, // 5 minutes at 1 Hz

  isLoading: false,
  error: null,

  // Actions
  setCurrentMetrics: (metrics) => {
    set({ currentMetrics: metrics, error: null });
    // Also add to history
    get().addMetricsToHistory(metrics);
  },

  addMetricsToHistory: (metrics) => {
    set((state) => {
      const newHistory = { ...state.history };

      // Add new data points
      newHistory.timestamps.push(metrics.timestamp);
      newHistory.cpuPercent.push(metrics.cpu.percent);
      newHistory.memoryPercent.push(metrics.memory.percent);
      newHistory.temperature.push(metrics.cpu.temperature);

      // Trim to max length
      const maxLength = state.maxHistoryLength;
      if (newHistory.timestamps.length > maxLength) {
        newHistory.timestamps = newHistory.timestamps.slice(-maxLength);
        newHistory.cpuPercent = newHistory.cpuPercent.slice(-maxLength);
        newHistory.memoryPercent = newHistory.memoryPercent.slice(-maxLength);
        newHistory.temperature = newHistory.temperature.slice(-maxLength);
      }

      return { history: newHistory };
    });
  },

  clearHistory: () => {
    set({
      history: {
        timestamps: [],
        cpuPercent: [],
        memoryPercent: [],
        temperature: [],
      }
    });
  },

  setError: (error) => set({ error }),

  restartProcess: async (processName: string) => {
    try {
      set({ isLoading: true, error: null });

      const { getApiBaseUrl } = await import('../apiConfig');
      const response = await fetch(`${getApiBaseUrl()}/api/system/restart/${processName}`, {
        method: 'POST',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to restart process');
      }

      const data = await response.json();

      if (data.success) {
        logger.info(`Process ${processName} restarted successfully`, 'MonitoringStore');
      } else {
        throw new Error(data.message || 'Failed to restart process');
      }

      set({ isLoading: false });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Error restarting process', 'MonitoringStore', { processName, error: errorMsg });
      set({ error: errorMsg, isLoading: false });
      throw error; // Re-throw so UI can handle it
    }
  },
}));
