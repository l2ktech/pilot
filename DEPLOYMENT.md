# PAROL6 Deployment Checklist

Quick reference guide for deploying the PAROL6 robot control system.

## Pre-Deployment

### System Requirements
- [ ] Linux system (Raspberry Pi 4/5 or Ubuntu PC recommended)
- [ ] Python 3.9+ installed (`python3 --version`)
- [ ] Node.js 18+ installed (`node --version`)
- [ ] npm 9+ installed (`npm --version`)
- [ ] At least 2GB free disk space
- [ ] USB connection to PAROL6 robot available

### Hardware Setup
- [ ] Robot powered and connected via USB
- [ ] Serial port accessible (`ls /dev/ttyACM*` or `/dev/ttyUSB*`)
- [ ] Emergency stop button accessible
- [ ] Robot workspace clear and safe
- [ ] (Optional) USB camera connected and detected (`ls /dev/video*`)

## Installation Steps

### 1. Clone Repository
```bash
cd ~
git clone <repository-url> parol6
cd parol6
git submodule update --init --recursive
```
- [ ] Repository cloned successfully
- [ ] Submodules (commander, frontend) initialized

### 2. Python Environment Setup
```bash
# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Verify installation
python3 -c "import fastapi, numpy, yaml; print('✓ Python packages OK')"
```
- [ ] Virtual environment created
- [ ] All Python packages installed
- [ ] No installation errors

### 3. Node.js Dependencies
```bash
cd frontend
npm install
cd ..
```
- [ ] Node modules installed (`frontend/node_modules/` exists)
- [ ] No npm errors or warnings

### 4. PM2 Process Manager
```bash
npm install -g pm2
pm2 --version
```
- [ ] PM2 installed globally
- [ ] PM2 command working

### 5. Configuration Files

#### a) Main Configuration
```bash
cp config.yaml.example config.yaml
nano config.yaml  # Edit with your settings
```
- [ ] config.yaml created
- [ ] Serial port configured (`robot.com_port`)
- [ ] Network IPs added to `api.cors_origins` (if needed)

#### b) Frontend Environment
```bash
cp frontend/.env.example frontend/.env.local
# Edit if needed for custom API URL
nano frontend/.env.local
```
- [ ] frontend/.env.local created
- [ ] API URL configured (if not using localhost)

### 6. Serial Port Permissions
```bash
# Add user to dialout group
sudo usermod -a -G dialout $USER

# Verify serial port exists and permissions
ls -l /dev/ttyACM0  # Or your serial port
```
- [ ] User added to dialout group
- [ ] Serial port accessible
- [ ] **LOGGED OUT and BACK IN** (required for group changes)

### 7. Build Frontend
```bash
cd frontend
npm run build
cd ..
```
- [ ] Frontend built successfully (`frontend/.next/` directory created)
- [ ] No build errors

## Testing & Verification

### 8. Test Individual Components

#### Test API Server
```bash
source venv/bin/activate
cd api
python3 fastapi_server.py
```
- [ ] API starts without errors
- [ ] Visit http://localhost:3001/docs (Swagger UI loads)
- [ ] `/health` endpoint returns healthy status
- [ ] Press Ctrl+C to stop

#### Test Frontend (Development Mode)
```bash
cd frontend
npm run dev
```
- [ ] Frontend starts on port 3000
- [ ] Visit http://localhost:3000 (interface loads)
- [ ] No console errors in browser
- [ ] Press Ctrl+C to stop

### 9. Start with PM2
```bash
# From project root
pm2 start ecosystem.config.js

# Check status
pm2 status
pm2 logs --lines 20
```
- [ ] All 3 processes running (frontend, api, commander)
- [ ] No errors in logs
- [ ] Frontend accessible at http://localhost:3000
- [ ] API accessible at http://localhost:3001/docs

### 10. Robot Connection Test
From the web interface (http://localhost:3000):
- [ ] 3D robot model loads correctly
- [ ] WebSocket connected (check browser console)
- [ ] Robot status updates visible
- [ ] Joint angles displayed (if robot is on)
- [ ] Can send basic commands (test with low speed!)

## Production Setup

### 11. PM2 Auto-Start Configuration
```bash
# Configure PM2 to start on boot
pm2 startup
# Follow the command it outputs (will use sudo)

# Save current PM2 configuration
pm2 save
```
- [ ] PM2 startup command executed
- [ ] PM2 configuration saved
- [ ] Test: Reboot and verify processes auto-start

### 12. Network Access (Optional)

If accessing from other devices:

```bash
# Find your IP
hostname -I
```

Update configurations:
- [ ] Add IP to `config.yaml` → `api.cors_origins`
- [ ] Set `NEXT_PUBLIC_API_URL` in `frontend/.env.local` (if needed)
- [ ] Restart PM2: `pm2 restart all`
- [ ] Test access from another device: `http://<your-ip>:3000`

### 13. Firewall Configuration (If Needed)
```bash
# Ubuntu/Debian
sudo ufw allow 3000/tcp  # Frontend
sudo ufw allow 3001/tcp  # API

# Or allow from specific IP
sudo ufw allow from 192.168.1.0/24 to any port 3000
sudo ufw allow from 192.168.1.0/24 to any port 3001
```
- [ ] Firewall rules configured
- [ ] Ports 3000 and 3001 accessible from network

## Post-Deployment

### 14. Safety & Operational Checks
- [ ] Emergency stop button tested and working
- [ ] Robot workspace clearly marked and safe
- [ ] Low-speed test movement successful
- [ ] Home position command works
- [ ] Joint limits enforced
- [ ] Cartesian motion tested (if using IK)

### 15. Monitoring & Maintenance
```bash
# View logs
pm2 logs

# Monitor processes
pm2 monit

# Restart all services
pm2 restart all

# Stop all services
pm2 stop all

# View error logs only
pm2 logs --err
```
- [ ] Know how to access logs
- [ ] Know how to restart services
- [ ] Monitoring setup (optional: pm2 plus)

### 16. Backup & Documentation
- [ ] Configuration backed up (`config.yaml`, `.env.local`)
- [ ] Saved positions documented
- [ ] Tool configurations recorded
- [ ] Network setup documented
- [ ] Serial port noted

## Troubleshooting

### Common Issues

**PM2 process keeps restarting:**
```bash
pm2 logs --err  # Check error logs
pm2 describe <process-name>  # Get detailed info
```

**Serial port access denied:**
```bash
groups  # Verify 'dialout' group membership
sudo chmod 666 /dev/ttyACM0  # Temporary fix (resets on reboot)
```

**Frontend can't connect to API:**
- Check `config.yaml` CORS origins
- Verify API is running: `curl http://localhost:3001/health`
- Check frontend `.env.local` API URL
- Clear browser cache

**Robot not responding:**
- Check serial connection: `ls -l /dev/ttyACM*`
- Verify baud rate matches robot firmware
- Check commander logs: `pm2 logs commander`
- Test with simple command from API docs

## Quick Reference Commands

```bash
# Start everything
pm2 start ecosystem.config.js

# Stop everything
pm2 stop all

# Restart everything
pm2 restart all

# View logs
pm2 logs

# Status
pm2 status

# Development mode (frontend only)
cd frontend && npm run dev

# Activate Python environment
source venv/bin/activate

# Test Python imports
python3 -c "from lib.kinematics import robot_model; print('OK')"
```

## Success Criteria

✅ **Deployment is successful when:**
1. All PM2 processes show "online" status
2. Frontend loads at http://localhost:3000
3. API docs load at http://localhost:3001/docs
4. Robot 3D model renders correctly
5. WebSocket connection established (check browser console)
6. Robot status updates in real-time
7. Can send and execute basic commands
8. Emergency stop tested and working
9. Processes auto-start after reboot (if configured)
10. No errors in PM2 logs

---

**Need Help?** See README.md for detailed documentation and troubleshooting.
