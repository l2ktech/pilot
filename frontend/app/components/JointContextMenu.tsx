'use client';

import { Menu, Item, useContextMenu } from 'react-contexify';
import 'react-contexify/dist/ReactContexify.css';
import { useInputStore, useCommandStore } from '../lib/stores';
import { JOINT_LIMITS } from '../lib/constants';
import type { JointName } from '../lib/types';

const MENU_ID = 'joint-context-menu';

interface MenuData {
  jointName: JointName;
}

export function JointContextMenu() {
  const setInputJointAngle = useInputStore((state) => state.setInputJointAngle);
  const setCommandedJointAngle = useCommandStore((state) => state.setCommandedJointAngle);

  const setJointAngle = (joint: JointName, value: number) => {
    setInputJointAngle(joint, value);
    setCommandedJointAngle(joint, value);
  };

  const handleGoToMin = ({ props }: { props: MenuData }) => {
    if (props && props.jointName) {
      const limits = JOINT_LIMITS[props.jointName];
      setJointAngle(props.jointName, limits.min);
    }
  };

  const handleGoToMax = ({ props }: { props: MenuData }) => {
    if (props && props.jointName) {
      const limits = JOINT_LIMITS[props.jointName];
      setJointAngle(props.jointName, limits.max);
    }
  };

  const handleCenter = ({ props }: { props: MenuData }) => {
    if (props && props.jointName) {
      const limits = JOINT_LIMITS[props.jointName];
      const center = (limits.min + limits.max) / 2;
      setJointAngle(props.jointName, center);
    }
  };

  return (
    <Menu id={MENU_ID} theme="dark">
      <Item onClick={handleCenter}>
        <span className="text-sm">🎯 Center Joint</span>
      </Item>
      <Item onClick={handleGoToMin}>
        <span className="text-sm">⬇️ Go to Min Limit</span>
      </Item>
      <Item onClick={handleGoToMax}>
        <span className="text-sm">⬆️ Go to Max Limit</span>
      </Item>
    </Menu>
  );
}

export function useJointContextMenu() {
  return useContextMenu({ id: MENU_ID });
}
