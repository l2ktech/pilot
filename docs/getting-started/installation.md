# Installation

This guide covers installing PAROL6 on your system. Choose between native installation or Docker deployment.

## Hardware Requirements

- **Robot**: PAROL6 6-axis robotic arm with controller board
- **Computer**: Raspberry Pi 4/5 (recommended) or Linux PC
- **Connection**: USB cable to robot controller
- **Optional**: USB camera for vision features

## Option 1: Docker Installation (Recommended)

Docker is the easiest way to get started, especially for production use.

### Prerequisites

Install Docker and Docker Compose:

```bash
# Install Docker (Raspberry Pi / Debian / Ubuntu)
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Log out and back in, then install docker-compose
sudo apt install docker-compose
```

### Deploy with Docker

```bash
# Clone the repository
git clone https://github.com/jointAxis77/parol6-webcommander.git
cd parol6-webcommander

# Pull and start all services
docker-compose pull
docker-compose up -d
```

!!! success "That's it!"
    The interface is now available at [http://localhost:3000](http://localhost:3000)

### Verify Installation

```bash
# Check all containers are running
docker-compose ps

# View logs
docker-compose logs -f
```

---

## Option 2: Native Installation

For development or customization, install directly on your system.

### System Dependencies

```bash
# Update system
sudo apt-get update

# Install Python 3.9+
sudo apt-get install -y python3 python3-pip python3-venv python3-dev

# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 process manager
sudo npm install -g pm2
```

### Clone Repository

```bash
git clone https://github.com/jointAxis77/parol6-webcommander.git
cd parol6-webcommander
git submodule update --init --recursive
```

### Python Environment

```bash
# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

!!! note "Raspberry Pi OpenCV"
    If `opencv-python` fails on Raspberry Pi, use:
    ```bash
    sudo apt-get install python3-opencv
    ```

### Node.js Dependencies

```bash
cd frontend
npm install
cd ..
```

### Serial Port Access

Grant your user access to the serial port:

```bash
sudo usermod -a -G dialout $USER
```

!!! warning "Logout Required"
    Log out and back in for the group change to take effect.

### Start the System

```bash
# Start all services with PM2
pm2 start ecosystem.config.js

# View logs
pm2 logs

# Access the interface at http://localhost:3000
```

---

## Verify Installation

1. Open [http://localhost:3000](http://localhost:3000) in your browser
2. You should see the 3D robot visualization
3. Check the connection status indicators in the top-right corner

!!! tip "API Documentation"
    FastAPI auto-generated docs are available at [http://localhost:3001/docs](http://localhost:3001/docs)

## Next Steps

- [Configure your system](configuration.md) - Set up serial port and customize settings
- [Quick Start](quick-start.md) - Move your robot for the first time
