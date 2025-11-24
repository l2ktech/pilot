'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useTimelineStore } from '@/app/lib/stores/timelineStore';
import { useKinematicsStore } from '@/app/lib/stores/kinematicsStore';
import { useRobotConfigStore } from '@/app/lib/stores/robotConfigStore';
import { JOINT_NAMES, JOINT_LIMITS, CARTESIAN_AXES, CARTESIAN_LIMITS } from '@/app/lib/constants';
import { JointAngles, CartesianPose, JointName, CartesianAxis, Tool } from '@/app/lib/types';
import { inverseKinematicsDetailed } from '@/app/lib/kinematics';
import { calculateTcpPoseFromUrdf } from '@/app/lib/tcpCalculations';
import { threeJsToRobot } from '@/app/lib/coordinateTransform';
import { applyJointAnglesToUrdf } from '@/app/lib/urdfHelpers';
import { ArrowLeftRight, Calculator, AlertCircle, Check } from 'lucide-react';
import { logger } from '@/app/lib/logger';
import { getApiBaseUrl } from '@/app/lib/apiConfig';

interface KeyframeEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  keyframeId: string | null;
}

export default function KeyframeEditDialog({
  open,
  onOpenChange,
  keyframeId
}: KeyframeEditDialogProps) {
  const keyframes = useTimelineStore((state) => state.timeline.keyframes);
  const updateKeyframeValues = useTimelineStore((state) => state.updateKeyframeValues);
  const loopIterations = useTimelineStore((state) => state.timeline.loopIterations);
  const updateKeyframe = useTimelineStore((state) => state.updateKeyframe);
  const computationRobotRef = useKinematicsStore((state) => state.computationRobotRef);
  const computationTool = useKinematicsStore((state) => state.computationTool);
  const tcpOffset = useRobotConfigStore((state) => state.tcpOffset);
  const ikAxisMask = useRobotConfigStore((state) => state.ikAxisMask);

  // Find the keyframe being edited
  const keyframe = keyframes.find(kf => kf.id === keyframeId);

  // Local state for editing
  const [localJointAngles, setLocalJointAngles] = useState<JointAngles | null>(null);
  const [localCartesianPose, setLocalCartesianPose] = useState<CartesianPose | null>(null);
  const [localToolId, setLocalToolId] = useState<string | null>(null);
  const [localGripperState, setLocalGripperState] = useState<'open' | 'closed' | null>(null);
  const [localLoopDeltas, setLocalLoopDeltas] = useState<Partial<CartesianPose>>({});
  const [ikError, setIkError] = useState<string | null>(null);
  const [fkError, setFkError] = useState<string | null>(null);

  // Available tools from backend
  const [availableTools, setAvailableTools] = useState<Tool[]>([]);
  const [toolsLoading, setToolsLoading] = useState(false);

  // Track input field values for typing
  const [inputValues, setInputValues] = useState<Record<string, string>>({});

  // Fetch available tools on mount
  useEffect(() => {
    const fetchTools = async () => {
      setToolsLoading(true);
      try {
        const response = await fetch(`${getApiBaseUrl()}/api/config/tools`);
        if (!response.ok) {
          throw new Error(`Failed to fetch tools: ${response.statusText}`);
        }
        const data = await response.json();
        setAvailableTools(data.tools || []);
      } catch (error) {
        logger.error('Failed to fetch tools', 'KeyframeEditDialog', error);
      } finally {
        setToolsLoading(false);
      }
    };
    fetchTools();
  }, []);

  // Initialize local state when keyframe changes
  useEffect(() => {
    if (keyframe) {
      // Test frontend → backend logging
      logger.info(`Opening keyframe edit dialog for keyframe at ${keyframe.time.toFixed(2)}s`, 'KeyframeEditDialog');

      setLocalJointAngles(keyframe.jointAngles);

      // Use stored cartesian pose if available, otherwise will compute on FK button click
      setLocalCartesianPose(keyframe.cartesianPose || {
        X: 0, Y: 0, Z: 300, RX: 0, RY: 0, RZ: 0
      });

      // Initialize tool state from keyframe
      setLocalToolId(keyframe.toolId || null);
      setLocalGripperState(keyframe.gripperState || null);

      // Initialize loop deltas from keyframe
      setLocalLoopDeltas(keyframe.loopDeltas || {});

      setIkError(null);
      setFkError(null);
      setInputValues({});
    }
  }, [keyframe, computationRobotRef, computationTool]);

  // Auto-IK: Solve IK when cartesian pose changes (debounced)
  useEffect(() => {
    if (!localCartesianPose || !computationRobotRef || !localJointAngles) {
      return;
    }

    // Debounce IK solving to avoid excessive computation during typing
    const timeoutId = setTimeout(() => {
      setIkError(null);

      const ikResult = inverseKinematicsDetailed(
        localCartesianPose,
        localJointAngles, // Use current joint angles as seed
        computationRobotRef,
        computationTool,
        ikAxisMask
      );

      if (ikResult.success && ikResult.jointAngles) {
        setLocalJointAngles(ikResult.jointAngles);
        setIkError(null);
      } else {
        // Don't block user - just show warning
        setIkError(ikResult.error?.message || 'Position may be unreachable');
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(timeoutId);
  }, [localCartesianPose, computationRobotRef, computationTool, ikAxisMask]); // Intentionally omit localJointAngles to avoid loop

  if (!keyframe || !localJointAngles || !localCartesianPose) {
    return null;
  }

  // Handle joint angle changes
  const handleJointChange = (joint: JointName, value: number) => {
    const newJointAngles = { ...localJointAngles, [joint]: value };
    setLocalJointAngles(newJointAngles);
    setInputValues({ ...inputValues, [joint]: '' });
  };

  // Handle cartesian value changes
  const handleCartesianChange = (axis: CartesianAxis, value: number) => {
    const newCartesianPose = { ...localCartesianPose, [axis]: value };
    setLocalCartesianPose(newCartesianPose);
    setInputValues({ ...inputValues, [axis]: '' });
  };

  // Handle loop delta changes
  const handleLoopDeltaChange = (axis: CartesianAxis, value: number) => {
    const newLoopDeltas = { ...localLoopDeltas };
    if (value === 0) {
      // Remove the delta if it's 0
      delete newLoopDeltas[axis];
    } else {
      newLoopDeltas[axis] = value;
    }
    setLocalLoopDeltas(newLoopDeltas);
  };

  // Sync cartesian to joint (FK)
  const handleFK = () => {
    if (!computationRobotRef) {
      setFkError('Robot model not loaded');
      return;
    }

    setFkError(null);

    try {
      // Apply joint angles to computation robot using centralized helper
      applyJointAnglesToUrdf(computationRobotRef, localJointAngles);

      // Compute FK from updated robot pose
      const fkPoseThreeJs = calculateTcpPoseFromUrdf(computationRobotRef, computationTool.tcp_offset);
      if (fkPoseThreeJs) {
        // Convert from Three.js coordinates (Y-up) to robot coordinates (Z-up)
        const fkPoseRobot = threeJsToRobot(fkPoseThreeJs);
        setLocalCartesianPose(fkPoseRobot);
      } else {
        setFkError('FK computation failed');
      }
    } catch (error) {
      setFkError(error instanceof Error ? error.message : 'FK failed');
    }
  };

  // Save changes
  const handleSave = () => {
    // Use updateKeyframe instead to include tool state
    const updates: any = {
      jointAngles: localJointAngles,
      cartesianPose: localCartesianPose,
    };
    if (localToolId) {
      updates.toolId = localToolId;
    }
    if (localGripperState) {
      updates.gripperState = localGripperState;
    }
    // Include loop deltas if they exist
    if (Object.keys(localLoopDeltas).length > 0) {
      updates.loopDeltas = localLoopDeltas;
    }

    const updateKeyframe = useTimelineStore.getState().updateKeyframe;
    updateKeyframe(keyframe.id, updates);
    onOpenChange(false);
  };

  // Cancel changes
  const handleCancel = () => {
    onOpenChange(false);
  };

  const getUnit = (axis: CartesianAxis) => {
    return ['X', 'Y', 'Z'].includes(axis) ? 'mm' : '°';
  };

  const handleInputChange = (key: string, value: string) => {
    setInputValues({ ...inputValues, [key]: value });
  };

  const handleInputBlur = (key: string, isJoint: boolean) => {
    const value = inputValues[key];
    if (value !== undefined && value !== '') {
      const numValue = parseFloat(value);
      if (!isNaN(numValue)) {
        if (isJoint) {
          const joint = key as JointName;
          const limits = JOINT_LIMITS[joint];
          const clampedValue = Math.max(limits.min, Math.min(limits.max, numValue));
          handleJointChange(joint, clampedValue);
        } else {
          const axis = key as CartesianAxis;
          const limits = CARTESIAN_LIMITS[axis];
          const clampedValue = Math.max(limits.min, Math.min(limits.max, numValue));
          handleCartesianChange(axis, clampedValue);
        }
      }
    }
    setInputValues({ ...inputValues, [key]: '' });
  };

  const handleInputKeyDown = (key: string, isJoint: boolean, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Keyframe at {keyframe.time.toFixed(2)}s</DialogTitle>
          <DialogDescription>
            Adjust joint angles or cartesian pose. Use IK/FK to sync between them.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-[1fr_auto_1fr] gap-6 mt-4">
          {/* Left Column: Joint Angles */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold mb-3">Joint Angles</h3>
            {JOINT_NAMES.map((joint) => {
              const limits = JOINT_LIMITS[joint];
              const currentValue = localJointAngles[joint];
              const displayValue = inputValues[joint] !== undefined && inputValues[joint] !== ''
                ? inputValues[joint]
                : currentValue.toFixed(1);

              return (
                <div key={joint} className="space-y-2">
                  <div className="flex justify-between items-center text-sm gap-2">
                    <span className="font-medium w-8">{joint}</span>
                    <div className="flex items-center gap-1">
                      <Input
                        type="text"
                        value={displayValue}
                        onChange={(e) => handleInputChange(joint, e.target.value)}
                        onBlur={() => handleInputBlur(joint, true)}
                        onKeyDown={(e) => handleInputKeyDown(joint, true, e)}
                        className="w-20 h-7 px-2 text-xs font-mono text-right"
                      />
                      <span className="text-xs text-muted-foreground w-4">°</span>
                    </div>
                  </div>
                  <Slider
                    min={limits.min}
                    max={limits.max}
                    step={0.1}
                    value={[currentValue]}
                    onValueChange={(values) => handleJointChange(joint, values[0])}
                    className="w-full"
                  />
                </div>
              );
            })}
          </div>

          {/* Middle Column: Sync & Status */}
          <div className="flex flex-col justify-center items-center gap-4 min-w-[120px]">
            {/* IK Status Indicator */}
            <div className="flex flex-col items-center gap-2">
              {!ikError ? (
                <div className="flex items-center gap-2 text-green-500">
                  <Check className="w-4 h-4" />
                  <span className="text-xs">IK Valid</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-yellow-500" title={ikError}>
                  <AlertCircle className="w-4 h-4" />
                  <span className="text-xs">IK Warning</span>
                </div>
              )}
              <div className="text-xs text-muted-foreground text-center">
                (Auto-computed)
              </div>
            </div>

            {/* FK Button for manual joint edits */}
            <Button
              onClick={handleFK}
              variant="outline"
              size="sm"
              className="w-full"
              title="Forward Kinematics: Update cartesian pose from manual joint angle changes"
            >
              <ArrowLeftRight className="w-4 h-4 mr-2" />
              Sync FK →
            </Button>

            {ikError && (
              <div className="bg-yellow-500/10 border border-yellow-500/50 rounded p-2 flex items-start gap-2">
                <AlertCircle className="w-3 h-3 text-yellow-500 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-yellow-400">{ikError}</div>
              </div>
            )}

            {fkError && (
              <div className="bg-red-500/10 border border-red-500/50 rounded p-2 flex items-start gap-2">
                <AlertCircle className="w-3 h-3 text-red-500 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-red-400">{fkError}</div>
              </div>
            )}
          </div>

          {/* Right Column: Cartesian Pose */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold mb-3">Cartesian Pose</h3>
            {CARTESIAN_AXES.map((axis) => {
              const limits = CARTESIAN_LIMITS[axis];
              const unit = getUnit(axis);
              const step = ['X', 'Y', 'Z'].includes(axis) ? 1 : 0.1;
              const currentValue = localCartesianPose[axis];
              const displayValue = inputValues[axis] !== undefined && inputValues[axis] !== ''
                ? inputValues[axis]
                : currentValue.toFixed(1);
              const loopDelta = localLoopDeltas[axis] || 0;
              const showLoopControls = (loopIterations || 1) > 1;

              return (
                <div key={axis} className="space-y-2">
                  <div className="flex justify-between items-center text-sm gap-2">
                    <span className="font-medium w-8">{axis}</span>
                    <div className="flex items-center gap-1">
                      <Input
                        type="text"
                        value={displayValue}
                        onChange={(e) => handleInputChange(axis, e.target.value)}
                        onBlur={() => handleInputBlur(axis, false)}
                        onKeyDown={(e) => handleInputKeyDown(axis, false, e)}
                        className="w-20 h-7 px-2 text-xs font-mono text-right"
                      />
                      <span className="text-xs text-muted-foreground w-8">{unit}</span>

                      {/* Loop delta input (only show when looping is enabled) */}
                      {showLoopControls && (
                        <>
                          <span className="text-xs text-muted-foreground ml-2">Δ/loop:</span>
                          <Input
                            type="number"
                            value={loopDelta}
                            onChange={(e) => {
                              const value = parseFloat(e.target.value);
                              if (!isNaN(value)) {
                                handleLoopDeltaChange(axis, value);
                              }
                            }}
                            className="w-16 h-7 px-2 text-xs font-mono text-right bg-green-900/20 border-green-500/50"
                            title={`Add ${loopDelta}${unit} to ${axis} per loop iteration`}
                            step={step}
                          />
                        </>
                      )}
                    </div>
                  </div>
                  <Slider
                    min={limits.min}
                    max={limits.max}
                    step={step}
                    value={[currentValue]}
                    onValueChange={(values) => handleCartesianChange(axis, values[0])}
                    className="w-full"
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* Tool State Section */}
        <div className="mt-6 pt-6 border-t space-y-4">
          <h3 className="text-sm font-semibold">Tool State</h3>

          {/* Tool Selector */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Active Tool</label>
            <Select
              value={localToolId || undefined}
              onValueChange={(value) => setLocalToolId(value)}
              disabled={toolsLoading}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={toolsLoading ? "Loading tools..." : "Select a tool"} />
              </SelectTrigger>
              <SelectContent>
                {availableTools.map((tool) => (
                  <SelectItem key={tool.id} value={tool.id}>
                    {tool.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Gripper State Toggle - Only show if selected tool has gripper enabled */}
          {localToolId && availableTools.find(t => t.id === localToolId)?.gripper_config?.enabled && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Gripper State</label>
              <ToggleGroup
                type="single"
                value={localGripperState || undefined}
                onValueChange={(value) => setLocalGripperState(value as 'open' | 'closed')}
                className="justify-start"
              >
                <ToggleGroupItem value="open" aria-label="Open gripper">
                  Open
                </ToggleGroupItem>
                <ToggleGroupItem value="closed" aria-label="Close gripper">
                  Closed
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          )}
        </div>

        {/* Footer: Save/Cancel */}
        <div className="flex justify-end gap-2 mt-6 pt-4 border-t">
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            Save Changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
