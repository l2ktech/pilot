/**
 * Motion Recording Store
 * Manages motion recording state and data for commanded vs actual joint angle comparison
 */

import { create } from 'zustand';
import { getApiBaseUrl } from '../apiConfig';
import { logger } from '../logger';

// Types for motion recording data
export interface CommandedSample {
  t: number;           // seconds since recording start
  joints: number[];    // [J1-J6] degrees
  command_type: string; // "MOVEJOINT" or "TRAJECTORY"
}

export interface CommanderStateSample {
  timestamp_ms: number;    // ms since recording start
  position_out: number[];  // [J1-J6] degrees - what commander sends to motors
  position_in: number[];   // [J1-J6] degrees - feedback from robot
}

export interface MotionRecordingMetadata {
  name: string;
  timestamp: string;
  sample_rate_hz: number;
  duration_s: number;
  num_samples: number;
}

export interface MotionRecording {
  metadata: MotionRecordingMetadata;
  commanded: CommandedSample[];
  commander_state: CommanderStateSample[];
}

export interface MotionRecordingListItem {
  filename: string;
  name: string;
  timestamp: string;
  duration_s: number;
  num_samples: number;
}

export interface MotionRecordingStore {
  // Recording state
  isRecording: boolean;

  // Recordings list
  recordings: MotionRecordingListItem[];
  isLoadingRecordings: boolean;

  // Selected recording
  selectedRecording: MotionRecording | null;
  selectedFilename: string | null;
  isLoadingRecording: boolean;

  // Actions
  startRecording: (name?: string) => Promise<boolean>;
  stopRecording: () => Promise<void>;
  getRecordingStatus: () => Promise<boolean>;

  fetchRecordings: () => Promise<void>;
  fetchRecording: (filename: string) => Promise<void>;
  deleteRecording: (filename: string) => Promise<void>;
  selectRecording: (filename: string | null) => void;
  clearSelection: () => void;
}

export const useMotionRecordingStore = create<MotionRecordingStore>((set, get) => ({
  // Initial state
  isRecording: false,

  recordings: [],
  isLoadingRecordings: false,

  selectedRecording: null,
  selectedFilename: null,
  isLoadingRecording: false,

  // Actions
  startRecording: async (name?: string) => {
    try {
      const url = new URL(`${getApiBaseUrl()}/api/motion-recording/start`);
      if (name) {
        url.searchParams.set('name', name);
      }

      const response = await fetch(url.toString(), {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to start motion recording');
      }

      const data = await response.json();

      if (data.success) {
        set({ isRecording: true });
        logger.info('Motion recording started', 'MotionRecordingStore', { name: data.name });
        return true;
      } else {
        logger.error('Failed to start motion recording', 'MotionRecordingStore', { message: data.message });
        return false;
      }
    } catch (error) {
      logger.error('Error starting motion recording', 'MotionRecordingStore', error);
      return false;
    }
  },

  stopRecording: async () => {
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/motion-recording/stop`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to stop motion recording');
      }

      const data = await response.json();

      if (data.success) {
        set({ isRecording: false });
        logger.info('Motion recording stopped', 'MotionRecordingStore', {
          filename: data.filename,
          samples: data.num_samples
        });
        // Refresh recordings list
        get().fetchRecordings();
      } else {
        logger.error('Failed to stop motion recording', 'MotionRecordingStore', { message: data.message });
      }
    } catch (error) {
      logger.error('Error stopping motion recording', 'MotionRecordingStore', error);
    }
  },

  getRecordingStatus: async () => {
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/motion-recording/status`);

      if (!response.ok) {
        throw new Error('Failed to get motion recording status');
      }

      const data = await response.json();
      set({ isRecording: data.is_recording });
      return data.is_recording;
    } catch (error) {
      logger.error('Error getting motion recording status', 'MotionRecordingStore', error);
      return false;
    }
  },

  fetchRecordings: async () => {
    set({ isLoadingRecordings: true });

    try {
      const response = await fetch(`${getApiBaseUrl()}/api/motion-recordings`);

      if (!response.ok) {
        throw new Error('Failed to fetch motion recordings');
      }

      const data: MotionRecordingListItem[] = await response.json();
      set({ recordings: data, isLoadingRecordings: false });
    } catch (error) {
      logger.error('Error fetching motion recordings', 'MotionRecordingStore', error);
      set({ isLoadingRecordings: false });
    }
  },

  fetchRecording: async (filename: string) => {
    set({ isLoadingRecording: true });

    try {
      const response = await fetch(`${getApiBaseUrl()}/api/motion-recordings/${filename}`);

      if (!response.ok) {
        throw new Error('Failed to fetch motion recording');
      }

      const data: MotionRecording = await response.json();
      set({
        selectedRecording: data,
        selectedFilename: filename,
        isLoadingRecording: false
      });
    } catch (error) {
      logger.error('Error fetching motion recording', 'MotionRecordingStore', error);
      set({ isLoadingRecording: false });
    }
  },

  deleteRecording: async (filename: string) => {
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/motion-recordings/${filename}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete motion recording');
      }

      // Clear selected recording if it was deleted
      const { selectedFilename } = get();
      if (selectedFilename === filename) {
        set({ selectedRecording: null, selectedFilename: null });
      }

      // Refresh recordings list
      get().fetchRecordings();
    } catch (error) {
      logger.error('Error deleting motion recording', 'MotionRecordingStore', error);
    }
  },

  selectRecording: (filename: string | null) => {
    if (filename) {
      get().fetchRecording(filename);
    } else {
      set({ selectedRecording: null, selectedFilename: null });
    }
  },

  clearSelection: () => {
    set({ selectedRecording: null, selectedFilename: null });
  },
}));
