# Tool Management

Tools (end-effectors) are devices mounted to the robot's J6 flange. This guide explains how to configure and use tools including grippers.

## What is a Tool?

A tool defines:

- **TCP Offset**: Where the Tool Center Point is relative to the flange
- **3D Mesh**: Optional visualization in the interface
- **Gripper**: Optional open/close functionality

## Why TCP Matters

The **Tool Center Point (TCP)** is the reference point for Cartesian movements. When you command the robot to position X=300, Y=0, Z=200, the TCP moves to that location.

Different tools have different TCP positions:

- A gripper's TCP might be at the fingertips
- A suction cup's TCP is at the suction point
- A camera's TCP could be at the lens center

---

## Selecting a Tool

### In the Interface

1. Find the **Tool** dropdown in the control panel
2. Select your mounted tool from the list
3. The 3D view updates to show the tool
4. Cartesian coordinates now reference the new TCP

### Default Tools

Pilot comes with preset tools:

| Tool | Description |
|------|-------------|
| Default (J6 Tip) | No tool - TCP at flange center |
| Standard90 | Standard gripper with 90° orientation |
| Custom Flange | Example custom mounting plate |

---

## Configuring Tools

Tools are defined in `config.yaml` under `ui.tools`.

### Basic Tool Definition

```yaml
ui:
  tools:
    - id: my_gripper        # Unique identifier
      name: My Gripper      # Display name
      description: Custom pneumatic gripper
      tcp_offset:
        x: 0                # mm from flange
        y: 0
        z: -50              # 50mm below flange
        rx: 0               # degrees
        ry: 0
        rz: 0
```

### TCP Offset Explained

The offset defines where the TCP is relative to the J6 flange:

```
        Flange (J6)
            │
            │ z offset (negative = below flange)
            │
            ▼
           TCP ← x,y offset
```

- **x, y, z**: Position offset in millimeters
- **rx, ry, rz**: Rotation offset in degrees

### Adding a 3D Mesh

To visualize your tool in the interface:

```yaml
- id: my_gripper
  name: My Gripper
  mesh_file: my_gripper.stl   # Place in frontend/public/urdf/meshes/
  mesh_units: mm               # mm or m
  mesh_offset:                 # Visual alignment
    x: 0
    y: 0
    z: 0
    rx: 0
    ry: 0
    rz: 0
  tcp_offset:
    x: 0
    y: 0
    z: -50
    rx: 0
    ry: 0
    rz: 0
```

Supported mesh formats: `.stl`, `.glb`, `.gltf`

!!! tip "Mesh vs TCP Offset"
    - `mesh_offset`: Aligns the visual model
    - `tcp_offset`: Defines the functional TCP

    These are independent - adjust mesh_offset until the 3D model looks correct.

---

## Gripper Configuration

For tools with gripper functionality:

```yaml
- id: pneumatic_gripper
  name: Pneumatic Gripper
  tcp_offset:
    x: 0
    y: 0
    z: -75
    rx: 0
    ry: 0
    rz: 0
  gripper_config:
    enabled: true
    io_pin: 1              # Digital output pin (1-8)
    open_is_high: true     # true = HIGH opens gripper
    mesh_file_open: gripper_open.stl
    mesh_file_closed: gripper_closed.stl
```

### Gripper Settings

| Setting | Description |
|---------|-------------|
| `enabled` | Enable gripper controls |
| `io_pin` | Digital output pin number |
| `open_is_high` | Polarity - true if HIGH signal opens gripper |
| `mesh_file_open` | Mesh shown when gripper is open |
| `mesh_file_closed` | Mesh shown when gripper is closed |

### Using the Gripper

With a gripper-enabled tool selected:

1. **Open** and **Close** buttons appear in the interface
2. Click to actuate the gripper
3. The 3D visualization updates to show the state
4. The physical gripper actuates via the configured I/O pin

---

## Setting the Active Tool

### In config.yaml

Set the default mounted tool:

```yaml
ui:
  active_tool: my_gripper  # Tool ID
```

### At Runtime

Select a different tool from the interface dropdown. This change is temporary until the system restarts.

---

## Complete Tool Example

```yaml
ui:
  tools:
    - id: vacuum_gripper
      name: Vacuum Gripper
      description: Suction cup end effector
      mesh_file: vacuum_gripper.glb
      mesh_units: mm
      mesh_offset:
        x: 0
        y: 0
        z: 0.03
        rx: 0
        ry: 0
        rz: 0
      tcp_offset:
        x: 0
        y: 0
        z: -85
        rx: 90
        ry: 0
        rz: 0
      gripper_config:
        enabled: true
        io_pin: 2
        open_is_high: false
        mesh_file_open: vacuum_off.glb
        mesh_file_closed: vacuum_on.glb
```

---

## Calibrating TCP

To find the correct TCP offset for your tool:

### Method 1: Measurement

1. Measure physical dimensions of your tool
2. Calculate offset from flange to working point
3. Enter values in config.yaml

### Method 2: Touch Calibration

1. Attach the tool to the robot
2. Touch a fixed point from multiple angles
3. Adjust TCP offset until all angles touch the same point
4. The correct TCP is where all orientations converge

---

## Troubleshooting

### Tool Not Appearing

- Check `mesh_file` path is correct
- Ensure file is in `frontend/public/urdf/meshes/`
- Verify `mesh_units` matches your file (mm vs m)

### TCP Position Wrong

- Review offset signs (negative z = below flange)
- Check rotation order (rx, ry, rz)
- Use touch calibration to verify

### Gripper Not Working

- Verify `io_pin` is correct
- Check `open_is_high` polarity
- Ensure robot I/O is properly wired

---

## Next Steps

- [Timeline Programming](timeline-programming.md) - Use grippers in motion sequences
- [Safety Guide](safety.md) - Safe gripper operation
