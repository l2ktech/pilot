/**
 * Loop Variables Utility
 * Applies loop-scoped variable deltas to keyframes for iterative timeline execution
 */

import type { Keyframe, CartesianPose, CartesianAxis } from './types';

/**
 * Apply loop deltas to a keyframe's cartesian pose
 *
 * @param keyframe - The base keyframe to modify
 * @param loopIteration - Current loop iteration (0-based)
 * @returns Modified keyframe with deltas applied to cartesian pose
 *
 * @example
 * // Keyframe with Z=100mm and loopDelta Z=10mm
 * // Loop 0: Z = 100 + (10 * 0) = 100mm
 * // Loop 1: Z = 100 + (10 * 1) = 110mm
 * // Loop 2: Z = 100 + (10 * 2) = 120mm
 */
export function applyLoopDeltasToKeyframe(
  keyframe: Keyframe,
  loopIteration: number
): Keyframe {
  // If no loop deltas or we're on the first iteration, return unchanged
  if (!keyframe.loopDeltas || loopIteration === 0) {
    return keyframe;
  }

  // If no cartesian pose, can't apply deltas
  if (!keyframe.cartesianPose) {
    return keyframe;
  }

  // Clone the keyframe to avoid mutation
  const modifiedKeyframe: Keyframe = {
    ...keyframe,
    cartesianPose: { ...keyframe.cartesianPose }
  };

  // Apply delta for each axis that has one
  const axes: CartesianAxis[] = ['X', 'Y', 'Z', 'RX', 'RY', 'RZ'];
  axes.forEach(axis => {
    const delta = keyframe.loopDeltas?.[axis];
    if (delta !== undefined && delta !== 0) {
      modifiedKeyframe.cartesianPose![axis] += delta * loopIteration;
    }
  });

  return modifiedKeyframe;
}

/**
 * Apply loop deltas to all keyframes in a timeline for a specific iteration
 *
 * @param keyframes - Array of base keyframes
 * @param loopIteration - Current loop iteration (0-based)
 * @returns Array of modified keyframes with deltas applied
 */
export function applyLoopDeltasToTimeline(
  keyframes: Keyframe[],
  loopIteration: number
): Keyframe[] {
  return keyframes.map(kf => applyLoopDeltasToKeyframe(kf, loopIteration));
}

/**
 * Calculate the effective cartesian pose for a keyframe at a given loop iteration
 *
 * @param keyframe - The base keyframe
 * @param loopIteration - Current loop iteration (0-based)
 * @returns The effective cartesian pose with deltas applied, or null if no pose exists
 */
export function getEffectiveCartesianPose(
  keyframe: Keyframe,
  loopIteration: number
): CartesianPose | null {
  if (!keyframe.cartesianPose) {
    return null;
  }

  const modifiedKeyframe = applyLoopDeltasToKeyframe(keyframe, loopIteration);
  return modifiedKeyframe.cartesianPose || null;
}

/**
 * Pre-calculate all cartesian poses for all loop iterations
 * Useful for validation and preview before execution
 *
 * @param keyframe - The base keyframe
 * @param totalIterations - Total number of loop iterations
 * @returns Array of cartesian poses, one for each iteration
 */
export function preCalculateLoopPoses(
  keyframe: Keyframe,
  totalIterations: number
): (CartesianPose | null)[] {
  const poses: (CartesianPose | null)[] = [];

  for (let i = 0; i < totalIterations; i++) {
    poses.push(getEffectiveCartesianPose(keyframe, i));
  }

  return poses;
}

/**
 * Check if a keyframe has any non-zero loop deltas
 *
 * @param keyframe - The keyframe to check
 * @returns True if the keyframe has at least one non-zero loop delta
 */
export function hasLoopDeltas(keyframe: Keyframe): boolean {
  if (!keyframe.loopDeltas) {
    return false;
  }

  const axes: CartesianAxis[] = ['X', 'Y', 'Z', 'RX', 'RY', 'RZ'];
  return axes.some(axis => {
    const delta = keyframe.loopDeltas?.[axis];
    return delta !== undefined && delta !== 0;
  });
}

/**
 * Generate a human-readable description of loop deltas for a keyframe
 *
 * @param keyframe - The keyframe with loop deltas
 * @returns Description string, or null if no deltas
 */
export function describeLoopDeltas(keyframe: Keyframe): string | null {
  if (!hasLoopDeltas(keyframe)) {
    return null;
  }

  const descriptions: string[] = [];
  const axes: CartesianAxis[] = ['X', 'Y', 'Z', 'RX', 'RY', 'RZ'];

  axes.forEach(axis => {
    const delta = keyframe.loopDeltas?.[axis];
    if (delta !== undefined && delta !== 0) {
      const unit = ['X', 'Y', 'Z'].includes(axis) ? 'mm' : '°';
      const sign = delta > 0 ? '+' : '';
      descriptions.push(`${axis}: ${sign}${delta}${unit}/loop`);
    }
  });

  return descriptions.join(', ');
}
