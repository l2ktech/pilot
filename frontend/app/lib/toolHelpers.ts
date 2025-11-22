/**
 * Tool Helper Functions
 * Utilities for resolving tools based on keyframe state and timeline position
 */

import type { Keyframe, Tool } from './types';

/**
 * Get the tool that should be active at a given time in the timeline.
 * Returns the tool from the current or most recent keyframe.
 *
 * @param keyframes - Array of keyframes (doesn't need to be sorted)
 * @param time - Current time in seconds
 * @param allTools - Array of all available tools
 * @param fallback - Fallback tool if no tool found
 * @returns Tool object to use at the given time
 */
export function getToolAtTime(
  keyframes: Keyframe[],
  time: number,
  allTools: Tool[],
  fallback: Tool
): Tool {
  // Sort keyframes by time
  const sorted = [...keyframes].sort((a, b) => a.time - b.time);

  // Find current or most recent keyframe with a toolId
  // Walk backwards from current time
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].time <= time && sorted[i].toolId) {
      const tool = allTools.find(t => t.id === sorted[i].toolId);
      if (tool) {
        return tool;
      }
    }
  }

  // No tool found in any keyframe before this time
  return fallback;
}

/**
 * Get the tool for a specific timeline segment.
 * Uses the tool from the START keyframe of the segment.
 *
 * @param startKeyframe - The keyframe at the start of the segment
 * @param allTools - Array of all available tools
 * @param fallback - Fallback tool if keyframe has no toolId
 * @returns Tool object to use for this segment
 */
export function getToolForSegment(
  startKeyframe: Keyframe,
  allTools: Tool[],
  fallback: Tool
): Tool {
  if (!startKeyframe.toolId) {
    return fallback;
  }

  const tool = allTools.find(t => t.id === startKeyframe.toolId);
  return tool || fallback;
}

/**
 * Get tool by ID from array of tools.
 *
 * @param toolId - ID of the tool to find
 * @param allTools - Array of all available tools
 * @returns Tool object or null if not found
 */
export function getToolById(
  toolId: string | undefined,
  allTools: Tool[]
): Tool | null {
  if (!toolId) {
    return null;
  }

  return allTools.find(t => t.id === toolId) || null;
}
