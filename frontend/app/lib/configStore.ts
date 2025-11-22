import { create } from 'zustand';
import { getApiBaseUrl } from './apiConfig';
import { logger } from './logger';

// Config types matching config.yaml structure
interface RobotConfig {
  com_port: string;
  baud_rate: number;
  timeout: number;
  auto_home_on_startup: boolean;
  estop_enabled: boolean;
}

interface ServerConfig {
  command_port: number;
  ack_port: number;
  loop_interval: number;
}

interface APIConfig {
  host: string;
  port: number;
  cors_origins: string[];
  ws_max_rate_hz: number;
  ws_default_rate_hz: number;
}

interface LoggingConfig {
  level: string;
  buffer_size: number;
  stream_to_websocket: boolean;
  file_output: string | null;
  initial_log_count: number;
  commander?: {
    level: string;
  };
  api?: {
    level: string;
  };
  frontend?: {
    level: string;
  };
}

interface TCPOffset {
  x: number;
  y: number;
  z: number;
  rx: number;  // Orientation offset around X-axis (degrees)
  ry: number;  // Orientation offset around Y-axis (degrees)
  rz: number;  // Orientation offset around Z-axis (degrees)
}

interface RobotAppearance {
  color: string;
  transparency: number;
}

interface SavedPosition {
  name: string;
  joints: number[];
}

interface UIConfig {
  default_speed_percentage: number;
  default_acceleration_percentage: number;
  show_safety_warnings: boolean;
  step_angle: number;
  cartesian_position_step_mm: number;
  default_timeline_duration: number;
  default_fps: number;
  tcp_offset: TCPOffset;
  hardware_robot: RobotAppearance;
  commander_robot: RobotAppearance;
  saved_positions: SavedPosition[];
}

interface WebSocketConfig {
  default_rate_hz: number;
  topics: string[];
  reconnect: {
    max_attempts: number;
    base_delay_ms: number;
  };
}

interface FrontendConfig {
  websocket: WebSocketConfig;
  api_url: string;
}

export interface Config {
  robot: RobotConfig;
  server: ServerConfig;
  api: APIConfig;
  logging: LoggingConfig;
  ui: UIConfig;
  frontend: FrontendConfig;
}

interface ConfigStore {
  config: Config | null;
  isLoading: boolean;
  error: string | null;
  fetchConfig: () => Promise<void>;
  saveConfig: (updates: Partial<Config>) => Promise<void>;
  setConfig: (config: Config) => void;
}


export const useConfigStore = create<ConfigStore>((set, get) => ({
  config: null,
  isLoading: false,
  error: null,

  fetchConfig: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/config`);
      if (!response.ok) {
        throw new Error(`Failed to fetch config: ${response.statusText}`);
      }
      const config = await response.json();
      set({ config, isLoading: false });
    } catch (error) {
      logger.error('Error fetching config', 'ConfigStore', error);
      set({
        error: error instanceof Error ? error.message : 'Unknown error',
        isLoading: false,
      });
    }
  },

  saveConfig: async (updates: Partial<Config>) => {
    set({ isLoading: true, error: null });
    try {
      const currentConfig = get().config;
      const response = await fetch(`${getApiBaseUrl()}/api/config`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });
      if (!response.ok) {
        throw new Error(`Failed to save config: ${response.statusText}`);
      }
      const responseData = await response.json();
      const backendConfig = responseData.config; // Extract config from {message, config} response
      set({ config: backendConfig, isLoading: false });
    } catch (error) {
      logger.error('Error saving config', 'ConfigStore', error);
      set({
        error: error instanceof Error ? error.message : 'Unknown error',
        isLoading: false,
      });
    }
  },

  setConfig: (config: Config) => {
    set({ config });
  },
}));
