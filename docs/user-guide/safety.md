# Safety Guide

!!! danger "Important"
    Pilot controls a physical robot arm capable of causing injury. Read and follow all safety guidelines before operating.

## General Safety Rules

1. **Never bypass safety features**
2. **Keep emergency stop accessible at all times**
3. **Clear the workspace before operating**
4. **Stay alert during robot motion**
5. **Start slow, increase speed gradually**

---

## Emergency Stop

### Software E-Stop

- Press **E** on keyboard at any time
- Click the **E-Stop** button in the interface
- Robot immediately halts all motion

### Clearing E-Stop

1. Ensure the cause of the stop is resolved
2. Click **Clear E-Stop** in the interface
3. Robot is now ready to accept commands

!!! warning "After E-Stop"
    The robot may be in an unexpected position. Move slowly after clearing an emergency stop.

### Hardware E-Stop

If your setup includes a hardware emergency stop button:

- Activates instantly, independent of software
- Cuts power to motors
- Must be physically reset before operation

---

## Workspace Safety

### Before Operation

- [ ] Remove people from the robot's reach
- [ ] Clear obstacles from the workspace
- [ ] Secure loose items that could be caught
- [ ] Verify nothing is entangled with the robot

### Robot Reach

The PAROL6 has approximately:

- **Reach radius**: ~500mm from base
- **Vertical range**: Varies by joint configuration

Stay outside this zone during operation.

### Pinch Points

Danger areas where body parts could be trapped:

- Between robot links during motion
- Between gripper fingers
- Between robot and fixed objects

Never reach into the workspace during motion.

---

## Speed and Acceleration

### Recommended Settings

| Situation | Speed | Acceleration |
|-----------|-------|--------------|
| Initial testing | 10-30% | 50% |
| Programming/teaching | 30-50% | 70% |
| Normal operation | 50-80% | 90% |
| Production (verified) | 80-100% | 100% |

### Speed Considerations

- **Lower speed = More reaction time**
- Start every new program at low speed
- Only increase after verifying the motion path
- Consider reducing speed for complex motions

---

## Live Control Safety

!!! danger "Live Control Warning"
    With Live Control enabled, the robot moves immediately when you change positions.

### Before Enabling Live Control

1. Verify the workspace is clear
2. Confirm speed settings are appropriate
3. Keep hand near E-Stop
4. Be prepared to stop motion instantly

### Safe Practices

- Disable Live Control when programming
- Preview motions in simulation first
- Enable Live Control only when ready to move
- Keep movements small and deliberate

---

## Joint Limits

Pilot enforces software joint limits to prevent:

- Mechanical damage
- Self-collision
- Reaching dangerous configurations

### If You Hit a Limit

1. The motion stops at the limit
2. Move the affected joint in the opposite direction
3. Avoid commanding positions near limits

### Joint Limit Reference

| Joint | Min | Max |
|-------|-----|-----|
| J1 | -170° | +170° |
| J2 | -90° | +90° |
| J3 | -150° | +150° |
| J4 | -180° | +180° |
| J5 | -120° | +120° |
| J6 | -180° | +180° |

*Actual limits may vary by configuration*

---

## Gripper Safety

### Pneumatic Grippers

- Check air pressure before operation
- Verify hose connections are secure
- Keep fingers clear of gripper jaws
- Ensure gripped objects are secure

### Electric Grippers

- Check grip force settings
- Don't exceed rated payload
- Monitor for overheating during continuous use

### General Gripper Safety

- Never place fingers in gripper
- Verify grip before moving
- Account for dropped objects

---

## Payload and Forces

### Maximum Payload

The PAROL6 has a rated payload capacity. Exceeding this can cause:

- Motor strain and overheating
- Reduced accuracy
- Mechanical damage
- Unexpected motion

### Inertial Loads

Fast motions with heavy payloads create additional forces:

- Reduce speed for heavy objects
- Accelerate and decelerate gradually
- Test at low speed first

---

## Electrical Safety

- Ensure proper grounding
- Don't operate with damaged cables
- Keep liquids away from electronics
- Power off before working on electrical connections

---

## Maintenance Safety

### Before Maintenance

1. Power off the robot
2. Disconnect from power source
3. Wait for capacitors to discharge
4. Lock out / tag out if required

### Mechanical Work

- Support the arm before loosening joints
- The arm may move unexpectedly when released
- Use proper lifting techniques

---

## Training Requirements

Before operating Pilot:

- [ ] Read this safety guide completely
- [ ] Understand the emergency stop system
- [ ] Practice using simulation mode first
- [ ] Perform first motions at low speed
- [ ] Know how to clear faults and errors

---

## Incident Response

### If Someone is Injured

1. **STOP** - Press emergency stop immediately
2. **SECURE** - Ensure robot cannot move
3. **AID** - Provide first aid as appropriate
4. **REPORT** - Document the incident

### If Equipment is Damaged

1. Stop operation immediately
2. Document the damage
3. Do not operate until inspected
4. Repair before resuming operation

---

## Safety Checklist

Print and use this checklist before each session:

- [ ] Workspace is clear
- [ ] Emergency stop is accessible and tested
- [ ] Speed is set appropriately (start low)
- [ ] Live Control is off (for programming)
- [ ] All personnel are outside the work envelope
- [ ] Gripper/tool is properly mounted
- [ ] Payload is within limits

---

## Reporting Issues

If you discover a safety issue:

- Stop operation immediately
- Document the issue
- Report to the project maintainers
- Do not operate until resolved

Report safety concerns at: [GitHub Issues](https://github.com/jointAxis77/parol6-webcommander/issues)

---

!!! success "Safe Operation"
    Following these guidelines helps ensure safe and productive operation of your PAROL6 robot. When in doubt, stop and assess the situation before continuing.
