# Configuration

PAROL6 uses a single `config.yaml` file in the project root for all system settings.

## Serial Port Setup

The most important setting is the serial port connection to your robot.

### Find Your Serial Port

```bash
# List available serial ports
ls -l /dev/ttyACM* /dev/ttyUSB*
```

Common port names:
- `/dev/ttyACM0` - Most common on Linux/Raspberry Pi
- `/dev/ttyUSB0` - USB-to-serial adapters

### Configure the Port

Edit `config.yaml`:

```yaml
robot:
  com_port: /dev/ttyACM0  # Change to your port
  baud_rate: 3000000      # Do not change unless instructed
```

!!! warning "Serial Port Permissions"
    Ensure your user is in the `dialout` group:
    ```bash
    sudo usermod -a -G dialout $USER
    ```
    Log out and back in for the change to take effect.

---

## Essential Settings

### Robot Settings

```yaml
robot:
  com_port: /dev/ttyACM0      # Serial port to robot
  baud_rate: 3000000          # Communication speed (don't change)
  auto_home_on_startup: false # Auto-home when commander starts
  estop_enabled: true         # Enable emergency stop
  j2_backlash_offset: 6       # J2 backlash compensation (degrees)
  timeout: 0                  # Serial timeout (0 = no timeout)
```

### Speed and Motion

```yaml
ui:
  default_speed_percentage: 50        # Default motion speed (1-100)
  default_acceleration_percentage: 90 # Default acceleration (1-100)
  step_angle: 1                       # Jog step size in degrees
  cartesian_position_step_mm: 1       # Cartesian jog step in mm
```

!!! tip "Start Slow"
    Keep `default_speed_percentage` low (30-50) when testing new motions.

---

## Network Settings

### API Server

```yaml
api:
  host: 0.0.0.0   # Listen on all interfaces
  port: 3001      # API port
```

### WebSocket Streaming

```yaml
api:
  ws_default_rate_hz: 10  # Status update frequency (Hz)
  ws_max_rate_hz: 50      # Maximum allowed rate
```

### Accessing from Other Devices

To access PAROL6 from other devices on your network:

1. Find your IP address:
   ```bash
   hostname -I
   ```

2. Access the interface at `http://<your-ip>:3000`

The API is at port 3001 on the same IP.

---

## Camera Settings

```yaml
camera:
  auto_start: false         # Start camera on system startup
  default_device: /dev/video0
  fps: 30
  jpeg_quality: 80
  resolution:
    width: 640
    height: 480
```

Enable `auto_start: true` if you have a USB camera connected.

---

## UI Settings

### Robot Visualization

```yaml
ui:
  hardware_robot:
    color: '#9096f4'      # Hardware position ghost color
    transparency: 0.3     # Ghost transparency (0-1)
  commander_robot:
    color: '#ffffff'      # Target position color
    transparency: 1
```

### Active Tool

```yaml
ui:
  active_tool: duck  # ID of the mounted tool
```

See [Tool Management](../user-guide/tool-management.md) for details on configuring tools.

---

## Saved Positions

Define commonly-used robot positions:

```yaml
ui:
  saved_positions:
    - name: Home
      joints: [90, -90, 180, 0, 0, 180]
    - name: Ready
      joints: [0, -90, 180, 0, 0, 90]
    - name: Shutdown pose
      joints: [90, -145, 108, 0, 0, 180]
```

Joint angles are in degrees, in order: J1, J2, J3, J4, J5, J6.

---

## Logging

```yaml
logging:
  level: INFO              # Global log level
  api:
    level: DEBUG           # API-specific level
  commander:
    level: INFO            # Commander-specific level
  file_output: logs/parol6.log
  stream_to_websocket: true
```

Log levels: `DEBUG`, `INFO`, `WARNING`, `ERROR`

---

## Docker Configuration

When using Docker, edit the serial port mapping in `docker-compose.yml`:

```yaml
commander:
  devices:
    - "/dev/ttyACM0:/dev/ttyACM0"  # Change to your port
```

---

## Full Configuration Reference

??? abstract "Complete config.yaml example"
    ```yaml
    api:
      host: 0.0.0.0
      port: 3001
      ws_default_rate_hz: 10
      ws_max_rate_hz: 50

    robot:
      com_port: /dev/ttyACM0
      baud_rate: 3000000
      auto_home_on_startup: false
      estop_enabled: true
      j2_backlash_offset: 6
      timeout: 0

    camera:
      auto_start: false
      default_device: /dev/video0
      fps: 30
      jpeg_quality: 80
      resolution:
        width: 640
        height: 480

    ui:
      active_tool: default_j6_tip
      default_speed_percentage: 50
      default_acceleration_percentage: 90
      step_angle: 1
      cartesian_position_step_mm: 1
      debug_mode: false
      show_safety_warnings: false
    ```

## Next Steps

- [Quick Start](quick-start.md) - Move your robot for the first time
- [Tool Management](../user-guide/tool-management.md) - Configure end-effectors
