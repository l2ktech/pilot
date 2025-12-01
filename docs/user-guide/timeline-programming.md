# Timeline Programming

The Timeline Editor allows you to create motion sequences by placing keyframes at specific times. This guide covers how to record, edit, and execute robot motions.

## Timeline Concepts

### Keyframes

A **keyframe** stores the complete robot state at a specific point in time:

- All six joint angles
- Timestamp on the timeline
- Optional gripper state

### Playback vs Execution

- **Playback**: Preview in 3D visualization only (robot doesn't move)
- **Execute**: Send the motion sequence to the physical robot

---

## Creating a Motion Sequence

### Step 1: Set Timeline Duration

1. Locate the timeline duration setting
2. Set total duration in seconds (default: 10s)

### Step 2: Add Keyframes

**Method 1: Record Current Position**

1. Move the robot to the desired position (Joint or Cartesian mode)
2. Position the timeline cursor at the desired time
3. Click **Add Keyframe** or press the record button
4. The keyframe appears on the timeline

**Method 2: From Saved Positions**

1. Move timeline cursor to target time
2. Click a Saved Position to set the robot there
3. Add a keyframe at that position

### Step 3: Repeat

Add more keyframes at different times to create the full sequence.

!!! tip "Start and End"
    Always add keyframes at the beginning (0s) and end of your sequence to define the complete motion.

---

## Editing Keyframes

### Select a Keyframe

Click on a keyframe marker in the timeline to select it.

### Move a Keyframe

Drag a keyframe left or right to change its time position.

### Modify a Keyframe

1. Select the keyframe
2. Adjust joint positions using the control panel
3. The keyframe updates automatically

### Delete a Keyframe

1. Select the keyframe
2. Press Delete or click the remove button

---

## Previewing Motion

### Timeline Playback

1. Click **Play** to start playback
2. The 3D visualization shows the interpolated motion
3. The timeline cursor moves through the sequence
4. Click **Stop** to halt playback

### Scrubbing

Drag the timeline cursor manually to preview any point in the sequence.

---

## Executing on Robot

!!! warning "Safety Check"
    Before executing:

    - Ensure workspace is clear
    - Verify speed settings are appropriate
    - Preview the motion first

### Execute Sequence

1. Enable **Live Control** if not already on
2. Click **Execute** to send the sequence to the robot
3. The robot follows the motion in real-time
4. The timeline cursor shows current progress

### Stop Execution

- Click **Stop** to halt execution
- Press `E` for emergency stop

---

## Loop Variables

For repetitive tasks, use loop variables to create patterns.

### Setting Up Loops

1. Define a loop variable (e.g., `count`)
2. Set start value, end value, and increment
3. Use the variable in your keyframes

### Example: Pick and Place

```
Loop: i from 0 to 3, step 1

Keyframe 0s: Home position
Keyframe 1s: Pick position + (i * offset)
Keyframe 2s: Gripper close
Keyframe 3s: Place position + (i * offset)
Keyframe 4s: Gripper open
Keyframe 5s: Home position
```

This creates 4 pick-and-place cycles with different positions.

---

## Interpolation

Motion between keyframes is interpolated (smoothed):

- **Position**: Linear interpolation between joint angles
- **Speed**: Controlled by the speed percentage setting
- **Acceleration**: Trapezoidal velocity profile

The robot moves smoothly between keyframes without abrupt starts or stops.

---

## Tips for Good Motions

### Plan Your Path

1. Sketch the motion on paper first
2. Identify key positions (start, waypoints, end)
3. Add keyframes at each key position

### Avoid Singularities

Certain positions cause mathematical issues for the IK solver:

- Arm fully extended
- Joints aligned in certain ways

If you see jerky motion or errors, adjust the path to avoid these configurations.

### Use Appropriate Speed

- **Slow (10-30%)**: Precision work, initial testing
- **Medium (30-60%)**: Normal operation
- **Fast (60-100%)**: Production speed (after testing)

### Add Buffer Time

Leave extra time between keyframes for smooth acceleration and deceleration.

---

## Saving and Loading

### Save a Sequence

Sequences can be exported for later use or sharing.

### Load a Sequence

Import previously saved sequences to replay or modify them.

---

## Troubleshooting

### Jerky Motion

- Add more intermediate keyframes
- Reduce speed
- Check for near-singularity positions

### Robot Doesn't Match Preview

- Verify Live Control is enabled
- Check connection status
- Review logs for errors

### IK Errors

- Target position may be unreachable
- Adjust the Cartesian target or use Joint mode
- Check for joint limit violations

---

## Next Steps

- [Tool Management](tool-management.md) - Configure grippers for pick-and-place
- [Safety Guide](safety.md) - Safe operation practices
