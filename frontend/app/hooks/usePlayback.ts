import { useEffect, useRef } from 'react';
import { useTimelineStore } from '@/app/lib/stores/timelineStore';
import { useCommandStore } from '@/app/lib/stores/commandStore';
import { useRobotConfigStore } from '@/app/lib/stores/robotConfigStore';
import { useKinematicsStore } from '@/app/lib/stores/kinematicsStore';
import { useInputStore } from '@/app/lib/stores/inputStore';
import { usePerformanceStore } from '@/app/lib/stores/performanceStore';
import { getJointAnglesAtTime, getCartesianPoseAtTime, shouldUseCartesianInterpolation, getGripperStateAtTime } from '@/app/lib/interpolation';
import { inverseKinematicsDetailed } from '@/app/lib/kinematics';
import { DEFAULT_FPS } from '@/app/lib/constants';
import { moveJoints, executeTrajectory } from '@/app/lib/api';
import { getApiBaseUrl } from '@/app/lib/apiConfig';
import { generateCartesianWaypoints, arrayToPose, poseToArray, calculateWaypointCount } from '@/app/lib/cartesianPlanner';
import { getToolAtTime } from '@/app/lib/toolHelpers';
import { JointAngles, CartesianPose, Tool } from '@/app/lib/types';
import { logger } from '@/app/lib/logger';
import { applyLoopDeltasToKeyframe } from '@/app/lib/loopVariables';
import { Keyframe, CachedTrajectory } from '@/app/lib/stores/timelineStore';

/**
 * Send all timeline commands to the commander queue upfront.
 *
 * This replaces the streaming approach (sending commands as keyframes are crossed)
 * with a more robust batch approach where all commands are queued at once.
 *
 * @param keyframes - Timeline keyframes (should be sorted by time)
 * @param trajectoryCache - Cache of pre-calculated cartesian trajectories
 * @param loopIteration - Current loop iteration (0-indexed)
 * @returns Result with success status and command count
 */
export async function sendAllTimelineCommands(
  keyframes: Keyframe[],
  trajectoryCache: Map<string, CachedTrajectory>,
  loopIteration: number = 0
): Promise<{ success: boolean; commandCount: number; error?: string }> {
  const sortedKeyframes = [...keyframes].sort((a, b) => a.time - b.time);
  let commandCount = 0;

  logger.info(`Queueing ${sortedKeyframes.length - 1} segments (loop ${loopIteration})`, 'sendAllTimelineCommands');

  for (let i = 0; i < sortedKeyframes.length - 1; i++) {
    const current = sortedKeyframes[i];
    const next = sortedKeyframes[i + 1];
    const duration = next.time - current.time;

    // Send I/O commands at segment start (if defined)
    if (current.output_1 !== undefined) {
      try {
        await fetch(`${getApiBaseUrl()}/api/robot/io/set`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ output: 1, state: current.output_1, wait_for_ack: false })
        });
      } catch (err) {
        logger.error(`Failed to set output_1 at segment ${i}`, 'sendAllTimelineCommands', err);
      }
    }
    if (current.output_2 !== undefined) {
      try {
        await fetch(`${getApiBaseUrl()}/api/robot/io/set`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ output: 2, state: current.output_2, wait_for_ack: false })
        });
      } catch (err) {
        logger.error(`Failed to set output_2 at segment ${i}`, 'sendAllTimelineCommands', err);
      }
    }

    // Send motion command
    if (next.motionType === 'cartesian' && next.cartesianPose) {
      // Cartesian motion - use cached trajectory
      const baseCacheKey = `${current.id}_${next.id}`;
      const cacheKey = loopIteration > 0 ? `${baseCacheKey}_loop${loopIteration}` : baseCacheKey;
      const cached = trajectoryCache.get(cacheKey);

      if (!cached) {
        logger.error(`Missing trajectory cache for segment ${i}`, 'sendAllTimelineCommands', { cacheKey });
        return {
          success: false,
          commandCount,
          error: `Missing trajectory cache for segment ${i}: ${cacheKey}. Toggle cartesian mode to recalculate.`
        };
      }

      // Check if any waypoints failed IK
      const anyFailed = cached.ikValid?.some(valid => !valid);
      if (anyFailed) {
        const failedIndex = cached.ikValid?.findIndex(valid => !valid) ?? -1;
        return {
          success: false,
          commandCount,
          error: `Segment ${i} has failed IK at waypoint ${failedIndex}. Edit keyframe to fix.`
        };
      }

      const trajectory = cached.waypointJoints.map(joints => [
        joints.J1, joints.J2, joints.J3, joints.J4, joints.J5, joints.J6
      ]);

      try {
        const result = await executeTrajectory({
          trajectory,
          duration,
          wait_for_ack: false
        });

        if (!result.success) {
          logger.error(`Failed to queue trajectory for segment ${i}`, 'sendAllTimelineCommands', result);
          return {
            success: false,
            commandCount,
            error: `Failed to queue trajectory for segment ${i}: ${result.message}`
          };
        }
      } catch (err) {
        logger.error(`Error queueing trajectory for segment ${i}`, 'sendAllTimelineCommands', err);
        return {
          success: false,
          commandCount,
          error: `Error queueing trajectory for segment ${i}: ${err}`
        };
      }
    } else {
      // Joint motion
      const targetAngles = next.jointAngles;
      if (!targetAngles) {
        logger.error(`Missing joint angles for segment ${i}`, 'sendAllTimelineCommands');
        return {
          success: false,
          commandCount,
          error: `Missing joint angles for segment ${i}`
        };
      }

      try {
        const result = await moveJoints(targetAngles, undefined, duration);
        if (!result.success) {
          logger.error(`Failed to queue joint move for segment ${i}`, 'sendAllTimelineCommands', result);
          return {
            success: false,
            commandCount,
            error: `Failed to queue joint move for segment ${i}: ${result.error}`
          };
        }
      } catch (err) {
        logger.error(`Error queueing joint move for segment ${i}`, 'sendAllTimelineCommands', err);
        return {
          success: false,
          commandCount,
          error: `Error queueing joint move for segment ${i}: ${err}`
        };
      }
    }

    commandCount++;
  }

  // Final keyframe I/O (at the end of timeline)
  const last = sortedKeyframes[sortedKeyframes.length - 1];
  if (last && last.output_1 !== undefined) {
    try {
      await fetch(`${getApiBaseUrl()}/api/robot/io/set`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ output: 1, state: last.output_1, wait_for_ack: false })
      });
    } catch (err) {
      logger.error('Failed to set final output_1', 'sendAllTimelineCommands', err);
    }
  }
  if (last && last.output_2 !== undefined) {
    try {
      await fetch(`${getApiBaseUrl()}/api/robot/io/set`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ output: 2, state: last.output_2, wait_for_ack: false })
      });
    } catch (err) {
      logger.error('Failed to set final output_2', 'sendAllTimelineCommands', err);
    }
  }

  logger.info(`Successfully queued ${commandCount} commands`, 'sendAllTimelineCommands');
  return { success: true, commandCount };
}

/**
 * Validate timeline before queueing commands.
 *
 * Checks:
 * - Segment count within queue limits
 * - All cartesian segments have cached trajectories
 *
 * @param keyframes - Timeline keyframes
 * @param trajectoryCache - Trajectory cache
 * @param loopIteration - Current loop iteration
 * @returns Validation result
 */
export function validateTimelineForQueue(
  keyframes: Keyframe[],
  trajectoryCache: Map<string, CachedTrajectory>,
  loopIteration: number = 0
): { valid: boolean; error?: string } {
  const segmentCount = keyframes.length - 1;

  if (segmentCount <= 0) {
    return { valid: false, error: 'Timeline must have at least 2 keyframes' };
  }

  if (segmentCount > 50) {
    return {
      valid: false,
      error: `Timeline has ${segmentCount} segments. Maximum recommended is 50 to stay within queue limits.`
    };
  }

  // Check trajectory cache for cartesian segments
  const sortedKeyframes = [...keyframes].sort((a, b) => a.time - b.time);
  for (let i = 1; i < sortedKeyframes.length; i++) {
    const prev = sortedKeyframes[i - 1];
    const curr = sortedKeyframes[i];

    if (curr.motionType === 'cartesian') {
      const baseCacheKey = `${prev.id}_${curr.id}`;
      const cacheKey = loopIteration > 0 ? `${baseCacheKey}_loop${loopIteration}` : baseCacheKey;

      if (!trajectoryCache.has(cacheKey)) {
        return {
          valid: false,
          error: `Missing trajectory for cartesian segment ${i} (${prev.id} → ${curr.id}). Toggle cartesian mode to recalculate.`
        };
      }
    }
  }

  return { valid: true };
}

/**
 * Solve IK with J1 sweep fallback strategy.
 *
 * If primary seed fails, systematically sweeps J1 (base rotation) in ±10° increments
 * to find alternative arm configurations that can reach the target pose.
 *
 * @param target - Target Cartesian pose
 * @param primarySeed - Primary seed for IK (for continuity)
 * @param robot - URDF robot reference
 * @param tool - Tool configuration
 * @param mask - IK axis mask
 * @returns IK result with metadata about seed used and attempts required
 */
function solveIKWithJ1Sweep(
  target: CartesianPose,
  primarySeed: JointAngles,
  robot: any,
  tool: Tool,
  mask: any
): { success: boolean; jointAngles?: JointAngles; error?: Error; seedUsed?: JointAngles; attemptsRequired?: number } {

  // Try primary seed first (for trajectory continuity)
  let result = inverseKinematicsDetailed(target, primarySeed, robot, tool, mask);
  if (result.success && result.jointAngles) {
    return {
      success: true,
      jointAngles: result.jointAngles,
      seedUsed: primarySeed,
      attemptsRequired: 1
    };
  }

  // J1 sweep: ±15° increments up to ±90° (8 attempts, fast with 30 iter limit)
  const J1_INCREMENT = 15;
  const MAX_J1_OFFSET = 90;
  let attempts = 1;

  for (let offset = J1_INCREMENT; offset <= MAX_J1_OFFSET; offset += J1_INCREMENT) {
    // Try +offset
    attempts++;
    const seedPlus: JointAngles = { ...primarySeed, J1: primarySeed.J1 + offset };
    result = inverseKinematicsDetailed(target, seedPlus, robot, tool, mask);
    if (result.success && result.jointAngles) {
      logger.info(`J1 sweep: +${offset}° (${attempts} attempts)`, 'J1Sweep');
      return {
        success: true,
        jointAngles: result.jointAngles,
        seedUsed: seedPlus,
        attemptsRequired: attempts
      };
    }

    // Try -offset
    attempts++;
    const seedMinus: JointAngles = { ...primarySeed, J1: primarySeed.J1 - offset };
    result = inverseKinematicsDetailed(target, seedMinus, robot, tool, mask);
    if (result.success && result.jointAngles) {
      logger.info(`J1 sweep: -${offset}° (${attempts} attempts)`, 'J1Sweep');
      return {
        success: true,
        jointAngles: result.jointAngles,
        seedUsed: seedMinus,
        attemptsRequired: attempts
      };
    }
  }

  // All J1 sweeps failed
  logger.warn(`J1 sweep failed: ${attempts} attempts exhausted`, 'J1Sweep');
  return {
    success: false,
    error: result.error,
    seedUsed: primarySeed,
    attemptsRequired: attempts
  };
}

/**
 * Pre-calculate Cartesian trajectory using frontend IK with proper seeding.
 *
 * This solves the "jumpy preview" problem by:
 * 1. Generating dense waypoints (100Hz)
 * 2. Solving frontend IK for each waypoint
 * 3. Using PREVIOUS solution as seed for NEXT waypoint (continuity!)
 * 4. Comprehensive logging for debugging
 *
 * @param startPose - Starting Cartesian pose
 * @param endPose - Ending Cartesian pose
 * @param startJoints - Starting joint configuration (seed for first waypoint)
 * @param duration - Segment duration in seconds
 * @param computationRobotRef - URDF computation robot reference
 * @param computationTool - Tool configuration with TCP offset
 * @param ikAxisMask - IK axis mask
 * @returns Joint trajectory or null if IK fails
 */
export async function preCalculateCartesianTrajectory(
  startPose: CartesianPose,
  endPose: CartesianPose,
  startJoints: JointAngles,
  duration: number,
  computationRobotRef: any,
  computationTool: Tool,
  ikAxisMask: any
): Promise<{
  success: boolean;
  trajectory?: number[][];
  failedAt?: number;
  error?: string;
  waypointPoses?: CartesianPose[];
  waypointJoints?: JointAngles[];
  ikValid?: boolean[];
}> {
  const startTime = performance.now();

  // Generate waypoints at 100Hz
  const waypoints = generateCartesianWaypoints(startPose, endPose, { duration });
  const numWaypoints = waypoints.length;

  // Initialize arrays
  const jointTrajectory: number[][] = [];
  const jointAnglesArray: JointAngles[] = [];
  const ikValidArray: boolean[] = [];

  logger.info(`Starting trajectory pre-calc: ${numWaypoints} waypoints`, 'preCalc');

  // Solve IK for each waypoint with progressive seeding and J1 sweep fallback
  let successCount = 0;
  let failureCount = 0;
  let recoveryCount = 0;

  for (let i = 0; i < numWaypoints; i++) {
    const waypoint = waypoints[i];

    // Progressive seeding: use previous solution for continuity
    const seed = i === 0 ? startJoints :
                 (ikValidArray[i-1] ? jointAnglesArray[i-1] : startJoints);

    // Update progress and yield to UI every 10 waypoints
    if (i % 10 === 0) {
      useTimelineStore.getState().setIKProgress({
        current: i,
        total: numWaypoints,
        isCalculating: true,
        recoveries: recoveryCount
      });

      // Yield to UI thread to prevent freezing
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    // Solve with J1 sweep fallback
    const ikResult = solveIKWithJ1Sweep(waypoint, seed, computationRobotRef, computationTool, ikAxisMask);

    if (!ikResult.success || !ikResult.jointAngles) {
      // IK failed - mark as invalid but CONTINUE to process remaining waypoints
      failureCount++;
      logger.warn(`Waypoint ${i}/${numWaypoints} FAILED`, 'preCalc', {
        attempts: ikResult.attemptsRequired,
        error: ikResult.error?.message
      });

      ikValidArray.push(false);
      jointAnglesArray.push(seed);
      jointTrajectory.push([
        seed.J1,
        seed.J2,
        seed.J3,
        seed.J4,
        seed.J5,
        seed.J6
      ]);

      continue;
    }

    // IK succeeded - mark as valid
    successCount++;

    // Track J1 sweep recoveries
    if ((ikResult.attemptsRequired || 1) > 1) {
      recoveryCount++;
      logger.info(`Waypoint ${i} recovered`, 'preCalc', {
        attempts: ikResult.attemptsRequired,
        j1Offset: ikResult.seedUsed ? (ikResult.seedUsed.J1 - seed.J1).toFixed(1) : 0
      });
    }

    ikValidArray.push(true);

    // Store solution
    jointAnglesArray.push({ ...ikResult.jointAngles });
    jointTrajectory.push([
      ikResult.jointAngles.J1,
      ikResult.jointAngles.J2,
      ikResult.jointAngles.J3,
      ikResult.jointAngles.J4,
      ikResult.jointAngles.J5,
      ikResult.jointAngles.J6
    ]);
  }

  // Clear progress when done
  useTimelineStore.getState().setIKProgress({
    current: numWaypoints,
    total: numWaypoints,
    isCalculating: false,
    recoveries: recoveryCount
  });

  logger.info(`Pre-calc complete: ${successCount}/${numWaypoints} succeeded`, 'preCalc', {
    successRate: `${(successCount/numWaypoints*100).toFixed(1)}%`,
    recoveries: recoveryCount,
    recoveryRate: `${(recoveryCount/numWaypoints*100).toFixed(1)}%`,
    totalFailures: failureCount,
    duration: `${(performance.now() - startTime).toFixed(0)}ms`
  });

  // Log pattern of successes/failures to see distribution
  const pattern: string[] = [];
  let currentRun = { valid: ikValidArray[0], count: 0 };
  for (let i = 0; i < ikValidArray.length; i++) {
    if (ikValidArray[i] === currentRun.valid) {
      currentRun.count++;
    } else {
      pattern.push(`${currentRun.count}${currentRun.valid ? 'V' : 'X'}`);
      currentRun = { valid: ikValidArray[i], count: 1 };
    }
  }
  pattern.push(`${currentRun.count}${currentRun.valid ? 'V' : 'X'}`);
  const patternStr = pattern.join(' → ');
  logger.info(`Validity pattern: ${patternStr}`, 'preCalc');

  const elapsed = performance.now() - startTime;

  // Check if any waypoints failed
  const anyFailed = ikValidArray.some(valid => !valid);
  const firstFailedIndex = anyFailed ? ikValidArray.findIndex(valid => !valid) : -1;

  if (anyFailed) {
    logger.warn(`Trajectory complete with ${ikValidArray.filter(v => !v).length} failed waypoints`, 'preCalculateCartesianTrajectory', {
      firstFailed: firstFailedIndex,
      total: numWaypoints,
      elapsed: `${elapsed.toFixed(0)}ms`
    });
  } else {
    logger.info(`Trajectory complete - all ${numWaypoints} waypoints valid`, 'preCalculateCartesianTrajectory', {
      elapsed: `${elapsed.toFixed(0)}ms`
    });
  }

  return {
    success: !anyFailed,
    trajectory: jointTrajectory,
    failedAt: firstFailedIndex >= 0 ? firstFailedIndex : undefined,
    error: anyFailed ? `IK failed at waypoint ${firstFailedIndex}/${numWaypoints}` : undefined,
    waypointPoses: waypoints,
    waypointJoints: jointAnglesArray,
    ikValid: ikValidArray
  };
}

/**
 * Playback loop hook - runs at 60fps when playing
 * @param availableTools - Array of all available tools for tool switching during playback
 */
export function usePlayback(availableTools: Tool[] = []) {
  const isPlaying = useTimelineStore((state) => state.playbackState.isPlaying);
  const executeOnRobot = useTimelineStore((state) => state.playbackState.executeOnRobot);
  const currentTime = useTimelineStore ((state) => state.playbackState.currentTime);
  const startTime = useTimelineStore((state) => state.playbackState.startTime);
  const duration = useTimelineStore((state) => state.timeline.duration);
  const motionMode = useTimelineStore((state) => state.timeline.mode);
  const keyframes = useTimelineStore((state) => state.timeline.keyframes);
  const commandedJointAngles = useCommandStore((state) => state.commandedJointAngles);
  const computationRobotRef = useKinematicsStore((state) => state.computationRobotRef);
  const computationTool = useKinematicsStore((state) => state.computationTool);
  const ikAxisMask = useRobotConfigStore((state) => state.ikAxisMask);
  const setCurrentTime = useTimelineStore((state) => state.setCurrentTime);
  const pause = useTimelineStore((state) => state.pause);
  const stop = useTimelineStore((state) => state.stop);
  const setPlaybackError = useTimelineStore((state) => state.setPlaybackError);

  // Track if commands have been sent for the current loop iteration
  const commandsSentForLoop = useRef<number>(-1);

  useEffect(() => {
    if (!isPlaying || startTime === null) return;

    // Reset command tracking when playback starts
    commandsSentForLoop.current = -1;

    const interval = setInterval(async () => {
      const elapsed = (Date.now() - startTime) / 1000; // Convert to seconds

      // Apply loop deltas to keyframes for current iteration
      const loopCount = useTimelineStore.getState().playbackState.loopCount;
      const adjustedKeyframes = keyframes.map(kf => {
        const adjusted = applyLoopDeltasToKeyframe(kf, loopCount);

        // If loop deltas were applied (cartesian pose changed), re-solve IK for joint angles
        if (loopCount > 0 && adjusted.cartesianPose && computationRobotRef) {
          const ikResult = inverseKinematicsDetailed(
            adjusted.cartesianPose,
            kf.jointAngles || commandedJointAngles, // Use original as seed
            computationRobotRef,
            computationTool,
            ikAxisMask
          );

          if (ikResult.success && ikResult.jointAngles) {
            return { ...adjusted, jointAngles: ikResult.jointAngles };
          }
        }

        return adjusted;
      });

      // Calculate last keyframe time
      const lastKeyframeTime = adjustedKeyframes.length > 0
        ? Math.max(...adjustedKeyframes.map(kf => kf.time))
        : duration;

      // Check if we've reached the end of the timeline
      if (elapsed >= lastKeyframeTime) {
        const loopIterations = useTimelineStore.getState().timeline.loopIterations || 1;
        const loopCount = useTimelineStore.getState().playbackState.loopCount;

        // Check if we should loop
        if (loopIterations > 1 && loopCount < loopIterations - 1) {
          // More loops to go - restart from beginning
          setCurrentTime(0);
          useTimelineStore.setState({
            playbackState: {
              ...useTimelineStore.getState().playbackState,
              startTime: Date.now(),
              loopCount: loopCount + 1
            }
          });
          // Commands will be sent again for the new loop iteration
          // (commandsSentForLoop will not match loopCount + 1)
          // Don't return - let playback continue
        } else {
          // Done looping - stop playback
          pause();
          return;
        }
      }

      setCurrentTime(elapsed);

      // ========================================
      // QUEUE COMMANDS FOR SUBSEQUENT LOOPS
      // ========================================
      // Initial loop (loopCount=0) commands are queued by usePrePlaybackPosition before play() starts.
      // This only handles subsequent loop iterations (loopCount > 0).
      if (executeOnRobot && loopCount > 0 && commandsSentForLoop.current !== loopCount) {
        commandsSentForLoop.current = loopCount;

        // Validate timeline before sending
        const trajectoryCache = useTimelineStore.getState().trajectoryCache;
        const validation = validateTimelineForQueue(adjustedKeyframes, trajectoryCache, loopCount);

        if (!validation.valid) {
          logger.error('Timeline validation failed', 'usePlayback', { error: validation.error });
          pause();
          setPlaybackError(validation.error || 'Timeline validation failed');
          return;
        }

        // Send all commands upfront
        const result = await sendAllTimelineCommands(adjustedKeyframes, trajectoryCache, loopCount);

        if (!result.success) {
          logger.error('Failed to queue timeline commands', 'usePlayback', { error: result.error });
          pause();
          setPlaybackError(result.error || 'Failed to queue timeline commands');
          return;
        }

        logger.info(`Queued ${result.commandCount} commands for loop ${loopCount}`, 'usePlayback');
      }

      // Update tool based on current timeline position (same pattern as useScrubbing)
      if (availableTools.length > 0 && adjustedKeyframes.length > 0) {
        const computationTool = useKinematicsStore.getState().computationTool;
        const currentTool = getToolAtTime(adjustedKeyframes, elapsed, availableTools, computationTool);

        // Always update stores to force object reference change
        // This ensures mesh reload triggers during playback
        useKinematicsStore.setState({ computationTool: currentTool });
        useCommandStore.setState({ commanderTool: currentTool });

        // Sync TCP offset to robotConfigStore (for TCP visualizers and UI components)
        if (currentTool?.tcp_offset) {
          useRobotConfigStore.setState({
            tcpOffset: {
              x: currentTool.tcp_offset.x,
              y: currentTool.tcp_offset.y,
              z: currentTool.tcp_offset.z,
              rx: currentTool.tcp_offset.rx ?? 0,
              ry: currentTool.tcp_offset.ry ?? 0,
              rz: currentTool.tcp_offset.rz ?? 0
            }
          });
        }
      }

      // Update gripper state based on current timeline position (same as useScrubbing)
      if (adjustedKeyframes.length > 0) {
        const currentGripperState = getGripperStateAtTime(adjustedKeyframes, elapsed);
        const currentCommandedState = useCommandStore.getState().commandedGripperState;

        // Only update if changed (avoid unnecessary renders)
        if (currentGripperState !== currentCommandedState) {
          useCommandStore.setState({ commandedGripperState: currentGripperState });
        }
      }

      // Per-keyframe motion type interpolation
      // Check if we should use cartesian interpolation (moving TO a cartesian keyframe)
      const useCartesian = shouldUseCartesianInterpolation(adjustedKeyframes, elapsed);

      if (useCartesian) {
        // Cartesian preview: Use pre-calculated cached trajectory (NO IK!)
        // Find which segment we're in
        const sortedKeyframes = [...adjustedKeyframes].sort((a, b) => a.time - b.time);
        let targetSegment = null;

        for (let i = 1; i < sortedKeyframes.length; i++) {
          const prevKf = sortedKeyframes[i - 1];
          const currKf = sortedKeyframes[i];

          if (elapsed >= prevKf.time && elapsed <= currKf.time && currKf.motionType === 'cartesian') {
            targetSegment = { prev: prevKf, curr: currKf, index: i };
            break;
          }
        }

        if (targetSegment) {
          // Get cached trajectory for this segment (include loop iteration)
          const baseCacheKey = `${targetSegment.prev.id}_${targetSegment.curr.id}`;
          const cacheKey = loopCount > 0 ? `${baseCacheKey}_loop${loopCount}` : baseCacheKey;
          const cachedTrajectory = useTimelineStore.getState().getCachedTrajectory(cacheKey);

          if (cachedTrajectory && cachedTrajectory.waypointJoints) {
            // Interpolate within cached waypoints
            const segmentDuration = targetSegment.curr.time - targetSegment.prev.time;
            const segmentProgress = (elapsed - targetSegment.prev.time) / segmentDuration;
            const waypointIndex = Math.floor(segmentProgress * (cachedTrajectory.waypointJoints.length - 1));
            const clampedIndex = Math.max(0, Math.min(waypointIndex, cachedTrajectory.waypointJoints.length - 1));

            // Use pre-calculated joint angles from cache
            const waypointJoints = cachedTrajectory.waypointJoints[clampedIndex];
            useCommandStore.setState({ commandedJointAngles: waypointJoints });
          } else {
            // No cache - fall back to keyframe interpolation
            const interpolatedAngles = getJointAnglesAtTime(adjustedKeyframes, elapsed);
            useCommandStore.setState({ commandedJointAngles: interpolatedAngles });
          }
        } else {
          // Not in a cartesian segment - use keyframe interpolation
          const interpolatedAngles = getJointAnglesAtTime(adjustedKeyframes, elapsed);
          useCommandStore.setState({ commandedJointAngles: interpolatedAngles });
        }

        // Update cartesian pose for target visualizer
        const interpolatedPose = getCartesianPoseAtTime(adjustedKeyframes, elapsed);
        if (interpolatedPose) {
          useInputStore.setState({
            inputCartesianPose: interpolatedPose
          });
        }
      } else {
        // Joint interpolation: Interpolate joint angles directly
        const interpolatedAngles = getJointAnglesAtTime(adjustedKeyframes, elapsed);
        useCommandStore.setState({ commandedJointAngles: interpolatedAngles });
      }
    }, 1000 / DEFAULT_FPS); // 60fps

    return () => {
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, startTime, duration, motionMode, keyframes, setCurrentTime, stop, executeOnRobot]);

  // NOTE: Recording is now commander-driven, not timeline-driven.
  // When recording is armed via UI toggle, commander auto-starts recording
  // when first command begins executing and auto-stops when queue is empty.
}
