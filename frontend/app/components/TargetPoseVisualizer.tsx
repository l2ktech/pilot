import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useInputStore, useTimelineStore } from '@/app/lib/stores';
import { robotToThreeJs } from '@/app/lib/coordinateTransform';

/**
 * Visualizes the INPUT cartesian pose that the user is controlling via sliders
 * This shows where the user wants the TCP to go (red/green/blue gizmo)
 * (IK will be computed later during playback to make the robot follow this target)
 * Only shown in cartesian mode - hidden in joint mode
 *
 * NOTE: Input pose is in robot coordinates (Z-up), converted to Three.js (Y-up) for rendering
 */
export default function TargetPoseVisualizer() {
  const parentGroupRef = useRef<THREE.Group>(null);  // Coordinate frame wrapper (-90° X)
  const groupRef = useRef<THREE.Group>(null);         // User orientation (RX, RY, RZ)
  const xArrowRef = useRef<THREE.ArrowHelper | null>(null);
  const yArrowRef = useRef<THREE.ArrowHelper | null>(null);
  const zArrowRef = useRef<THREE.ArrowHelper | null>(null);

  const inputCartesianPose = useInputStore((state) => state.inputCartesianPose);
  const motionMode = useTimelineStore((state) => state.timeline.mode);

  // Only show this gizmo in cartesian mode - it represents a cartesian target
  if (motionMode !== 'cartesian') {
    return null;
  }

  // Create arrows on mount
  useEffect(() => {
    if (!groupRef.current) return;

    // Arrow length in meters (50mm = 0.05m)
    const arrowLength = 0.05;
    const arrowHeadLength = arrowLength * 0.2;
    const arrowHeadWidth = arrowLength * 0.15;

    // X axis - Red (standard +X direction)
    xArrowRef.current = new THREE.ArrowHelper(
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 0, 0),
      arrowLength,
      0xff0000,
      arrowHeadLength,
      arrowHeadWidth
    );

    // Y axis - Green (standard +Y direction)
    yArrowRef.current = new THREE.ArrowHelper(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, 0, 0),
      arrowLength,
      0x00ff00,
      arrowHeadLength,
      arrowHeadWidth
    );

    // Z axis - Blue (standard +Z direction)
    zArrowRef.current = new THREE.ArrowHelper(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 0, 0),
      arrowLength,
      0x0000ff,
      arrowHeadLength,
      arrowHeadWidth
    );

    groupRef.current.add(xArrowRef.current);
    groupRef.current.add(yArrowRef.current);
    groupRef.current.add(zArrowRef.current);

    return () => {
      // Properly dispose of ArrowHelpers to prevent memory leaks
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

  // Update input pose position and orientation every frame
  useFrame(() => {
    if (!parentGroupRef.current || !groupRef.current) return;

    // Convert input pose from robot coordinates (Z-up) to Three.js (Y-up) for rendering
    const threeJsPose = robotToThreeJs(inputCartesianPose);

    // Set parent position in Three.js space (convert mm to meters)
    parentGroupRef.current.position.set(
      threeJsPose.X / 1000,   // X (same in both)
      threeJsPose.Y / 1000,   // Y (was robot Z)
      threeJsPose.Z / 1000    // Z (was robot -Y)
    );

    // Parent: Apply coordinate frame wrapper (-90° around X) to match URDF
    parentGroupRef.current.rotation.set(-Math.PI / 2, 0, 0, 'XYZ');

    // Child: Apply user's robot coordinate orientation (RX, RY, RZ)
    groupRef.current.rotation.order = 'XYZ';
    groupRef.current.rotation.set(
      (inputCartesianPose.RX * Math.PI) / 180,  // Rotation around robot X
      (inputCartesianPose.RY * Math.PI) / 180,  // Rotation around robot Y
      (inputCartesianPose.RZ * Math.PI) / 180   // Rotation around robot Z
    );
  });

  return (
    <group ref={parentGroupRef}>
      <group ref={groupRef} />
    </group>
  );
}
