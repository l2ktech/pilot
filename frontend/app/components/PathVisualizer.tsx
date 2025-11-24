'use client';

import { useMemo, useRef, useEffect, useState } from 'react';
import { Instances, Instance } from '@react-three/drei';
import * as THREE from 'three';
import PathOrientationGizmo from './PathOrientationGizmo';
import { useTimelineStore } from '../lib/stores/timelineStore';
import { useKinematicsStore } from '../lib/stores/kinematicsStore';
import { useRobotConfigStore } from '../lib/stores/robotConfigStore';
import { getJointAnglesAtTime } from '../lib/interpolation';
import { calculateTcpPoseFromUrdf } from '../lib/tcpCalculations';
import { applyJointAnglesToUrdf } from '../lib/urdfHelpers';
import { robotToThreeJs } from '../lib/coordinateTransform';
import { inverseKinematicsDetailed } from '../lib/kinematics';
import type { Keyframe, JointAngles, Tool } from '../types';
import { logger } from '../lib/logger';
import { JOINT_NAMES } from '../lib/constants';
import { getToolForSegment } from '../lib/toolHelpers';
import { hasLoopDeltas, getEffectiveCartesianPose, applyLoopDeltasToKeyframe } from '../lib/loopVariables';

// Distance-based sampling configuration
// Path shape is independent of timing - samples based on geometric distance
const SAMPLES_PER_10MM = 1; // 1 sample per 10mm of linear distance
const MIN_SAMPLES = 5;       // Minimum samples for very short movements
const MAX_SAMPLES = 100;     // Maximum samples to prevent performance issues

/**
 * Calculate number of samples based on Cartesian distance.
 * This makes path shape independent of timing - only depends on geometry.
 */
function calculateSamplesFromDistance(distanceMm: number): number {
  const samples = Math.ceil(distanceMm / 10); // 1 sample per 10mm
  return Math.max(MIN_SAMPLES, Math.min(MAX_SAMPLES, samples));
}

interface PathVisualizerProps {
  visible?: boolean;
  availableTools: Tool[];
}

interface PathPoint {
  position: THREE.Vector3;
  orientation: THREE.Euler; // RX, RY, RZ orientation in radians
  valid: boolean; // For IK validation (cartesian segments only)
}

interface PathSegment {
  points: PathPoint[];
  motionType: 'joint' | 'cartesian';
  startKeyframe: Keyframe;
  endKeyframe: Keyframe;
  loopIteration?: number; // 0 = base path, 1+ = loop iterations
}

export default function PathVisualizer({ visible = true, availableTools }: PathVisualizerProps) {
  const groupRef = useRef<THREE.Group>(null);

  // Hover state for orientation gizmo
  const [hoveredSegmentIndex, setHoveredSegmentIndex] = useState<number | null>(null);
  const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(null);

  // Subscribe to stores
  const keyframes = useTimelineStore((state) => state.timeline.keyframes);
  const trajectoryCache = useTimelineStore((state) => state.trajectoryCache);
  const loopIterations = useTimelineStore((state) => state.timeline.loopIterations || 1);
  const computationRobotRef = useKinematicsStore((state) => state.computationRobotRef);
  const computationTool = useKinematicsStore((state) => state.computationTool);
  const ikAxisMask = useRobotConfigStore((state) => state.ikAxisMask);

  // Generate path segments from keyframes
  const pathSegments = useMemo(() => {
    if (!computationRobotRef || keyframes.length < 2) {
      return [];
    }

    const segments: PathSegment[] = [];

    // Iterate through adjacent keyframe pairs
    for (let i = 0; i < keyframes.length - 1; i++) {
      const startKeyframe = keyframes[i];
      const endKeyframe = keyframes[i + 1];

      // Motion type is defined by the END keyframe
      const motionType = endKeyframe.motionType || 'joint';

      // Skip segments with no actual motion (e.g., tool-change-only keyframes)
      // Check if all joint angles are identical between consecutive keyframes
      const hasMotion = JOINT_NAMES.some(joint =>
        Math.abs(startKeyframe.jointAngles[joint] - endKeyframe.jointAngles[joint]) > 0.01
      );

      if (!hasMotion) {
        continue; // Skip this segment - no motion occurred
      }

      // Get tool for this segment (uses START keyframe's tool)
      const segmentTool = getToolForSegment(startKeyframe, availableTools, computationTool);

      if (motionType === 'joint') {
        // Joint motion: Generate path for base iteration and all loop iterations
        // Calculate TCP distance to determine sampling density (path shape independent of timing)

        // Determine how many loop iterations to generate
        const maxLoops = (loopIterations > 1 && (startKeyframe.loopDeltas || endKeyframe.loopDeltas))
          ? loopIterations
          : 1;

        for (let loop = 0; loop < maxLoops; loop++) {
          // Apply loop deltas to keyframes for this iteration
          const startKfForLoop = applyLoopDeltasToKeyframe(startKeyframe, loop);
          const endKfForLoop = applyLoopDeltasToKeyframe(endKeyframe, loop);

          // Re-solve IK for loop-adjusted keyframes to get correct joint angles
          // (applyLoopDeltasToKeyframe only modifies cartesian pose, not joint angles)
          let startJointAngles = startKfForLoop.jointAngles || startKeyframe.jointAngles;
          let endJointAngles = endKfForLoop.jointAngles || endKeyframe.jointAngles;

          // For loop iterations > 0, we need to re-solve IK since the cartesian pose changed
          if (loop > 0 && startKfForLoop.cartesianPose) {
            const ikResult = inverseKinematicsDetailed(
              startKfForLoop.cartesianPose,
              startKeyframe.jointAngles, // Use original as seed
              computationRobotRef,
              segmentTool,
              ikAxisMask
            );
            if (ikResult.success && ikResult.jointAngles) {
              startJointAngles = ikResult.jointAngles;
            }
          }

          if (loop > 0 && endKfForLoop.cartesianPose) {
            const ikResult = inverseKinematicsDetailed(
              endKfForLoop.cartesianPose,
              endKeyframe.jointAngles, // Use original as seed
              computationRobotRef,
              segmentTool,
              ikAxisMask
            );
            if (ikResult.success && ikResult.jointAngles) {
              endJointAngles = ikResult.jointAngles;
            }
          }

          // Calculate start TCP position using segment-specific tool and loop-adjusted joint angles
          applyJointAnglesToUrdf(computationRobotRef, startJointAngles);
          const startTcpPose = calculateTcpPoseFromUrdf(computationRobotRef, segmentTool.tcp_offset);

          // Calculate end TCP position using segment-specific tool and loop-adjusted joint angles
          applyJointAnglesToUrdf(computationRobotRef, endJointAngles);
          const endTcpPose = calculateTcpPoseFromUrdf(computationRobotRef, segmentTool.tcp_offset);

          // Calculate Cartesian distance (in mm)
          let distance = 0;
          if (startTcpPose && endTcpPose) {
            const dx = endTcpPose.X - startTcpPose.X;
            const dy = endTcpPose.Y - startTcpPose.Y;
            const dz = endTcpPose.Z - startTcpPose.Z;
            distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
          }

          // Calculate number of samples based on distance (not time!)
          const numSamples = calculateSamplesFromDistance(distance);

          // Duration still needed for interpolation (but not for sample count!)
          const duration = endKfForLoop.time - startKfForLoop.time;

          const loopPoints: PathPoint[] = [];

          for (let j = 0; j <= numSamples; j++) {
            // Interpolate directly between loop-adjusted start and end joint angles
            const alpha = j / numSamples; // 0 to 1
            const jointAngles: JointAngles = {
              J1: startJointAngles.J1 + (endJointAngles.J1 - startJointAngles.J1) * alpha,
              J2: startJointAngles.J2 + (endJointAngles.J2 - startJointAngles.J2) * alpha,
              J3: startJointAngles.J3 + (endJointAngles.J3 - startJointAngles.J3) * alpha,
              J4: startJointAngles.J4 + (endJointAngles.J4 - startJointAngles.J4) * alpha,
              J5: startJointAngles.J5 + (endJointAngles.J5 - startJointAngles.J5) * alpha,
              J6: startJointAngles.J6 + (endJointAngles.J6 - startJointAngles.J6) * alpha
            };

            if (jointAngles) {
              // Apply joint angles to computation robot using centralized helper
              applyJointAnglesToUrdf(computationRobotRef, jointAngles);

              // Calculate TCP pose using segment-specific tool (returns Three.js coordinates in mm)
              const tcpPose = calculateTcpPoseFromUrdf(computationRobotRef, segmentTool.tcp_offset);

              if (tcpPose) {
                // tcpPose is in mm, convert to meters for Three.js scene
                loopPoints.push({
                  position: new THREE.Vector3(
                    tcpPose.X / 1000,
                    tcpPose.Y / 1000,
                    tcpPose.Z / 1000
                  ),
                  orientation: new THREE.Euler(
                    tcpPose.RX * Math.PI / 180,
                    tcpPose.RY * Math.PI / 180,
                    tcpPose.RZ * Math.PI / 180,
                    'XYZ'
                  ),
                  valid: true
                });
              }
            }
          }

          // Add segment for this loop iteration
          if (loopPoints.length > 0) {
            segments.push({
              points: loopPoints,
              motionType,
              startKeyframe,
              endKeyframe,
              loopIteration: loop
            });
          }
        }
      } else {
        // Cartesian motion: Use cached trajectory if available
        if (!startKeyframe.cartesianPose || !endKeyframe.cartesianPose) {
          // Can't generate cartesian path without poses
          continue;
        }

        try {
          // Generate base path (loop 0) and all loop iterations if applicable
          const maxLoops = (loopIterations > 1 && (startKeyframe.loopDeltas || endKeyframe.loopDeltas))
            ? loopIterations
            : 1;

          for (let loop = 0; loop < maxLoops; loop++) {
            // Check cache for this loop iteration
            const baseCacheKey = `${startKeyframe.id}_${endKeyframe.id}`;
            const cacheKey = loop > 0 ? `${baseCacheKey}_loop${loop}` : baseCacheKey;
            const cachedTrajectory = useTimelineStore.getState().getCachedTrajectory(cacheKey);

            if (!cachedTrajectory) {
              if (loop === 0) {
                logger.warn(`No cached trajectory for segment ${cacheKey} - skipping visualization`, 'PathViz');
              }
              continue;
            }

            const loopPoints: PathPoint[] = [];

            // Use cached trajectory - sample every 20th waypoint (0.2s at 100Hz)
            const SAMPLE_INTERVAL = 20;
            const waypoints = cachedTrajectory.waypointPoses;
            const ikValid = cachedTrajectory.ikValid;

            // Debug: Log validity distribution (only for base path)
            if (loop === 0) {
              const validCount = ikValid.filter(v => v).length;
              const invalidCount = ikValid.filter(v => !v).length;
              logger.debug(`Segment ${cacheKey}: ${validCount} valid, ${invalidCount} invalid out of ${ikValid.length} waypoints`, 'PathViz');
            }

            for (let j = 0; j < waypoints.length; j += SAMPLE_INTERVAL) {
              const waypointPose = waypoints[j];

              // Check validity of this specific waypoint
              const isValid = ikValid[j];

              // Waypoint poses are in robot coordinates - convert to Three.js coordinates
              const threeJsPose = robotToThreeJs(waypointPose);

              loopPoints.push({
                position: new THREE.Vector3(
                  threeJsPose.X / 1000,  // Convert mm to meters
                  threeJsPose.Y / 1000,
                  threeJsPose.Z / 1000
                ),
                orientation: new THREE.Euler(
                  threeJsPose.RX * Math.PI / 180,
                  threeJsPose.RY * Math.PI / 180,
                  threeJsPose.RZ * Math.PI / 180,
                  'XYZ'
                ),
                valid: isValid
              });
            }

            // Always include the final waypoint to ensure line connects to keyframe
            const lastIndex = waypoints.length - 1;
            const lastSampledIndex = Math.floor(lastIndex / SAMPLE_INTERVAL) * SAMPLE_INTERVAL;
            if (lastIndex !== lastSampledIndex && lastIndex > 0) {
              const finalWaypoint = waypoints[lastIndex];
              const isValid = ikValid[lastIndex];
              const threeJsPose = robotToThreeJs(finalWaypoint);

              loopPoints.push({
                position: new THREE.Vector3(
                  threeJsPose.X / 1000,
                  threeJsPose.Y / 1000,
                  threeJsPose.Z / 1000
                ),
                orientation: new THREE.Euler(
                  threeJsPose.RX * Math.PI / 180,
                  threeJsPose.RY * Math.PI / 180,
                  threeJsPose.RZ * Math.PI / 180,
                  'XYZ'
                ),
                valid: isValid
              });
            }

            if (loopPoints.length > 0) {
              segments.push({
                points: loopPoints,
                motionType,
                startKeyframe,
                endKeyframe,
                loopIteration: loop
              });
            }
          }
        } catch (error) {
          logger.error('Failed to generate cartesian waypoints', 'PathViz', error);
          continue;
        }
      }
    }

    return segments;
  }, [keyframes, trajectoryCache, computationRobotRef, computationTool, availableTools]);

  // Clear old geometries when segments change
  useEffect(() => {
    return () => {
      if (groupRef.current) {
        groupRef.current.children.forEach((child) => {
          if (child instanceof THREE.Line || child instanceof THREE.Points) {
            child.geometry.dispose();
            if (Array.isArray(child.material)) {
              child.material.forEach(m => m.dispose());
            } else {
              child.material.dispose();
            }
          }
        });
      }
    };
  }, [pathSegments]);

  if (!visible || pathSegments.length === 0) {
    return null;
  }

  // Get hovered point for orientation gizmo
  const hoveredPoint = hoveredSegmentIndex !== null && hoveredPointIndex !== null
    ? pathSegments[hoveredSegmentIndex]?.points[hoveredPointIndex]
    : null;

  return (
    <group ref={groupRef}>
      {/* Orientation gizmo on hovered waypoint */}
      {hoveredPoint && (
        <PathOrientationGizmo
          position={hoveredPoint.position}
          orientation={hoveredPoint.orientation}
        />
      )}

      {/* Path segments (lines and waypoint markers) */}
      {pathSegments.map((segment, segmentIdx) => {
        const isJoint = segment.motionType === 'joint';
        const baseColor = isJoint ? 0xff9800 : 0x00bcd4; // Orange for joint, cyan for cartesian
        const isLoopPath = (segment.loopIteration || 0) > 0;
        const pathOpacity = isLoopPath ? 0.5 : 0.75; // Dimmed for loop paths

        // Create unique key that changes when segment data changes to force remount
        const segmentKey = `${segment.startKeyframe.id}_${segment.endKeyframe.id}_loop${segment.loopIteration || 0}_pts${segment.points.length}`;

        // For cartesian segments, split into valid/invalid sub-segments
        if (!isJoint) {
          const validSegments: PathPoint[][] = [];
          const invalidSegments: PathPoint[][] = [];
          let currentValid: PathPoint[] = [];
          let currentInvalid: PathPoint[] = [];

          segment.points.forEach((point, i) => {
            if (point.valid) {
              if (currentInvalid.length > 0) {
                // Add connecting point to invalid segment
                currentInvalid.push(point);
                invalidSegments.push(currentInvalid);
                currentInvalid = [];
              }
              currentValid.push(point);
            } else {
              if (currentValid.length > 0) {
                // Add connecting point to valid segment
                if (i > 0) {
                  currentValid.push(point);
                }
                validSegments.push(currentValid);
                currentValid = [];
              }
              currentInvalid.push(point);
            }
          });

          if (currentValid.length > 0) validSegments.push(currentValid);
          if (currentInvalid.length > 0) invalidSegments.push(currentInvalid);

          return (
            <group key={segmentKey}>
              {/* Valid cartesian segments (cyan) */}
              {validSegments.map((points, subIdx) => {
                if (points.length < 2) return null;

                const positions = new Float32Array(points.length * 3);
                points.forEach((p, i) => {
                  positions[i * 3] = p.position.x;
                  positions[i * 3 + 1] = p.position.y;
                  positions[i * 3 + 2] = p.position.z;
                });

                // Calculate starting point index for this sub-segment
                const startPointIdx = segment.points.indexOf(points[0]);

                return (
                  <group key={`valid-${subIdx}`}>
                    {/* Path line */}
                    <line>
                      <bufferGeometry>
                        <bufferAttribute
                          attach="attributes-position"
                          count={points.length}
                          array={positions}
                          itemSize={3}
                        />
                      </bufferGeometry>
                      <lineBasicMaterial color={baseColor} transparent opacity={pathOpacity} linewidth={2} />
                    </line>

                    {/* Waypoint markers as hoverable spheres */}
                    <Instances limit={points.length}>
                      <sphereGeometry args={[0.0012, 8, 8]} />
                      <meshBasicMaterial color={baseColor} transparent opacity={isLoopPath ? 0.5 : 1.0} />
                      {points.map((point, idx) => (
                        <Instance
                          key={idx}
                          position={point.position}
                          onPointerEnter={() => {
                            setHoveredSegmentIndex(segmentIdx);
                            setHoveredPointIndex(startPointIdx + idx);
                          }}
                          onPointerLeave={() => {
                            setHoveredSegmentIndex(null);
                            setHoveredPointIndex(null);
                          }}
                        />
                      ))}
                    </Instances>
                  </group>
                );
              })}

              {/* Invalid cartesian segments (red) */}
              {invalidSegments.map((points, subIdx) => {
                if (points.length < 2) return null;

                const positions = new Float32Array(points.length * 3);
                points.forEach((p, i) => {
                  positions[i * 3] = p.position.x;
                  positions[i * 3 + 1] = p.position.y;
                  positions[i * 3 + 2] = p.position.z;
                });

                // Calculate starting point index for this sub-segment
                const startPointIdx = segment.points.indexOf(points[0]);

                return (
                  <group key={`invalid-${subIdx}`}>
                    {/* Path line */}
                    <line>
                      <bufferGeometry>
                        <bufferAttribute
                          attach="attributes-position"
                          count={points.length}
                          array={positions}
                          itemSize={3}
                        />
                      </bufferGeometry>
                      <lineBasicMaterial color={0xf44336} transparent opacity={pathOpacity} linewidth={2} />
                    </line>

                    {/* Waypoint markers as hoverable spheres */}
                    <Instances limit={points.length}>
                      <sphereGeometry args={[0.0012, 8, 8]} />
                      <meshBasicMaterial color={0xf44336} transparent opacity={isLoopPath ? 0.5 : 1.0} />
                      {points.map((point, idx) => (
                        <Instance
                          key={idx}
                          position={point.position}
                          onPointerEnter={() => {
                            setHoveredSegmentIndex(segmentIdx);
                            setHoveredPointIndex(startPointIdx + idx);
                          }}
                          onPointerLeave={() => {
                            setHoveredSegmentIndex(null);
                            setHoveredPointIndex(null);
                          }}
                        />
                      ))}
                    </Instances>
                  </group>
                );
              })}
            </group>
          );
        }

        // Joint segment (simple, all valid)
        const positions = new Float32Array(segment.points.length * 3);
        segment.points.forEach((p, i) => {
          positions[i * 3] = p.position.x;
          positions[i * 3 + 1] = p.position.y;
          positions[i * 3 + 2] = p.position.z;
        });

        return (
          <group key={segmentKey}>
            {/* Path line */}
            <line>
              <bufferGeometry>
                <bufferAttribute
                  attach="attributes-position"
                  count={segment.points.length}
                  array={positions}
                  itemSize={3}
                />
              </bufferGeometry>
              <lineBasicMaterial color={baseColor} transparent opacity={pathOpacity} linewidth={2} />
            </line>

            {/* Waypoint markers as hoverable spheres */}
            <Instances limit={segment.points.length}>
              <sphereGeometry args={[0.0012, 8, 8]} />
              <meshBasicMaterial color={baseColor} transparent opacity={isLoopPath ? 0.5 : 1.0} />
              {segment.points.map((point, idx) => (
                <Instance
                  key={idx}
                  position={point.position}
                  onPointerEnter={() => {
                    setHoveredSegmentIndex(segmentIdx);
                    setHoveredPointIndex(idx);
                  }}
                  onPointerLeave={() => {
                    setHoveredSegmentIndex(null);
                    setHoveredPointIndex(null);
                  }}
                />
              ))}
            </Instances>
          </group>
        );
      })}

      {/* Keyframe position markers - Valid IK (green) */}
      <Instances limit={keyframes.length}>
        <sphereGeometry args={[0.0036, 8, 8]} />
        <meshBasicMaterial color={0x4caf50} />
        {keyframes.filter(kf => kf.cartesianPose && kf.jointAngles).map((kf) => {
          const threeJsPose = robotToThreeJs({
            X: kf.cartesianPose!.X,
            Y: kf.cartesianPose!.Y,
            Z: kf.cartesianPose!.Z,
            RX: kf.cartesianPose!.RX,
            RY: kf.cartesianPose!.RY,
            RZ: kf.cartesianPose!.RZ
          });
          const position = new THREE.Vector3(
            threeJsPose.X / 1000,  // Convert mm to meters
            threeJsPose.Y / 1000,
            threeJsPose.Z / 1000
          );
          return <Instance key={`kf-valid-${kf.id}`} position={position} />;
        })}
      </Instances>

      {/* Keyframe position markers - Invalid IK (red) */}
      <Instances limit={keyframes.length}>
        <sphereGeometry args={[0.0036, 8, 8]} />
        <meshBasicMaterial color={0xf44336} />
        {keyframes.filter(kf => kf.cartesianPose && !kf.jointAngles).map((kf) => {
          const threeJsPose = robotToThreeJs({
            X: kf.cartesianPose!.X,
            Y: kf.cartesianPose!.Y,
            Z: kf.cartesianPose!.Z,
            RX: kf.cartesianPose!.RX,
            RY: kf.cartesianPose!.RY,
            RZ: kf.cartesianPose!.RZ
          });
          const position = new THREE.Vector3(
            threeJsPose.X / 1000,  // Convert mm to meters
            threeJsPose.Y / 1000,
            threeJsPose.Z / 1000
          );
          return <Instance key={`kf-invalid-${kf.id}`} position={position} />;
        })}
      </Instances>

      {/* Loop iteration subdots (blue) */}
      {loopIterations > 1 && keyframes.some(kf => hasLoopDeltas(kf)) && (
        <Instances limit={keyframes.length * loopIterations}>
          <sphereGeometry args={[0.0012, 8, 8]} />
          <meshBasicMaterial color={0x2196f3} transparent opacity={0.6} />
          {keyframes.flatMap((kf) => {
            if (!hasLoopDeltas(kf)) return [];
            return [...Array(loopIterations)].map((_, loopIdx) => {
              const effectivePose = getEffectiveCartesianPose(kf, loopIdx);
              if (!effectivePose) return null;

              const threeJsPose = robotToThreeJs({
                X: effectivePose.X,
                Y: effectivePose.Y,
                Z: effectivePose.Z,
                RX: effectivePose.RX,
                RY: effectivePose.RY,
                RZ: effectivePose.RZ
              });

              const position = new THREE.Vector3(
                threeJsPose.X / 1000,  // Convert mm to meters
                threeJsPose.Y / 1000,
                threeJsPose.Z / 1000
              );

              return <Instance key={`loop-${kf.id}-${loopIdx}`} position={position} />;
            });
          })}
        </Instances>
      )}
    </group>
  );
}
