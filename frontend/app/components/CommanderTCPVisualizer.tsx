import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useCommandStore, useRobotConfigStore } from '@/app/lib/stores';
import { calculateTcpPoseFromUrdf, tcpPosesAreDifferent } from '@/app/lib/tcpCalculations';
import { threeJsToRobot } from '@/app/lib/coordinateTransform';
import type { CartesianPose } from '@/app/lib/types';

/**
 * Visualizes the COMMANDER TCP position extracted from commander robot URDF model
 * This shows where we're COMMANDING the robot to go (the main colored robot's TCP)
 * Uses orange/cyan/magenta color scheme
 *
 * IMPORTANT: Gets TCP position from URDF L6 link's world transform (accurate through all 6 joints)
 * Converts from Three.js coordinates (Y-up) to robot coordinates (Z-up) before storing
 */
export default function CommanderTCPVisualizer() {
  const parentGroupRef = useRef<THREE.Group>(null);  // Coordinate frame wrapper (-90° X)
  const groupRef = useRef<THREE.Group>(null);         // TCP orientation
  const xArrowRef = useRef<THREE.ArrowHelper | null>(null);
  const yArrowRef = useRef<THREE.ArrowHelper | null>(null);
  const zArrowRef = useRef<THREE.ArrowHelper | null>(null);

  // Track last sent position to avoid unnecessary setState calls
  const lastPositionRef = useRef<CartesianPose | null>(null);

  // Reusable objects to prevent memory leaks (don't create new objects every frame!)
  const l6WorldPosition = useRef(new THREE.Vector3());
  const l6WorldQuaternion = useRef(new THREE.Quaternion());
  const tcpRotationQuat = useRef(new THREE.Quaternion());
  const tcpRotationEuler = useRef(new THREE.Euler());
  const localOffset = useRef(new THREE.Vector3());
  const worldOffset = useRef(new THREE.Vector3());
  const tcpWorldPosition = useRef(new THREE.Vector3());

  const commanderRobotRef = useCommandStore((state) => state.commanderRobotRef);
  const tcpOffset = useRobotConfigStore((state) => state.tcpOffset);

  // Create arrows on mount with distinct styling
  useEffect(() => {
    if (!groupRef.current) return;

    // Arrow size (40mm)
    const arrowLength = 0.04;
    const arrowHeadLength = arrowLength * 0.2;
    const arrowHeadWidth = arrowLength * 0.15;

    // Orange/Cyan/Magenta color scheme for COMMANDER (commanded robot position)
    // Different from cartesian target (red/green/blue) and actual hardware (yellow/lime/purple)
    // Standard orientation - TCP rotation quaternion handles all transformations

    // X axis - Orange (standard +X direction)
    xArrowRef.current = new THREE.ArrowHelper(
      new THREE.Vector3(1, 0, 0),  // Standard X direction
      new THREE.Vector3(0, 0, 0),
      arrowLength,
      0xff8800, // Orange
      arrowHeadLength,
      arrowHeadWidth
    );

    // Y axis - Cyan (standard +Y direction)
    yArrowRef.current = new THREE.ArrowHelper(
      new THREE.Vector3(0, 1, 0),  // Standard Y direction
      new THREE.Vector3(0, 0, 0),
      arrowLength,
      0x00dddd, // Cyan
      arrowHeadLength,
      arrowHeadWidth
    );

    // Z axis - Magenta (standard +Z direction)
    zArrowRef.current = new THREE.ArrowHelper(
      new THREE.Vector3(0, 0, 1),  // Standard Z direction
      new THREE.Vector3(0, 0, 0),
      arrowLength,
      0xdd00dd, // Magenta/Fuchsia
      arrowHeadLength,
      arrowHeadWidth
    );

    groupRef.current.add(xArrowRef.current);
    groupRef.current.add(yArrowRef.current);
    groupRef.current.add(zArrowRef.current);

    return () => {
      // Properly dispose ArrowHelpers to free GPU memory
      if (xArrowRef.current) {
        groupRef.current?.remove(xArrowRef.current);
        xArrowRef.current.dispose();
      }
      if (yArrowRef.current) {
        groupRef.current?.remove(yArrowRef.current);
        yArrowRef.current.dispose();
      }
      if (zArrowRef.current) {
        groupRef.current?.remove(zArrowRef.current);
        zArrowRef.current.dispose();
      }
    };
  }, []);

  // Update commander TCP position every frame from commander URDF robot model
  useFrame(() => {
    if (!parentGroupRef.current || !groupRef.current || !commanderRobotRef) return;

    // Calculate TCP pose from URDF (returns Three.js coordinates)
    const threeJsPose = calculateTcpPoseFromUrdf(commanderRobotRef, tcpOffset);
    if (!threeJsPose) return;

    // Convert Three.js coordinates (Y-up) to robot coordinates (Z-up) for store
    const robotPose = threeJsToRobot(threeJsPose);

    // Update visual arrow group position (for rendering in Three.js space)
    const l6Link = commanderRobotRef.links['L6'];
    if (l6Link) {
      l6Link.updateMatrixWorld(true);

      // Reuse objects to prevent memory leaks (480 objects/sec → 0 objects/sec)
      l6Link.getWorldPosition(l6WorldPosition.current);
      l6Link.getWorldQuaternion(l6WorldQuaternion.current);

      localOffset.current.set(
        tcpOffset.x / 1000,
        tcpOffset.y / 1000,
        tcpOffset.z / 1000
      );

      worldOffset.current.copy(localOffset.current).applyQuaternion(l6WorldQuaternion.current);
      tcpWorldPosition.current.copy(l6WorldPosition.current).add(worldOffset.current);

      // Set parent position
      parentGroupRef.current.position.copy(tcpWorldPosition.current);

      // Parent: Apply coordinate frame wrapper (-90° around X) to match URDF
      parentGroupRef.current.rotation.set(-Math.PI / 2, 0, 0, 'XYZ');

      // Child: Apply TCP orientation from robot coordinates (same approach as RGB gizmo)
      // robotPose already has RX, RY, RZ in robot coordinate frame
      groupRef.current.rotation.order = 'XYZ';
      groupRef.current.rotation.set(
        (robotPose.RX * Math.PI) / 180,  // Rotation around robot X
        (robotPose.RY * Math.PI) / 180,  // Rotation around robot Y
        (robotPose.RZ * Math.PI) / 180   // Rotation around robot Z
      );
    }

    // Store robot coordinates (Z-up) in store - only update if position changed
    if (tcpPosesAreDifferent(robotPose, lastPositionRef.current)) {
      lastPositionRef.current = robotPose;
      useCommandStore.setState({ commandedTcpPose: robotPose });
    }
  });

  return (
    <group ref={parentGroupRef}>
      <group ref={groupRef} />
    </group>
  );
}
