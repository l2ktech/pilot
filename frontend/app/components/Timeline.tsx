'use client';

import { useEffect, useRef, useState } from 'react';
import { useTimelineStore } from '@/app/lib/stores/timelineStore';
import { useCommandStore } from '@/app/lib/stores/commandStore';
import { useInputStore } from '@/app/lib/stores/inputStore';
import { useRobotConfigStore } from '@/app/lib/stores/robotConfigStore';
import { useKinematicsStore } from '@/app/lib/stores/kinematicsStore';
import { JOINT_NAMES, JOINT_COLORS, JOINT_ANGLE_OFFSETS } from '@/app/lib/constants';
import { usePrePlaybackPosition } from '@/app/hooks/usePrePlaybackPosition';
import { preCalculateCartesianTrajectory } from '@/app/hooks/usePlayback';
import { inverseKinematicsDetailed } from '@/app/lib/kinematics';
import { calculateTcpPoseFromUrdf } from '@/app/lib/tcpCalculations';
import { threeJsToRobot } from '@/app/lib/coordinateTransform';
import { applyJointAnglesToUrdf } from '@/app/lib/urdfHelpers';
import KeyframeEditDialog from './KeyframeEditDialog';
import { logger } from '@/app/lib/logger';

// Add CSS for outline nodes and timeline rows
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    .outline-node {
      padding-left: 20px;
      font-size: 12px;
      display: flex;
      align-items: center;
      width: 100%;
      font-family: Roboto, 'Helvetica Neue', sans-serif;
      color: white;
      user-select: none;
    }
    .outline-node:hover {
      background: #201616;
    }

    /* Timeline row styling - master row has distinct background */
    .animation-timeline-js-rows > div:first-child {
      background: rgba(255, 193, 7, 0.08) !important; /* Subtle amber tint for State row */
    }
    .animation-timeline-js-rows > div:not(:first-child) {
      background: rgba(136, 136, 136, 0.03) !important; /* Very subtle gray for sub-rows */
    }

    /* Timeline bar colors - connecting lines between keyframes */
    /* Master row bars: bright orange */
    .animation-timeline-js-rows > div:first-child path[stroke] {
      stroke: #ffb300 !important;
      stroke-width: 3 !important;
    }
    /* Sub-row bars: dim gray */
    .animation-timeline-js-rows > div:not(:first-child) path[stroke] {
      stroke: #555555 !important;
      stroke-width: 1 !important;
    }
  `;
  if (!document.head.querySelector('#timeline-outline-styles')) {
    style.id = 'timeline-outline-styles';
    document.head.appendChild(style);
  }
}

export default function Timeline() {
  const containerRef = useRef<HTMLDivElement>(null);
  const outlineRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<any>(null);
  const [isClient, setIsClient] = useState(false);

  const motionMode = useTimelineStore((state) => state.timeline.mode);
  const keyframes = useTimelineStore((state) => state.timeline.keyframes);
  const currentTime = useTimelineStore((state) => state.playbackState.currentTime);
  const setCurrentTime = useTimelineStore((state) => state.setCurrentTime);
  const updateKeyframe = useTimelineStore((state) => state.updateKeyframe);
  const removeKeyframe = useTimelineStore((state) => state.removeKeyframe);
  const duration = useTimelineStore((state) => state.timeline.duration);
  const exportTimeline = useTimelineStore((state) => state.exportTimeline);
  const loadTimeline = useTimelineStore((state) => state.loadTimeline);
  const [selectedKeyframes, setSelectedKeyframes] = useState<Set<string>>(new Set());

  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingKeyframeId, setEditingKeyframeId] = useState<string | null>(null);

  // Find keyframe at current scrubber position (within 0.001s tolerance)
  const keyframeAtCurrentTime = keyframes.find(
    kf => Math.abs(kf.time - currentTime) < 0.001
  );

  // Get the single selected keyframe (if exactly one is selected)
  const selectedKeyframe = selectedKeyframes.size === 1
    ? keyframes.find(kf => kf.id === Array.from(selectedKeyframes)[0])
    : null;

  const isSelectedKeyframeCartesian = selectedKeyframe?.motionType === 'cartesian';

  // Function to register event handlers on timeline instance
  const registerEventHandlers = (timeline: any) => {

    // Listen for time changes (playhead scrubbing)
    if (timeline.onTimeChanged) {
      timeline.onTimeChanged((args: any) => {
        setCurrentTime(args.val / 1000); // Convert ms to seconds
      });
    }

    // Listen for keyframe changes (dragging)
    if (timeline.onKeyframeChanged) {
      timeline.onKeyframeChanged((args: any) => {

        // FIX: keyframe data is at args.target.keyframe, NOT args.target.model
        const keyframe = args.target?.keyframe;
        if (keyframe && keyframe.keyframeId) {
          const oldTime = args.prevVal / 1000;
          const newTime = args.val / 1000;

          // Always update joint keyframes regardless of display mode
          updateKeyframe(keyframe.keyframeId, { time: newTime });
        }
      });
    }

    // Listen for selection changes
    if (timeline.onSelected) {
      timeline.onSelected((args: any) => {
        const selected = timeline.getSelectedKeyframes?.() || [];
        const selectedIds = new Set<string>();
        selected.forEach((kf: any) => {
          if (kf.keyframeId) {
            selectedIds.add(kf.keyframeId);
          }
        });
        setSelectedKeyframes(selectedIds);
      });
    }

    // Listen for double-clicks on keyframes
    if (timeline.onDoubleClick) {
      timeline.onDoubleClick((args: any) => {
        const keyframe = args.target?.keyframe;
        if (keyframe && keyframe.keyframeId) {
          setEditingKeyframeId(keyframe.keyframeId);
          setEditDialogOpen(true);
        }
      });
    }
  };

  // Ensure we're on the client
  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!containerRef.current || !isClient) return;


    // Dynamically import animation-timeline-js only on client
    import('animation-timeline-js').then((module) => {
      const { Timeline: TimelineLib } = module;

      try {
        // Initialize timeline
        const timeline = new TimelineLib({
          id: containerRef.current,
          headerHeight: 45, // Match outline header height
          rowsStyle: {
            height: 20,
            marginBottom: 3
          }
        });

        // Generate rows with master row and sub-rows for property changes
        const sortedKeyframes = [...keyframes].sort((a, b) => a.time - b.time);
        const rows = generateTimelineRows(sortedKeyframes);

        timeline.setModel({
          rows: rows
        });

        // Render outline labels
        if (outlineRef.current) {
          outlineRef.current.innerHTML = ''; // Clear existing
          rows.forEach((row: any, index: number) => {
            const div = document.createElement('div');
            div.className = 'outline-node';
            // All rows same height (20px) to match timeline rows
            const height = 20;
            const marginBottom = 3; // Match row marginBottom
            div.style.maxHeight = div.style.minHeight = `${height}px`;
            div.style.marginBottom = `${marginBottom}px`;

            // State row: bold and 20% bigger font (14px), sub-rows: indented
            if (index === 0) {
              div.style.fontWeight = 'bold';
              div.style.fontSize = '14px';
            } else {
              div.style.paddingLeft = '30px'; // 10px additional indent (20px base + 10px)
            }

            div.innerText = row.title || `Track ${index}`;
            outlineRef.current?.appendChild(div);
          });
        }

        // Register event handlers
        registerEventHandlers(timeline);

        timelineRef.current = timeline;

        // Sync scrolling between outline and timeline
        const syncScroll = () => {
          if (outlineRef.current && timeline._scrollContainer) {
            outlineRef.current.scrollTop = timeline._scrollContainer.scrollTop;
          }
        };

        if (timeline._scrollContainer) {
          timeline._scrollContainer.addEventListener('scroll', syncScroll);
        }

        return () => {
          if (timeline._scrollContainer) {
            timeline._scrollContainer.removeEventListener('scroll', syncScroll);
          }
          if (timeline.dispose) {
            timeline.dispose();
          }
        };
      } catch (error) {
      }
    }).catch((error) => {
    });
  }, [setCurrentTime, updateKeyframe, motionMode, isClient]);

  // Separate effect to update timeline model when keyframes change
  useEffect(() => {
    if (!timelineRef.current || !isClient) return;

    // Generate rows with master row and sub-rows for property changes
    const sortedKeyframes = [...keyframes].sort((a, b) => a.time - b.time);
    const rows = generateTimelineRows(sortedKeyframes);

    try {
      timelineRef.current.setModel({ rows });

      // Update outline labels to match new rows
      if (outlineRef.current) {
        outlineRef.current.innerHTML = ''; // Clear existing
        rows.forEach((row: any, index: number) => {
          const div = document.createElement('div');
          div.className = 'outline-node';
          // All rows same height (20px) to match timeline rows
          const height = 20;
          const marginBottom = 3; // Match row marginBottom
          div.style.maxHeight = div.style.minHeight = `${height}px`;
          div.style.marginBottom = `${marginBottom}px`;

          // State row: bold and 20% bigger font (14px), sub-rows: indented
          if (index === 0) {
            div.style.fontWeight = 'bold';
            div.style.fontSize = '14px';
          } else {
            div.style.paddingLeft = '30px'; // 10px additional indent (20px base + 10px)
          }

          div.innerText = row.title || `Track ${index}`;
          outlineRef.current?.appendChild(div);
        });
      }

      // Re-register event handlers after setModel
      registerEventHandlers(timelineRef.current);
    } catch (e) {
    }
  }, [keyframes, motionMode, isClient]);

  // Update scrubber position
  useEffect(() => {
    if (timelineRef.current && timelineRef.current.setTime) {
      try {
        timelineRef.current.setTime(currentTime * 1000);
      } catch (e) {
        // Ignore errors during scrubbing
      }
    }
  }, [currentTime]);

  // Add keyboard delete support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedKeyframes.size > 0) {
        e.preventDefault();
        // Delete all selected keyframes (always joint keyframes)
        selectedKeyframes.forEach(id => {
          removeKeyframe(id);
        });
        setSelectedKeyframes(new Set());
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedKeyframes, removeKeyframe]);

  const isPlaying = useTimelineStore((state) => state.playbackState.isPlaying);
  const play = useTimelineStore((state) => state.play);
  const pause = useTimelineStore((state) => state.pause);
  const stop = useTimelineStore((state) => state.stop);
  const recordKeyframes = useTimelineStore((state) => state.recordKeyframes);
  const toggleKeyframeMotionType = useTimelineStore((state) => state.toggleKeyframeMotionType);
  const playbackError = useTimelineStore((state) => state.playbackState.playbackError);
  const clearPlaybackError = useTimelineStore((state) => state.clearPlaybackError);
  const setCachedTrajectory = useTimelineStore((state) => state.setCachedTrajectory);

  // Get commanded state for recording
  const commandedJointAngles = useCommandStore((state) => state.commandedJointAngles);
  const commandedTcpPose = useCommandStore((state) => state.commandedTcpPose);
  const computationRobotRef = useKinematicsStore((state) => state.computationRobotRef);
  const computationTool = useKinematicsStore((state) => state.computationTool);
  const inputCartesianPose = useInputStore((state) => state.inputCartesianPose);
  const tcpOffset = useRobotConfigStore((state) => state.tcpOffset);
  const ikAxisMask = useRobotConfigStore((state) => state.ikAxisMask);

  // Pre-playback positioning hook
  const { moveToStartAndPlay, isMovingToStart, moveError, clearError } = usePrePlaybackPosition();

  const [recordError, setRecordError] = useState<string | null>(null);

  // Helper function to detect property changes between consecutive keyframes
  const detectPropertyChanges = (sortedKeyframes: any[]) => {
    return sortedKeyframes.map((kf, index) => {
      if (index === 0) {
        // First keyframe: all properties "changed" (show all dots)
        return {
          keyframeId: kf.id,
          time: kf.time,
          jointsChanged: true,
          xChanged: true,
          yChanged: true,
          zChanged: true,
          rxChanged: true,
          ryChanged: true,
          rzChanged: true,
          toolChanged: true,
          gripperChanged: true,
        };
      }

      const prev = sortedKeyframes[index - 1];
      const threshold = 0.01; // Comparison threshold for float equality

      // Compare each property
      const jointsChanged = JOINT_NAMES.some(
        (joint) => Math.abs(kf.jointAngles[joint] - prev.jointAngles[joint]) > threshold
      );

      const xChanged =
        Math.abs((kf.cartesianPose?.X || 0) - (prev.cartesianPose?.X || 0)) > threshold;
      const yChanged =
        Math.abs((kf.cartesianPose?.Y || 0) - (prev.cartesianPose?.Y || 0)) > threshold;
      const zChanged =
        Math.abs((kf.cartesianPose?.Z || 0) - (prev.cartesianPose?.Z || 0)) > threshold;
      const rxChanged =
        Math.abs((kf.cartesianPose?.RX || 0) - (prev.cartesianPose?.RX || 0)) > threshold;
      const ryChanged =
        Math.abs((kf.cartesianPose?.RY || 0) - (prev.cartesianPose?.RY || 0)) > threshold;
      const rzChanged =
        Math.abs((kf.cartesianPose?.RZ || 0) - (prev.cartesianPose?.RZ || 0)) > threshold;

      const toolChanged = kf.toolId !== prev.toolId;
      const gripperChanged = kf.gripperState !== prev.gripperState;

      return {
        keyframeId: kf.id,
        time: kf.time,
        jointsChanged,
        xChanged,
        yChanged,
        zChanged,
        rxChanged,
        ryChanged,
        rzChanged,
        toolChanged,
        gripperChanged,
      };
    });
  };

  // Helper function to generate rows with sub-rows for timeline
  const generateTimelineRows = (sortedKeyframes: any[]) => {
    // Detect property changes for all keyframes
    const changes = detectPropertyChanges(sortedKeyframes);

    // Master "State" row - shows all keyframes (complete robot state)
    const masterRow = {
      title: 'State',
      keyframes: sortedKeyframes.map((kf, index) => {
        return {
          val: kf.time * 1000,
          selected: false,
          keyframeId: kf.id,
          group: 'state-group',  // All keyframes in same group for consistent bars
          // Blue keyframes for state row - diamonds
          style: {
            fillColor: '#1976d2',
            strokeColor: '#0d47a1',
            shape: 'rhomb',
            width: 8,
            height: 8,
            strokeThickness: 2,
          },
        };
      }),
      hidden: false,
      style: {
        groupsStyle: {
          fillColor: '#ff9800',  // Orange bar
          strokeThickness: 0,
          height: 12,  // Taller bar for state row
        }
      },
    };

    // Sub-rows - only show dots where properties changed (small circles)
    const subRowStyle = {
      fillColor: '#888',
      strokeColor: '#666',
      shape: 'circle',
      width: 4,
      height: 4,
      strokeThickness: 1,
    };
    const toolStyle = {
      fillColor: '#ffa500',
      strokeColor: '#ff8c00',
      shape: 'circle',
      width: 4,
      height: 4,
      strokeThickness: 1,
    };
    const gripperStyle = {
      fillColor: '#00ff00',
      strokeColor: '#00cc00',
      shape: 'circle',
      width: 4,
      height: 4,
      strokeThickness: 1,
    };

    // Sub-row bars: solid dim gray bars
    const subRowGroupsStyle = {
      fillColor: '#555555',  // Dim gray bar
      strokeThickness: 0,  // No outline
    };

    const xRow = {
      title: 'X',
      keyframes: changes
        .filter((c) => c.xChanged)
        .map((c) => ({
          val: c.time * 1000,
          keyframeId: c.keyframeId,
          draggable: false,
          style: subRowStyle,
          group: 'x-row-group',
        })),
      keyframesDraggable: false,
      hidden: false,
      style: {
        groupsStyle: subRowGroupsStyle,
      },
    };

    const yRow = {
      title: 'Y',
      keyframes: changes
        .filter((c) => c.yChanged)
        .map((c) => ({
          val: c.time * 1000,
          keyframeId: c.keyframeId,
          draggable: false,
          style: subRowStyle,
          group: 'y-row-group',
        })),
      keyframesDraggable: false,
      hidden: false,
      style: {
        groupsStyle: subRowGroupsStyle,
      },
    };

    const zRow = {
      title: 'Z',
      keyframes: changes
        .filter((c) => c.zChanged)
        .map((c) => ({
          val: c.time * 1000,
          keyframeId: c.keyframeId,
          draggable: false,
          style: subRowStyle,
          group: 'z-row-group',
        })),
      keyframesDraggable: false,
      hidden: false,
      style: {
        groupsStyle: subRowGroupsStyle,
      },
    };

    const rxRow = {
      title: 'RX',
      keyframes: changes
        .filter((c) => c.rxChanged)
        .map((c) => ({
          val: c.time * 1000,
          keyframeId: c.keyframeId,
          draggable: false,
          style: subRowStyle,
          group: 'rx-row-group',
        })),
      keyframesDraggable: false,
      hidden: false,
      style: {
        groupsStyle: subRowGroupsStyle,
      },
    };

    const ryRow = {
      title: 'RY',
      keyframes: changes
        .filter((c) => c.ryChanged)
        .map((c) => ({
          val: c.time * 1000,
          keyframeId: c.keyframeId,
          draggable: false,
          style: subRowStyle,
          group: 'ry-row-group',
        })),
      keyframesDraggable: false,
      hidden: false,
      style: {
        groupsStyle: subRowGroupsStyle,
      },
    };

    const rzRow = {
      title: 'RZ',
      keyframes: changes
        .filter((c) => c.rzChanged)
        .map((c) => ({
          val: c.time * 1000,
          keyframeId: c.keyframeId,
          draggable: false,
          style: subRowStyle,
          group: 'rz-row-group',
        })),
      keyframesDraggable: false,
      hidden: false,
      style: {
        groupsStyle: subRowGroupsStyle,
      },
    };

    const toolRow = {
      title: 'Tool',
      keyframes: changes
        .filter((c) => c.toolChanged)
        .map((c) => ({
          val: c.time * 1000,
          keyframeId: c.keyframeId,
          draggable: false,
          style: toolStyle,
          group: 'tool-row-group',
        })),
      keyframesDraggable: false,
      hidden: false,
      style: {
        groupsStyle: subRowGroupsStyle,
      },
    };

    const gripperRow = {
      title: 'Gripper',
      keyframes: changes
        .filter((c) => c.gripperChanged)
        .map((c) => ({
          val: c.time * 1000,
          keyframeId: c.keyframeId,
          draggable: false,
          style: gripperStyle,
          group: 'gripper-row-group',
        })),
      keyframesDraggable: false,
      hidden: false,
      style: {
        groupsStyle: subRowGroupsStyle,
      },
    };

    return [
      masterRow,
      xRow,
      yRow,
      zRow,
      rxRow,
      ryRow,
      rzRow,
      toolRow,
      gripperRow,
    ];
  };

  // Helper function to compute and store cartesianPose for a keyframe
  const computeAndStoreCartesianPose = (keyframeId: string, jointAngles: any) => {
    if (!computationRobotRef) return;

    // Apply joint angles to computation robot using centralized helper
    applyJointAnglesToUrdf(computationRobotRef, jointAngles);

    // Compute FK from updated robot pose
    const cartesianPoseThreeJs = calculateTcpPoseFromUrdf(computationRobotRef, computationTool.tcp_offset);

    if (cartesianPoseThreeJs) {
      // Convert from Three.js coordinates (Y-up) to robot coordinates (Z-up)
      const cartesianPose = threeJsToRobot(cartesianPoseThreeJs);
      // Update keyframe with computed cartesianPose
      updateKeyframe(keyframeId, { cartesianPose });
    }

    // No need to restore - computation robot is headless and not visualized
  };

  const handleRecord = () => {
    setRecordError(null);

    if (motionMode === 'cartesian') {
      // Cartesian mode: Compute IK first, then record
      if (!inputCartesianPose) {
        setRecordError('No cartesian pose set. Move the sliders first.');
        return;
      }

      if (!computationRobotRef) {
        setRecordError('Robot model not loaded. Cannot compute IK.');
        return;
      }

      // Compute IK using current cartesian pose and computation robot
      const ikResult = inverseKinematicsDetailed(
        inputCartesianPose,
        commandedJointAngles,
        computationRobotRef,
        computationTool,
        ikAxisMask
      );

      if (!ikResult.success || !ikResult.jointAngles) {
        setRecordError(`IK failed: ${ikResult.error || 'Position unreachable or singular'}`);
        return;
      }

      // Update commanded angles and record with cartesian pose
      useCommandStore.setState({ commandedJointAngles: ikResult.jointAngles });
      recordKeyframes(ikResult.jointAngles, inputCartesianPose);
    } else {
      // Joint mode: Record current commanded angles and cartesian pose
      recordKeyframes(commandedJointAngles, commandedTcpPose || undefined);
    }
  };

  const handleDeleteSelected = () => {
    // Delete all selected keyframes (always joint keyframes)
    selectedKeyframes.forEach(id => {
      removeKeyframe(id);
    });
    setSelectedKeyframes(new Set());
  };

  const handleToggleMotionType = async () => {
    if (!selectedKeyframe) return;

    // Compute and store cartesianPose if toggling TO cartesian
    // (Check if current motion type is NOT cartesian, meaning toggle will make it cartesian)
    const willBeCartesian = selectedKeyframe.motionType !== 'cartesian';

    // Toggle motion type for selected keyframe
    toggleKeyframeMotionType([selectedKeyframe.id]);

    // If toggling to cartesian, compute and store cartesianPose AND pre-compute trajectory
    if (willBeCartesian) {
      // Use setTimeout to ensure toggleKeyframeMotionType has updated the store
      setTimeout(async () => {
        computeAndStoreCartesianPose(selectedKeyframe.id, selectedKeyframe.jointAngles);

        // Pre-compute trajectory for this segment
        // Find the previous keyframe (the start of this cartesian motion)
        const sortedKeyframes = [...keyframes].sort((a, b) => a.time - b.time);
        const currentIndex = sortedKeyframes.findIndex(kf => kf.id === selectedKeyframe.id);

        if (currentIndex > 0 && computationRobotRef) {
          const prevKeyframe = sortedKeyframes[currentIndex - 1];
          const currKeyframe = sortedKeyframes[currentIndex];

          // Only compute if we have cartesian poses
          if (prevKeyframe.cartesianPose && currKeyframe.cartesianPose) {
            const duration = currKeyframe.time - prevKeyframe.time;

            // Compute trajectory using computation robot
            const result = await preCalculateCartesianTrajectory(
              prevKeyframe.cartesianPose,
              currKeyframe.cartesianPose,
              prevKeyframe.jointAngles,
              duration,
              computationRobotRef,
              computationTool,
              ikAxisMask
            );

            // Cache the trajectory
            if (result.waypointPoses && result.waypointJoints && result.ikValid) {
              // Generate cache key: "prevKeyframeId_currKeyframeId"
              const cacheKey = `${prevKeyframe.id}_${currKeyframe.id}`;

              // Generate dependency hash for cache invalidation
              const dependencyData = JSON.stringify({
                tcpOffset: tcpOffset,
                ikAxisMask: ikAxisMask,
                startPose: prevKeyframe.cartesianPose,
                endPose: currKeyframe.cartesianPose,
                duration: duration
              });

              setCachedTrajectory(cacheKey, {
                waypointPoses: result.waypointPoses,
                waypointJoints: result.waypointJoints,
                ikValid: result.ikValid,
                dependencyHash: dependencyData, // Simple string hash (could use crypto if needed)
                computedAt: Date.now()
              });

              logger.debug(`Cached trajectory for segment ${cacheKey}: ${result.waypointPoses.length} waypoints`, 'Timeline');
            }
          }
        }
      }, 0);
    }
  };

  const handleExport = () => {
    try {
      const json = exportTimeline();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `timeline-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      logger.error('Export failed', 'Timeline', error);
    }
  };

  const handleImport = () => {
    try {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json,.json';
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
          const text = await file.text();
          const timeline = JSON.parse(text);
          loadTimeline(timeline);
        }
      };
      input.click();
    } catch (error) {
      logger.error('Import failed', 'Timeline', error);
    }
  };

  const handleEditKeyframe = () => {
    if (!selectedKeyframe) return;
    setEditingKeyframeId(selectedKeyframe.id);
    setEditDialogOpen(true);
  };

  return (
    <div className="w-full h-full flex flex-col">
      {/* Toolbar - Exact copy of reference site */}
      <div
        className="flex items-center"
        style={{
          backgroundColor: '#3c3c3c',
          paddingLeft: '44px',
          maxHeight: '36px',
          height: '36px',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        {/* Playback buttons */}
        <button
          onClick={() => play(false)}
          className="button material-icons"
          style={{
            padding: '0px',
            width: '44px',
            minWidth: '44px',
            marginRight: '5px',
            color: '#adadad',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer'
          }}
          title="Play Preview (Visual Only)"
          onMouseOver={(e) => e.currentTarget.style.background = '#201616'}
          onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
        >
          play_arrow
        </button>

        <button
          onClick={moveToStartAndPlay}
          disabled={isMovingToStart}
          className="button material-icons"
          style={{
            padding: '0px',
            width: '44px',
            minWidth: '44px',
            marginRight: '5px',
            color: isMovingToStart ? '#ff9800' : '#4caf50',
            background: 'transparent',
            border: 'none',
            cursor: isMovingToStart ? 'wait' : 'pointer',
            opacity: isMovingToStart ? 0.7 : 1
          }}
          title={isMovingToStart ? 'Moving to start position...' : 'Play Execute (Send to Robot)'}
          onMouseOver={(e) => { if (!isMovingToStart) e.currentTarget.style.background = '#201616' }}
          onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
        >
          {isMovingToStart ? 'hourglass_empty' : 'send'}
        </button>

        <button
          onClick={pause}
          className="button material-icons"
          style={{
            padding: '0px',
            width: '44px',
            minWidth: '44px',
            marginRight: '5px',
            color: '#adadad',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer'
          }}
          title="Pause"
          onMouseOver={(e) => e.currentTarget.style.background = '#201616'}
          onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
        >
          pause
        </button>

        <button
          onClick={stop}
          className="button material-icons"
          style={{
            padding: '0px',
            width: '44px',
            minWidth: '44px',
            marginRight: '5px',
            color: '#adadad',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer'
          }}
          title="Stop"
          onMouseOver={(e) => e.currentTarget.style.background = '#201616'}
          onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
        >
          stop
        </button>

        <div style={{ width: '1px', background: 'gray', height: '100%', marginRight: '5px' }}></div>

        {/* Record button */}
        <button
          onClick={handleRecord}
          className="button material-icons"
          style={{
            padding: '0px',
            width: '44px',
            minWidth: '44px',
            marginRight: '5px',
            color: '#adadad',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer'
          }}
          title={motionMode === 'cartesian' ? 'Record Keyframes (IK will be computed from cartesian pose)' : 'Record Keyframes (All Joints)'}
          onMouseOver={(e) => e.currentTarget.style.background = '#201616'}
          onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
        >
          fiber_manual_record
        </button>

        {/* Export button */}
        <button
          onClick={handleExport}
          className="button material-icons"
          style={{
            padding: '0px',
            width: '44px',
            minWidth: '44px',
            marginRight: '5px',
            color: '#adadad',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer'
          }}
          title="Export Timeline to JSON"
          onMouseOver={(e) => e.currentTarget.style.background = '#201616'}
          onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
        >
          file_download
        </button>

        {/* Import button */}
        <button
          onClick={handleImport}
          className="button material-icons"
          style={{
            padding: '0px',
            width: '44px',
            minWidth: '44px',
            marginRight: '5px',
            color: '#adadad',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer'
          }}
          title="Import Timeline from JSON"
          onMouseOver={(e) => e.currentTarget.style.background = '#201616'}
          onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
        >
          file_upload
        </button>

        {/* Vertical divider */}
        <div style={{ width: '1px', background: 'gray', height: '100%', marginRight: '5px' }}></div>

        {/* Keyframe section label */}
        <span style={{
          fontSize: '12px',
          color: '#888888',
          marginRight: '8px',
          fontWeight: '500'
        }}>
          Keyframe
        </span>

        {/* Cartesian Move toggle button */}
        <button
          onClick={handleToggleMotionType}
          disabled={!selectedKeyframe}
          className="button"
          style={{
            padding: '0px 12px',
            height: '28px',
            marginRight: '5px',
            color: !selectedKeyframe ? '#555555' : (isSelectedKeyframeCartesian ? '#ff9800' : '#adadad'),
            background: isSelectedKeyframeCartesian ? 'rgba(255, 152, 0, 0.2)' : 'transparent',
            border: isSelectedKeyframeCartesian ? '1px solid #ff9800' : '1px solid #555555',
            borderRadius: '4px',
            cursor: !selectedKeyframe ? 'default' : 'pointer',
            fontSize: '11px',
            fontWeight: '500',
            opacity: !selectedKeyframe ? 0.5 : 1
          }}
          title={!selectedKeyframe ? 'Select a keyframe to toggle motion type' : 'Toggle between Joint and Cartesian motion'}
        >
          {isSelectedKeyframeCartesian ? 'Cartesian' : 'Joint'} Move
        </button>

        {/* Edit Keyframe button */}
        <button
          onClick={handleEditKeyframe}
          disabled={!selectedKeyframe}
          className="button material-icons"
          style={{
            padding: '0px',
            width: '44px',
            minWidth: '44px',
            marginRight: '5px',
            color: !selectedKeyframe ? '#555555' : '#adadad',
            background: 'transparent',
            border: 'none',
            cursor: !selectedKeyframe ? 'default' : 'pointer'
          }}
          title={!selectedKeyframe ? 'Select a keyframe to edit' : 'Edit Keyframe Values'}
          onMouseOver={(e) => { if (selectedKeyframe) e.currentTarget.style.background = '#201616' }}
          onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
        >
          edit
        </button>

        {/* Spacer */}
        <div style={{ flex: 1 }}></div>

        {/* Right side - Delete and Time */}
        <button
          onClick={handleDeleteSelected}
          disabled={selectedKeyframes.size === 0}
          className="button material-icons"
          style={{
            padding: '0px',
            width: '44px',
            minWidth: '44px',
            marginRight: '5px',
            color: selectedKeyframes.size === 0 ? '#555555' : '#adadad',
            background: 'transparent',
            border: 'none',
            cursor: selectedKeyframes.size === 0 ? 'default' : 'pointer'
          }}
          title="Remove Selected Keyframes"
          onMouseOver={(e) => { if (selectedKeyframes.size > 0) e.currentTarget.style.background = '#201616' }}
          onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
        >
          close
        </button>

        {/* Time Display */}
        <div style={{
          color: '#adadad',
          fontSize: '12px',
          fontFamily: 'monospace',
          marginRight: '10px'
        }}>
          {currentTime.toFixed(2)}s / {duration.toFixed(2)}s
        </div>
      </div>

      {/* Error Banners */}
      {moveError && (
        <div style={{
          backgroundColor: '#d32f2f',
          color: 'white',
          padding: '8px 12px',
          fontSize: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <span>{moveError}</span>
          <button
            onClick={clearError}
            className="material-icons"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'white',
              cursor: 'pointer',
              padding: '0',
              fontSize: '18px'
            }}
          >
            close
          </button>
        </div>
      )}

      {recordError && (
        <div style={{
          backgroundColor: '#d32f2f',
          color: 'white',
          padding: '8px 12px',
          fontSize: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <span>{recordError}</span>
          <button
            onClick={() => setRecordError(null)}
            className="material-icons"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'white',
              cursor: 'pointer',
              padding: '0',
              fontSize: '18px'
            }}
          >
            close
          </button>
        </div>
      )}

      {playbackError && (
        <div style={{
          backgroundColor: '#ff6f00',  // Orange warning color (distinct from red errors)
          color: 'white',
          padding: '8px 12px',
          fontSize: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <span>{playbackError}</span>
          <button
            onClick={clearPlaybackError}
            className="material-icons"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'white',
              cursor: 'pointer',
              padding: '0',
              fontSize: '18px'
            }}
          >
            close
          </button>
        </div>
      )}

      {/* Footer: Outline + Timeline */}
      <div style={{ display: 'flex', flex: 1, minHeight: '200px' }}>
        {/* Outline Panel - Left */}
        <div style={{
          width: '150px',
          background: '#161616',
          borderRight: '1px solid #3c3c3c',
          overflow: 'hidden'
        }}>
          <div style={{ height: '45px', background: '#3c3c3c' }}></div>
          <div
            ref={outlineRef}
            style={{ overflowY: 'auto', overflowX: 'hidden' }}
          />
        </div>

        {/* Timeline Canvas - Right */}
        <div
          ref={containerRef}
          style={{ flex: 1, background: '#161616' }}
        />
      </div>

      {/* Keyframe Edit Dialog */}
      <KeyframeEditDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        keyframeId={editingKeyframeId}
      />
    </div>
  );
}
