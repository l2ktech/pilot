# Interface Overview

This guide explains the main components of the PAROL6 control interface.

## Main Layout

The interface is divided into three main areas:

```
┌─────────────────────────────────────────────────────────┐
│  Header: Connection status, Live Control toggle         │
├─────────────────────────────────┬───────────────────────┤
│                                 │                       │
│     3D Visualization            │    Control Panel      │
│     (Robot view)                │    (Joints/Cartesian) │
│                                 │                       │
├─────────────────────────────────┴───────────────────────┤
│              Timeline Editor                            │
└─────────────────────────────────────────────────────────┘
```

---

## Header Bar

### Connection Status

Located in the top-right corner:

| Status | Indicator | Meaning |
|--------|-----------|---------|
| Connected | Green | Backend and robot connected |
| Partial | Yellow | Backend connected, robot offline |
| Disconnected | Red | Backend not reachable |

### Live Control Toggle

- **ON**: Physical robot follows commanded positions in real-time
- **OFF**: Only 3D visualization updates (safe mode for testing)

!!! danger "Live Control Warning"
    When Live Control is enabled, the robot moves immediately. Ensure the workspace is clear before enabling.

---

## 3D Visualization

The central area shows an interactive 3D view of the robot.

### Mouse Controls

| Action | Control |
|--------|---------|
| Rotate view | Left-click + drag |
| Pan view | Right-click + drag |
| Zoom | Scroll wheel |
| Reset view | Double-click |

### Robot Visualization

Two robot models may be shown:

- **Solid robot**: Commanded/target position (what you're controlling)
- **Ghost robot** (semi-transparent): Actual hardware position from encoders

When both align, the robot has reached its target.

### Tool Visualization

The mounted tool (gripper, etc.) is shown attached to the robot's end effector. Change tools in the control panel.

---

## Control Panel

Located on the right side, the control panel has several sections.

### Mode Toggle: Joint / Cartesian

Switch between control modes:

=== "Joint Mode"
    - Control individual joints (J1-J6)
    - Direct angle input in degrees
    - Sliders for each joint
    - Shows current joint limits

=== "Cartesian Mode"
    - Control end-effector position/orientation
    - X, Y, Z position in millimeters
    - RX, RY, RZ orientation in degrees
    - Uses inverse kinematics (IK) solver

### Joint Sliders

In Joint mode, each slider controls one joint:

| Joint | Description | Typical Range |
|-------|-------------|---------------|
| J1 | Base rotation | -170° to +170° |
| J2 | Shoulder | -90° to +90° |
| J3 | Elbow | -150° to +150° |
| J4 | Wrist 1 | -180° to +180° |
| J5 | Wrist 2 | -120° to +120° |
| J6 | Wrist 3 | -180° to +180° |

!!! note "Joint Limits"
    Limits are enforced in software. The sliders won't exceed safe ranges.

### Cartesian Input

In Cartesian mode:

- **X, Y, Z**: Position of tool center point (TCP) in mm
- **RX, RY, RZ**: Orientation in degrees (Euler angles)

The IK solver calculates the joint angles needed to reach the target.

### Speed Control

Slider to adjust motion speed (1-100%):

- **1-30%**: Slow, precise movements
- **30-70%**: Normal operation
- **70-100%**: Fast movements

### Tool Selection

Dropdown to select the mounted tool. Each tool has:

- TCP offset (affects Cartesian calculations)
- Optional 3D mesh visualization
- Optional gripper controls

### Gripper Control

If the active tool has a gripper:

- **Open/Close** buttons
- Visual feedback in 3D view

---

## Saved Positions

Quick access to stored robot configurations.

### Using Saved Positions

1. Click a position name to move the robot there
2. The motion uses current speed settings

### Saving New Positions

1. Move robot to desired position
2. Click **Save Current**
3. Enter a name for the position

### Managing Positions

- Saved positions are stored in `config.yaml`
- Edit the file directly to modify or delete positions

---

## Timeline Editor

The bottom panel provides keyframe-based motion programming.

See [Timeline Programming](timeline-programming.md) for detailed instructions.

### Quick Overview

- **Keyframes**: Saved positions at specific times
- **Playback**: Preview motions in the 3D view
- **Execute**: Send the sequence to the robot

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `E` | Emergency stop |
| `H` | Home the robot |
| `Space` | Toggle Live Control |
| `?` | Show/hide help annotations |
| `J` | Switch to Joint mode |
| `C` | Switch to Cartesian mode |

---

## Help Annotations

Press `?` to toggle help annotations - colored labels that highlight key UI elements and their functions.

---

## Status Bar / Logs

System logs appear in the interface showing:

- Command execution status
- Error messages
- Connection events

Logs can be filtered and cleared as needed.

---

## Next Steps

- [Timeline Programming](timeline-programming.md) - Create motion sequences
- [Tool Management](tool-management.md) - Configure end-effectors
- [Safety Guide](safety.md) - Important safety information
