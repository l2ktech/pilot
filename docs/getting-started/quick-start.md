# Quick Start

This guide walks you through moving your PAROL6 robot for the first time.

!!! warning "Safety First"
    - Ensure the robot workspace is clear
    - Keep the emergency stop accessible
    - Start with low speed settings (30-50%)

## Step 1: Start the System

=== "Docker"

    ```bash
    cd parol6-webcommander
    docker-compose up -d
    ```

=== "Native (PM2)"

    ```bash
    cd parol6
    source venv/bin/activate
    pm2 start ecosystem.config.js
    ```

## Step 2: Open the Interface

Open your browser to [http://localhost:3000](http://localhost:3000)

You should see:

- 3D visualization of the robot
- Control panel on the right
- Timeline at the bottom

## Step 3: Check Connection Status

Look at the top-right corner of the interface:

| Indicator | Meaning |
|-----------|---------|
| **Green circle** | Connected to backend and robot |
| **Yellow circle** | Connected to backend, robot disconnected |
| **Red circle** | Backend disconnected |

!!! tip "No Robot?"
    You can use the interface without a physical robot connected. The 3D visualization will show commanded positions.

## Step 4: Home the Robot

Before moving, home the robot to establish position reference:

1. Click the **Home** button in the control panel
2. Wait for the homing sequence to complete
3. The robot will move to its home position

!!! note "First-time Homing"
    On first power-up, homing is required to sync the software with actual joint positions.

## Step 5: Enable Live Control

Toggle **Live Control** in the top-right area:

- When **enabled**: The physical robot follows your commands in real-time
- When **disabled**: Only the 3D visualization moves (safe for testing)

!!! warning "Live Control"
    With Live Control enabled, the robot moves immediately when you change joint values. Be cautious!

## Step 6: Move in Joint Space

1. Ensure you're in **Joint** mode (toggle in the control panel)
2. Use the sliders to adjust individual joints (J1-J6)
3. Watch the 3D visualization update in real-time
4. With Live Control enabled, the physical robot follows

**Joint Reference:**

| Joint | Motion |
|-------|--------|
| J1 | Base rotation |
| J2 | Shoulder (up/down) |
| J3 | Elbow (up/down) |
| J4 | Wrist rotation |
| J5 | Wrist pitch |
| J6 | Tool rotation |

## Step 7: Move in Cartesian Space

1. Switch to **Cartesian** mode
2. Adjust X, Y, Z position (in mm) and RX, RY, RZ orientation (in degrees)
3. The IK solver calculates the required joint angles automatically

!!! info "IK Limitations"
    Some positions may be unreachable due to joint limits or robot geometry. The interface will indicate when a target is invalid.

## Step 8: Use Saved Positions

1. Find the **Saved Positions** panel
2. Click a position name (e.g., "Home", "Ready") to move there
3. Save new positions by moving the robot and clicking **Save Current**

## Step 9: Adjust Speed

Use the speed slider to control motion speed:

- **10-30%**: Slow, careful movements
- **50%**: Normal operation
- **80-100%**: Fast movements (use with caution)

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `E` | Emergency stop |
| `H` | Home robot |
| `Space` | Toggle Live Control |
| `?` | Show help overlay |

---

## Troubleshooting

### Robot Not Responding

1. Check serial cable connection
2. Verify `com_port` in `config.yaml`
3. Check user is in `dialout` group
4. View logs: `pm2 logs` or `docker-compose logs commander`

### Connection Status Red

1. Ensure all services are running:
   ```bash
   pm2 status  # or docker-compose ps
   ```
2. Check API is accessible at [http://localhost:3001/docs](http://localhost:3001/docs)

### IK Solver Fails

- Target may be outside robot workspace
- Try a different orientation
- Move closer to the center of the workspace

---

## Next Steps

- [Interface Overview](../user-guide/interface-overview.md) - Learn all UI features
- [Timeline Programming](../user-guide/timeline-programming.md) - Create motion sequences
- [Safety Guide](../user-guide/safety.md) - Important safety information
