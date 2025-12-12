'use client';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useState } from 'react';
import { useCommandStore, useHardwareStore, useInputStore, usePerformanceStore } from '../lib/stores';
import { useConfigStore } from '../lib/configStore';
import { AlertTriangle, StopCircle, Circle } from 'lucide-react';
import { getApiBaseUrl } from '../lib/apiConfig';
import { moveJoints, setGripperOutput } from '../lib/api';
import { useSafetyConfirmation } from '../hooks/useSafetyConfirmation';
import { JointName } from '../lib/types';
import { logger } from '../lib/logger';

export default function ControlOptions() {
  const [isMoving, setIsMoving] = useState(false);
  const [isHoming, setIsHoming] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isStopping, setIsStopping] = useState(false);

  // Command store: Commanded state and movement parameters
  const speed = useCommandStore((state) => state.speed);
  const commandedJoints = useCommandStore((state) => state.commandedJointAngles);
  const setCommandedJointAngle = useCommandStore((state) => state.setCommandedJointAngle);

  // Hardware store: Robot status and hardware angles
  const robotStatus = useHardwareStore((state) => state.robotStatus);
  const hardwareJointAngles = useHardwareStore((state) => state.hardwareJointAngles);

  // Input store: Input angle setters
  const setInputJointAngle = useInputStore((state) => state.setInputJointAngle);

  // Performance store: Recording armed state
  const recordingArmed = usePerformanceStore((state) => state.recordingArmed);
  const setRecordingArmed = usePerformanceStore((state) => state.setRecordingArmed);
  const startRecording = usePerformanceStore((state) => state.startRecording);
  const stopRecording = usePerformanceStore((state) => state.stopRecording);

  // Config store: Debug mode
  const config = useConfigStore((state) => state.config);
  const isDebugMode = config?.ui?.debug_mode === true;

  // Safety confirmation hook
  const { confirmAction, SafetyDialog } = useSafetyConfirmation();

  // Get commander tool for gripper control
  const commanderTool = useCommandStore((state) => state.commanderTool);
  const commandedGripperState = useCommandStore((state) => state.commandedGripperState);

  const handleHome = async () => {
    setIsHoming(true);
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/robot/home`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json();
        logger.error('Failed to home robot', 'ControlOptions', error);
        alert(`Failed to home robot: ${error.detail || 'Unknown error'}`);
      }
    } catch (error) {
      logger.error('Error homing robot', 'ControlOptions', error);
      alert('Failed to communicate with robot');
    } finally {
      setIsHoming(false);
    }
  };

  const handleCopyPoseFromHardware = () => {
    if (!hardwareJointAngles) return;

    // Copy all 6 joint angles from hardware to commanded and input
    const joints: JointName[] = ['J1', 'J2', 'J3', 'J4', 'J5', 'J6'];
    joints.forEach(joint => {
      setInputJointAngle(joint, hardwareJointAngles[joint]);
      setCommandedJointAngle(joint, hardwareJointAngles[joint]);
    });
  };

  const handleSendToRobot = async () => {
    if (!commandedJoints) return;

    // Safety confirmation check (respects show_safety_warnings setting)
    const confirmed = await confirmAction(
      'Move robot to commander position using joint space motion?',
      'Confirm Joint Movement'
    );
    if (!confirmed) {
      logger.debug('User cancelled send to robot', 'ControlOptions');
      return;
    }

    setIsMoving(true);
    try {
      const result = await moveJoints(commandedJoints, speed);
      if (!result.success) {
        alert(`Failed to move robot: ${result.error || 'Unknown error'}`);
      } else {
        // Also send gripper state if tool has gripper enabled
        if (commanderTool?.gripper_config?.enabled && commandedGripperState) {
          await setGripperOutput(commanderTool, commandedGripperState);
        }
      }
    } catch (error) {
      logger.error('Error sending move command', 'ControlOptions', error);
      alert('Failed to communicate with robot');
    } finally {
      setIsMoving(false);
    }
  };

  const handleClearEstop = async () => {
    setIsClearing(true);
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/robot/clear-estop`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json();
        logger.error('Failed to clear E-stop', 'ControlOptions', error);
        alert(`Failed to clear E-stop: ${error.detail || 'Unknown error'}`);
      }
    } catch (error) {
      logger.error('Error clearing E-stop', 'ControlOptions', error);
      alert('Failed to communicate with robot');
    } finally{
      setIsClearing(false);
    }
  };

  const handleStop = async () => {
    setIsStopping(true);
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/robot/stop`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json();
        logger.error('Failed to stop robot', 'ControlOptions', error);
        alert(`Failed to stop robot: ${error.detail || 'Unknown error'}`);
      } else {
        // Reset moving states when stop is successful
        setIsMoving(false);
        setIsHoming(false);
      }
    } catch (error) {
      logger.error('Error stopping robot', 'ControlOptions', error);
      alert('Failed to communicate with robot');
    } finally {
      setIsStopping(false);
    }
  };

  const handleRecordingToggle = async (checked: boolean) => {
    setRecordingArmed(checked);
    // Send arm/disarm command to commander
    // Recording auto-starts when command execution begins, auto-stops when queue empty
    if (checked) {
      await startRecording();
    } else {
      await stopRecording();
    }
  };

  return (
    <>
    <Card className="p-3">
      <h2 className="text-sm font-semibold mb-3">Actions</h2>

      {/* Action Buttons */}
      <div className="space-y-1.5">
        {/* E-Stop Clear Button - Show prominently when E-stop is active */}
        {robotStatus?.estop_active && (
          <Button
            variant="destructive"
            size="sm"
            className="h-8 text-xs w-full font-semibold"
            onClick={handleClearEstop}
            disabled={isClearing}
          >
            <AlertTriangle className="h-3.5 w-3.5 mr-1.5" />
            {isClearing ? '清除中...' : '清除急停'}
          </Button>
        )}

        {/* Stop Button - Show prominently when robot is moving */}
        {isMoving && !isHoming && (
          <Button
            variant="destructive"
            size="sm"
            className="h-8 text-xs w-full font-semibold bg-red-600 hover:bg-red-700"
            onClick={handleStop}
            disabled={isStopping}
          >
            <StopCircle className="h-3.5 w-3.5 mr-1.5" />
            {isStopping ? '停止中...' : '停止机器人'}
          </Button>
        )}

        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs w-full"
          onClick={handleHome}
          disabled={isHoming || isMoving || robotStatus?.is_stopped == null}
        >
          {isHoming ? '回零中...' : '机器人回零'}
        </Button>

        {/* Sync Section */}
        <div className="space-y-1.5">
          <span className="text-[10px] text-muted-foreground">Sync state from</span>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={handleCopyPoseFromHardware}
                  disabled={robotStatus?.is_stopped == null}
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs w-full"
                >
                  机器人 → 命令器
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>将机器人硬件位置复制到命令器</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={handleSendToRobot}
                  disabled={robotStatus?.is_stopped == null || isMoving}
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs w-full"
                >
                  命令器 → 机器人
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Move hardware robot to commander position</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Performance Recording Toggle - Only show in debug mode */}
        {isDebugMode && (
          <div className="flex items-center justify-between pt-2 border-t">
            <div className="flex items-center gap-2">
              <Circle className={`h-3 w-3 ${recordingArmed ? 'fill-orange-500 text-orange-500' : 'text-gray-400'}`} />
              <Label htmlFor="recording-toggle" className="text-xs font-medium cursor-pointer">
                {recordingArmed ? 'Recording Armed' : 'Record Performance'}
              </Label>
            </div>
            <Switch
              id="recording-toggle"
              checked={recordingArmed}
              onCheckedChange={handleRecordingToggle}
            />
          </div>
        )}
      </div>
    </Card>
    <SafetyDialog />
    </>
  );
}
