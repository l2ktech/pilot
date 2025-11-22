/**
 * Robot Configuration Store
 * Settings that don't change frequently during operation
 */

import { create } from 'zustand';
import type { IkAxisMask } from '../types';
import { useTimelineStore } from './timelineStore';

export interface RobotConfigStore {
  // TCP (Tool Center Point) offset from J6 reference frame
  // Position offset in millimeters, orientation offset in degrees
  // User-adjustable to match different tools
  tcpOffset: { x: number; y: number; z: number; rx: number; ry: number; rz: number };

  // TCP Gizmo Post-Rotation (visual correction for TCP orientation display)
  // Applied AFTER calculating TCP orientation from kinematics + TCP offset
  tcpPostRotation: { axis: 'x' | 'y' | 'z'; angleDegrees: number; enabled: boolean };

  // IK axis mask - selectively enable/disable axes during IK solving
  // Default: Full 6DoF (all axes enabled)
  ikAxisMask: IkAxisMask;

  // Robot appearance settings
  hardwareRobotColor: string;        // Hardware (ghost) robot color
  hardwareRobotTransparency: number; // Hardware robot transparency (0-1)
  commanderRobotColor: string;       // Commander (target) robot color
  commanderRobotTransparency: number; // Commander robot transparency (0-1)

  // Actions
  setTcpOffset: (axis: 'x' | 'y' | 'z' | 'rx' | 'ry' | 'rz', value: number) => void;
  setTcpPostRotation: (updates: Partial<{ axis: 'x' | 'y' | 'z'; angleDegrees: number; enabled: boolean }>) => void;
  setIkAxisMask: (updates: Partial<IkAxisMask>) => void;
  setHardwareRobotColor: (color: string) => void;
  setHardwareRobotTransparency: (transparency: number) => void;
  setCommanderRobotColor: (color: string) => void;
  setCommanderRobotTransparency: (transparency: number) => void;
}

export const useRobotConfigStore = create<RobotConfigStore>((set) => ({
  // Initial state
  tcpOffset: { x: 47, y: 0, z: -62, rx: 0, ry: 0, rz: 0 },
  tcpPostRotation: { axis: 'z', angleDegrees: 0, enabled: true },
  ikAxisMask: { X: true, Y: true, Z: true, RX: true, RY: true, RZ: true },
  hardwareRobotColor: '#808080',
  hardwareRobotTransparency: 0.35,
  commanderRobotColor: '#4ECDC4',
  commanderRobotTransparency: 1.0,

  // Actions
  setTcpOffset: (axis, value) => {
    set((state) => ({
      tcpOffset: {
        ...state.tcpOffset,
        [axis]: value
      }
    }));

    // Invalidate trajectory cache since TCP offset affects IK results
    useTimelineStore.getState().invalidateTrajectoryCache();
  },

  setTcpPostRotation: (updates) => {
    set((state) => ({
      tcpPostRotation: {
        ...state.tcpPostRotation,
        ...updates
      }
    }));
  },

  setIkAxisMask: (updates) => {
    set((state) => ({
      ikAxisMask: {
        ...state.ikAxisMask,
        ...updates
      }
    }));

    // Invalidate trajectory cache since IK axis mask affects IK results
    useTimelineStore.getState().invalidateTrajectoryCache();
  },

  setHardwareRobotColor: (color) => set({ hardwareRobotColor: color }),
  setHardwareRobotTransparency: (transparency) => set({ hardwareRobotTransparency: transparency }),
  setCommanderRobotColor: (color) => set({ commanderRobotColor: color }),
  setCommanderRobotTransparency: (transparency) => set({ commanderRobotTransparency: transparency })
}));
